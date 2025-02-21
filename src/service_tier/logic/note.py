# Input: User Note (individual line)
# Output: Perplexity summary

import requests
import pandas as pd
import re
import time
#Gemini stuff
import google.generativeai as genai
# merge chunks
from pydub import AudioSegment
import os
from openai import OpenAI

import time
from threading import Lock

import common.sqs
import common.s3

TEMP_BASE = "/tmp"

GOOGLE_API_KEY= os.environ.get('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

summary_model = genai.GenerativeModel('gemini-1.5-flash') # 15 RPM, $0.030 /million output tokens for higher RPM
script_model = genai.GenerativeModel('gemini-1.5-pro') # 2 RPM, $5 /million output tokens for higher RPM

# implement counters to ensure we are below rate limits
# Global rate-limit counters and locks
summary_model_counter = 0
summary_model_lock = Lock()
script_model_counter = 0
script_model_lock = Lock()

# Timestamps to track last reset
time_last_reset_summary_model = time.time()
time_last_reset_script_model = time.time()

# Rate limit configurations
SUMMARY_MODEL_RPM_LIMIT = 15
SCRIPT_MODEL_RPM_LIMIT = 2


def perplexity(user_input: str) -> dict:
    url = "https://api.perplexity.ai/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.environ.get('PERPLEXITY_API_KEY')}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.1-sonar-small-128k-online",
        "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a research assistant for the user. Provide the user with an in-depth summary of the this single line from their notes, citing scholarly articles and news sources."
                        ),
                    },
                    {   
                        "role": "user",
                        "content": (
                            user_input
                        ),
                    },
                ]
    }
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


######## NLP Portion ########

# Function to enforce rate limits
def enforce_rate_limit(model_name):
    global summary_model_counter, script_model_counter
    global time_last_reset_summary_model, time_last_reset_script_model

    current_time = time.time()

    if model_name == "summary_model":
        with summary_model_lock:
            elapsed_time = current_time - time_last_reset_summary_model

            if elapsed_time >= 60:  # Reset every minute
                summary_model_counter = 0
                time_last_reset_summary_model = current_time

            if summary_model_counter >= SUMMARY_MODEL_RPM_LIMIT:
                wait_time = 60 - elapsed_time
                print(f"Rate limit reached for summary_model. Waiting for {wait_time:.2f} seconds.")
                time.sleep(wait_time)
                summary_model_counter = 0
                time_last_reset_summary_model = time.time()

            summary_model_counter += 1

    elif model_name == "script_model":
        with script_model_lock:
            elapsed_time = current_time - time_last_reset_script_model

            if elapsed_time >= 60:  # Reset every minute
                script_model_counter = 0
                time_last_reset_script_model = current_time

            if script_model_counter >= SCRIPT_MODEL_RPM_LIMIT:
                wait_time = 60 - elapsed_time
                print(f"Rate limit reached for script_model. Waiting for {wait_time:.2f} seconds.")
                time.sleep(wait_time)
                script_model_counter = 0
                time_last_reset_script_model = time.time()

            script_model_counter += 1

# Wrap API calls to enforce rate limits
def summarize_with_rate_limit(arg, use = 'script'):
    enforce_rate_limit("summary_model")        
    return summarize(arg, use)

def make_script_with_rate_limit(topics, summaries, sources, name):
    enforce_rate_limit("script_model")
    return make_script(topics, summaries, sources, name)


def summarize(arg, use = 'script'):
    if use == 'title':
        prompt = f"Create a title for the podcast based on the title of the academic articles discussed. The title should be attention-grabbing, professional, and informative.\
                    Only include the generated title itself; avoid any introductions, explanations, or meta-comments. This generated title will be in an email newsletter.\
            Titles: {arg}"
    elif use == 'article_title':
        prompt = f"Scrape the title from this webpage. If the title is not directly available, infer a title from the contents.\
                    Only include the generated title itself; avoid any introductions, explanations, or meta-comments. This title will be in an email newsletter.\
            URL: {arg}"
    elif use == 'email':
        prompt = f"Provide a succinct TLDR summary about the article linked'.\
        Highlight the key details that help the user decide whether the source is worth reading. Only include the summary itself;\
        avoid any introductions, explanations, or meta-comments. This summary will be in an email newsletter. Make the summary attention-grabbing and informative.\
        URL: {arg}"
    else:
        prompt = f"Provide a clear summary of the source. Highlighting the key details that fundamentally explain the contents of the source. URL: {arg}"
    
    response = summary_model.generate_content(prompt)
    return response




def make_script(topics, summaries, sources, name):
    tokens = min(1500, len(topics)*500)

    system_prompt =f"""
    Act as a professional podcast script writer for the podcast Auxiom. Your task is to create a script to be sent to a text-to-speech model where **HOST 1** and **HOST 2** are discussing {len(topics)} topic(s) that the user has requested.
    - When the speakers are referring to each other HOST 1 = Mia and HOST 2 = Leo
    - Mark the script with **HOST 1** and **HOST 2** for each conversational turn
    - Always maintain the names of the hosts and their order. HOST 1 is always Mia, HOST 2 is always Leo.
    - Create a sequence, exploring each topic in detail and equally allocating time. The sequence should be one topic at a time. Do not revisit topics.
    - Make sure to explain the fundamental origin of the topics. Dive deep into details from the sources.
    - These hosts are charismatic and professional, and casual. They are excited about the information.
    - Make the conversation at least {tokens} tokens long.
    - Since this is for a text-to-speech model, use short sentences, omit any non-verbal cues, and don't use complex sentences/phrases.
    - Include filler words like 'uh' or repeat words in many of the sentences to make the conversation more natural.
    - Close with 'Thanks for listening to Astra, stay tuned for more episodes.'
    - This is tailored for one listener ({name}), say hello at the beginning.
    Example: 
    **HOST 1**: Today we have a super exciting show for you. We're talking about the latest in X, Y, and Z.
    **HOST 2**: That's right. These new developments are really pushing the boundaries of this field.
    **HOST 1**: Absolutely. Let's dive right in. So, X is being used in ...
    **HOST 2**: What developments made X possible?
    ... (continue the conversation)

    Remember: This script must be {tokens} tokens long. Do not produce fewer.

Topics: """
    for i in range(len(topics)):
        system_prompt += f" Topic {i} - {topics[i]}; summary: {summaries[i]} ; sources: {sources[i]}"        

    response = script_model.generate_content(system_prompt, 
                                      generation_config = genai.GenerationConfig(
                                        max_output_tokens=tokens+800,
                                        temperature=0.25))
    response = review_script(response, tokens)
    
    return response

def review_script(script, tokens = 2000):
    prompt = f"Review the script for the podcast episode, making it sound very human-like. Refine any wording that may be difficult for a text-to-speech model. Make sure the content flows well and is engaging.\
        Retain the structure, including the conversational turns between the hosts. Remove or replace acronyms where necessary. Do not add any unecessary phrases as this will be fed directly to a text-to-speech model.\
        Script: {script}"
    response = script_model.generate_content(prompt, generation_config = genai.GenerationConfig(
                                        max_output_tokens=tokens+800,
                                        temperature=0.20))
    return response


def generate_script(all_data, name):
    # generate script
    summaries = all_data['summary'].tolist()
    topics = all_data['topic'].tolist()
    sources = all_data['sources'].tolist()

    script = make_script_with_rate_limit(topics, summaries, sources, name)
    print(f'Script: {script.text}')
    return script.text


def clean_text_for_conversational_tts(input_text):
    """
    Cleans text for Text-to-Speech by:
    - Replacing '\n' with spaces.
    - Removing Markdown-style formatting like '**bold**'.
    """
    # Match and extract statements for both HOST 1 and HOST 2.
    pattern = r"HOST [12]([^\n]+)"
    statements = re.findall(pattern, input_text)

    output_text = []
    for statement in statements:
        # Remove (Aria): and (Leo): if exist
        ret = statement.replace('(Leo):', '').replace('(Mia):', '')

        # Replace '\n' with a space
        ret = ret.replace('\n', ' ')
        # remove '& 1' or '& 2'
        ret = re.sub(r'& \d', '', ret)
        # Remove Markdown-style (*)
        ret = re.sub(r'\*\*\:', '', ret)
        ret = re.sub(r'\*', '', ret)
        # Ensure no extra spaces
        ret = re.sub(r'\s+', ' ', ret).strip()
        
        output_text.append(ret)

    print(output_text)
    return output_text

def create_conversational_podcast(all_data, name, plan='free', ep_type='pulse'):

    def _create_line(client, host, line, num, chunk):

        if host == 1:
            # female
            voice = 'nova'
        else: # host = 2
            # male
            voice = 'onyx'

        output_file = f"{TEMP_BASE}/conversation/{host}/line_{num}_{chunk}.mp3"

         # Ensure the output directory exists
        output_dir = os.path.dirname(output_file)
        os.makedirs(output_dir, exist_ok=True)
        
        try:
            response = client.audio.speech.create(
                model="tts-1", # (use "tts-1" or "tts-1-hd")
                voice=voice,
                input=line
            )

            # Save the response content (audio) to a file
            with open(output_file, "wb") as audio_file:
                audio_file.write(response.content)

            print(f"Audio file saved as {output_file}")

        except Exception as e:
            print(f"An error occurred while generating TTS: {e}")
        
        if not os.path.exists(output_file) or os.path.getsize(output_file) == 0:
            raise ValueError(f"Failed to create audio file: {output_file}")


    # Instantiates a client
    script = generate_script(all_data, name)
    turns = clean_text_for_conversational_tts(script)

    turns = turns[:4] # for testing purposes

    key = os.environ.get("OPENAI_API_KEY")
    client = OpenAI(api_key=key)

    for index, sentence in enumerate(turns):
        host = 1 if index % 2 == 0 else 2

        # handle lines longer than API limit
        if len(sentence) > 4096:
            # Chunk into 4096 characters
            chunks = [sentence[i:i + 4096] for i in range(0, len(sentence), 4096)]

            for chunk_index, chunk in enumerate(chunks):
                _create_line(client, host, chunk, index, chunk_index)

            chunk_files = [f"{TEMP_BASE}/conversation/{host}/line_{index}_{i}.mp3" for i in range(len(chunks))]
            combined_audio = AudioSegment.empty()
            for file in chunk_files:
                audio_segment = AudioSegment.from_mp3(file)
                combined_audio += audio_segment

            print(f"Combined chunked audio for line {index}")
            combined_output_file = f"{TEMP_BASE}/conversation/{host}/line_{index}_0.mp3"
            combined_audio.export(combined_output_file, format="mp3")

            # Clean up individual chunk files
            for file in chunk_files:
                os.remove(file)
        else:
            _create_line(client, host, sentence, index, 0)

        time.sleep(60 / 500)  # rate limit = 500 requests per minute

    return len(turns)

def write_to_s3(num_turns, user_id, episode_number):
    # merge audio files
    # Create a new AudioSegment object
    print("Merging audio files...")

    final_audio = AudioSegment.from_mp3(f"{TEMP_BASE}/conversation/1/line_0_0.mp3")
    for i in range(1, num_turns):

        audio = AudioSegment.from_mp3(f"{TEMP_BASE}/conversation/{1 if i % 2 == 0 else 2}/line_{i}_0.mp3")
        # clean up -- TURN ON IF TESTING LOCAL
        #os.remove(f"data/conversation/{1 if i % 2 == 0 else 2}/line_{i}_0.mp3")

        final_audio = final_audio.append(audio)

    print("Audio files merged.")
    # add intro music
    # Load the intro music from s3
    common.s3.restore_from_system("INTRO", f"{TEMP_BASE}/intro_music.mp3")

    intro_music = AudioSegment.from_file(f"{TEMP_BASE}/intro_music.mp3")
    final_audio = intro_music.append(final_audio, crossfade=1000)

    print("Intro music added.")
    final_audio.export(f"{TEMP_BASE}/podcast.mp3", format="mp3")
    print(f"Conversation audio file saved as {TEMP_BASE}/podcast.mp3")
    # Export the final audio
    common.s3.save(user_id, episode_number, "PODCAST", f"{TEMP_BASE}/podcast.mp3")

    print("Audio file uploaded to S3.")

def generate_email_headers(all_data):
    def _clean_summary_text(text):
        text = re.sub(r'\*', '', text)
        return re.sub(r'\s+', ' ', text.replace('\n', ' ').replace('\\', '')).strip()

    rows = []
    for row in all_data.iterrows():
        citations = row['citations']
        for url in citations:
                summary = summarize_with_rate_limit(url, use = 'email').text
                summary = _clean_summary_text(summary)
                title = summarize_with_rate_limit(url, use = 'article_title').text
                title = _clean_summary_text(title)

                rows.append({'description': summary, 'title': title, 'url': url})

    podcast_description = pd.DataFrame(rows)
    
    titles = podcast_description['title'].tolist()
    titles = ", ".join(titles)

    episode_title = summarize_with_rate_limit("", titles, use = 'title')
    episode_title = _clean_summary_text(episode_title.text)

    return podcast_description, episode_title


def get_data(user_topics):
    all_data = pd.DataFrame(user_topics, columns=['topic'])
    all_data['summary'] = None
    all_data['citations'] = None
    all_data['sources'] = None


    for index, row in all_data.iterrows():
        response = perplexity(row['topic'])
        all_data.at[index, 'summary'] = response['choices'][0]['message']['content']
        citations = response['citations']
        citations = citations[:3]
        all_data.at[index, 'citations'] = citations
        sources = {}

        for url in citations:
            summary = summarize_with_rate_limit(url, use = 'script')
            
            sources[url] = summary.text
        
        # create string of sources
        sources = [f"{k}: {v}" for k, v in sources.items()]

        all_data.at[index, 'sources'] = sources

    print(all_data.head())
    return all_data


def handler(payload):
    user_id = payload.get("user_id")
    user_name = payload.get("user_name")
    user_email = payload.get("user_email")
    plan = payload.get("plan")
    episode = payload.get("episode")
    user_topics = payload.get("notes")

    print(user_topics)

    all_data = get_data(user_topics)

    num_turns = create_conversational_podcast(all_data, user_name)

    write_to_s3(num_turns, user_id, episode)

    email_description, episode_title = generate_email_headers(all_data)

    # Save the email description to S3
    common.s3.save_serialized(user_id, episode, "EMAIL", {
        "email_description": email_description,
        "episode_title": episode_title
    })

    # Send message to SQS
    try:
        next_event = {
            "action": "e_email",
            "payload": { 
            "user_id": user_id,
            "user_email": user_email,
            "episode": episode,
            "ep_type": ep_type
            }
        }
        common.sqs.send_to_sqs(next_event)
        print(f"Sent message to SQS for next action {next_event['action']}")
    except Exception as e:
        print(f"Exception when sending message to SQS {e}")

if __name__ == "__main__":
    handler(None)

    #user_topics = ['Latest updates on the Google Willow Chip', 'What are the latest trends on the Chinese real estate market?', 'What makes ozempic so effective?']
    #name = 'Rahil'

    #all_data = get_data(user_topics)

    #create_conversational_podcast(all_data, name)