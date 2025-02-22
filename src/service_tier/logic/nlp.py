
# set up environment variables for API keys in terminal e.g export GOOGLE_API_KEY=your_key, export OPENAI_API_KEY=your_key

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

from logic.pulse_output import PulseOutput
import common.sqs
import common.s3



TEMP_BASE = "/tmp"

GOOGLE_API_KEY= os.environ.get('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

summary_model = genai.GenerativeModel('gemini-2.0-flash') # 15 RPM, $0.030 /million output tokens for higher RPM
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

def summarize(title, text, use = 'summary'):
    if use == 'email' or 'title':
        tokens = 100 # email title / summaries
    else: # pulse summaries (depracated)
        tokens = 500
        
    if use == 'title':
        prompt = f"Create a title for the podcast based on the title of the academic articles discussed. The title should be attention-grabbing, professional, and informative.\
                    Only include the generated title itself; avoid any introductions, explanations, or meta-comments. This generated title will be in an email newsletter.\
            Titles: {text}"
    else: # email header case
        prompt = f"Provide a succinct TLDR summary about the academic article titled '{title}'.\
            Highlight the key details that help the user decide whether the source is worth reading. Only include the summary itself;\
            avoid any introductions, explanations, or meta-comments. This summary will be in an email newsletter. Make the summary attention-grabbing and informative.\
            Text: {text}"
    
    enforce_rate_limit("summary_model")
    response = summary_model.generate_content(prompt,
                                                generation_config = genai.GenerationConfig(
                                            max_output_tokens=tokens,
                                            temperature=0.25))
    return response.text


### Single article podcast segment
def academic_segment(text, title, plan = 'free'):
    if plan == 'free':
        tokens = 180 # ~ 1:20 minute
    else: # premium
        tokens = 250 # ~ 1:40 minutes

    system_prompt =f"""
        You are a professional podcast script writer for a podcast named Auxiom. Your task is to write a single section of a script to be sent to a text-to-speech model where 
        **HOST 1** (Mia) and **HOST 2** (Leo) have an academic dialouge using the article below. 
        FORMAT
        - Mark the script with **HOST 1** and **HOST 2** for each conversational turn
        - HOST 1 = Mia and HOST 2 = Leo
        - This is an intermeadiate segment. Only include the segment itself. avoid any introductions, explanations, or meta-comments
        EXTRACT FROM TEXT
        - Use specific details from the text relevant to the goals, methods, and results
        - Create a sequence, exploring the details of each article one by one
        - Be critical if the article has limitations
        SPEECH TIPS
        - These hosts are charismatic and professional. They are excited about the information.
        - Since this is for a text-to-speech model, use short sentences, omit any non-verbal cues, complex sentences/phrases, or acronyms.
        - Sound human-like, be original and dynamic in the conversation.
        - Include filler words like 'uh' or repeat words in the sentences to make the conversation more natural.
        - Insert pauses using a hypen (-) to indicate a pause.

        Example: 
        **HOST 1**: Moving on, we have an article about X titled Y.
        **HOST 2**: That's right. The article finds Z...
        **HOST 1**: That's super cool! So they essentially found that X?
        ...

        Remember: This segment must be at least {tokens} tokens long. Do not produce fewer.
        Article: {title}
        Text: {text}"""

    if plan == 'free':
        enforce_rate_limit("summary_model")
        response = summary_model.generate_content(system_prompt, 
                                            generation_config = genai.GenerationConfig(
                                            max_output_tokens=tokens+50,
                                            temperature=0.3))
    else: # premium
        enforce_rate_limit("script_model")
        response = script_model.generate_content(system_prompt, 
                                            generation_config = genai.GenerationConfig(
                                            max_output_tokens=tokens+100,
                                            temperature=0.3))
    return response.text


### Podcast formatting and reviewing agent
def review_script(script, tokens):
    prompt = f"Review the script for the podcast episode, for input to a text-to-speech model. Refine any wording that may be difficult for a text-to-speech model.\
              Make sure the content flows well and is engaging. Ensure the structure is marked with **HOST 1** and **HOST 2** at each conversational turn. \
              Remove or replace acronyms where necessary. Do not add any unecessary phrases; this will be fed directly to a text-to-speech model.\
        Script: {script}"

    enforce_rate_limit("script_model")
    response = script_model.generate_content(prompt, generation_config = genai.GenerationConfig(
                                        max_output_tokens=tokens+250,
                                        temperature=0.10))
    return response.text

def make_script(texts, titles, name, plan = 'free'):
    if plan == 'plus':
        tokens = 1600
        summaries = summaries
    else: # free
        tokens = 800
        texts = texts[:3]

    segments = []
    for i in range(len(texts)):
        segments.append(academic_segment(texts[i], titles[i], plan))
    
    print('Processed ', len(segments), ' articles')
    
    ### Merge components with transitions, moderate content/speech
    system_prompt =f"""
    You are a senior editor for a podcast Auxiom. Your task is to take the segments written by other agents, refine their content, and merge them into a consistent flow.
    INPUT
    - Your agents have written multiple segments, with 1 article discussed in each
    - The scripts should be marked according to the FORMAT below
    FORMAT
    - The script should be marked with **HOST 1** and **HOST 2** for each conversational turn
    - HOST 1 = Mia and HOST 2 = Leo
    - Make the conversation {tokens} tokens long.
    TASK
    - Merge the components, ensure the format is consistent (as above)
    - Refine the content to be more engaging
    - OPEN WITH: Hello {name}, welcome back to Auxiom!
    - CLOST WITH: 'Thanks for listening, stay tuned for more episodes.'
    SPEECH TIPS
    - Since this is for a text-to-speech model, use short sentences, omit any non-verbal cues, complex sentences/phrases, or acronyms.
    
    Example: 
    **HOST 1**: Hello {name}! Today we have an article about X...
    **HOST 2 **: That's right. The article discusses Y...
    **HOST 1**: How does this article relate to Z?
    ...
    Remember: This script must be {tokens} tokens long. Do not produce fewer.

Articles: """
    for i in range(len(segments)):
        system_prompt += f" Article {i} - {titles[i]}: {segments[i]}"     
       
    enforce_rate_limit("script_model")
    response = script_model.generate_content(system_prompt, 
                                      generation_config = genai.GenerationConfig(
                                        max_output_tokens=tokens+100,
                                        temperature=0.25))
    
    ret = review_script(response.text, tokens)

    return ret

def generate_script(all_data, name, plan = 'free'):
    for index, row in all_data.iterrows():
        title = row['title']
        text = row['text']

    # generate script
    texts = all_data['text'].tolist()
    titles = all_data['title'].tolist()
    script = make_script(texts, titles, name, plan)
    return script

def generate_email_headers(all_data):
    def _clean_summary_text(text):
        text = re.sub(r'\*', '', text)
        return re.sub(r'\s+', ' ', text.replace('\n', ' ').replace('\\', '')).strip()

    podcast_description = all_data[['title', 'url', 'text']].copy()

    podcast_description['description'] = podcast_description.apply(
        lambda row: _clean_summary_text(summarize(row['title'], row['text'], use='email')),
        axis=1)
    
    titles = podcast_description['title'].tolist()
    titles = ", ".join(titles)
    episode_title = summarize("", titles, use = 'title')
    episode_title = _clean_summary_text(episode_title)

    return podcast_description, episode_title

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
        # Remove :
        statement = statement.replace(':', '')
        # Remove (Leo): and (Mia): if exist
        ret = statement.replace('(Leo)', '').replace('(Mia)', '')

        # Replace '\n' with a space
        ret = ret.replace('\n', ' ')
        # remove '& 1' or '& 2'
        ret = re.sub(r'& \d', '', ret)
        # Remove Markdown-style (*)
        ret = re.sub(r'\*\*\:', '', ret)
        ret = re.sub(r'\*', '', ret)
        # Ensure no extra spaces
        ret = re.sub(r'\s+', ' ', ret).strip()
        
        if ret != '':
          output_text.append(ret)

    print(output_text)
    return output_text

def create_conversational_podcast(all_data, name, plan='free'):

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
                model="tts-1",
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
    script = generate_script(all_data, name, plan=plan)
    turns = clean_text_for_conversational_tts(script)

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

# Main Execution
def handler(payload):
    user_id = payload.get("user_id")
    user_name = payload.get("user_name")
    user_email = payload.get("user_email")
    plan = payload.get("plan")
    episode = payload.get("episode")
    ep_type = payload.get("ep_type")

    pulse = PulseOutput(user_id, episode)
    all_data = pulse.all_data

    if plan == 'free':
        all_data = all_data.head(3)

    num_turns = create_conversational_podcast(all_data, user_name, plan = plan)

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