import re
import google.generativeai as genai
import os
import psycopg2 
import json
from datetime import datetime
import pandas as pd
from io import StringIO
import common.s3


GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

summary_model = genai.GenerativeModel('gemini-2.0-flash')  # $0.075 /M input  $0.30 /M output tokens 
article_model = genai.GenerativeModel('gemini-2.5-flash')  # $0.10 /M input $0.40 /M output tokens

db_access_url = os.environ.get('DB_ACCESS_URL')

### Underwriter - Researches documents in a cluster
def underwriter_research(cluster_df):
    """
    Research component that analyzes documents in a cluster and creates detailed notes
    for the article writer.
    
    Args:
        cluster_df: DataFrame containing documents in a cluster with columns:
                   'source', 'type', 'title', 'text', 'url', 'keyword'
    
    Returns:
        Dictionary with research notes for each document type
    """
    research_notes = {
        'primary_doc': {},
        'secondary_docs': [],
        'news_articles': []
    }
    
    # Process primary government document
    primary_doc = cluster_df[cluster_df['type'] == 'primary'].iloc[0]
    primary_prompt = f"""
    You are a meticulous research analyst extracting the key information from government documents to write an in depth article.
    
    DOCUMENT:
    Title: {primary_doc['title']}
    Text: {primary_doc['text'][1000:50000]}
    
    Create factual research notes:
    1. **Summary of Key Points**: Detailed summary of the document's main points

    Use bullet points for the following:
    2. **Explicit Actions**: Only actions/decisions directly stated
    3. **Named Entities**: Exact names mentioned in the document
    4. **Specific Data**: Precise numbers, dates, amounts from the text
    5. **Direct Quotes**: Key statements in quotation marks
    6. **Cross-References**: Any references to other documents/policies mentioned
    
    REQUIREMENTS:
    - Mark uncertain information as "[UNCLEAR]"
    - No analysis or interpretation
    Keep response under 500 tokens.
    """
    
    primary_response = summary_model.generate_content(
        primary_prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=700,
            temperature=0.2
        )
    )
    
    research_notes['primary_doc'] = {
        'title': primary_doc['title'],
        'url': primary_doc['url'],
        'notes': primary_response.text
    }
    
    # Process secondary government documents
    secondary_docs = cluster_df[cluster_df['type'] == 'secondary']
    for _, doc in secondary_docs.iterrows():
        secondary_prompt = f"""
        You are a meticulous research analyst extracting the key information from government documents to write an in depth article.
        
        DOCUMENT:
        Title: {doc['title']}
        Text: {doc['text'][1000:50000]}
        
        Create factual research notes:
        1. **Summary of Key Points**: Detailed summary of the document's main points

        Use bullet points for the following:
        2. **Explicit Actions**: Only actions/decisions directly stated
        3. **Named Entities**: Exact names mentioned in the document
        4. **Specific Data**: Precise numbers, dates, amounts from the text
        5. **Direct Quotes**: Key statements in quotation marks
        6. **Cross-References**: Any references to other documents/policies mentioned
        
        REQUIREMENTS:
        - Mark uncertain information as "[UNCLEAR]"
        - No analysis or interpretation
        Keep response under 500 tokens.
        """
        
        secondary_response = summary_model.generate_content(
            secondary_prompt,
            generation_config=genai.GenerationConfig(
                max_output_tokens=600,
                temperature=0.2
            )
        )
        
        research_notes['secondary_docs'].append({
            'title': doc['title'],
            'url': doc['url'],
            'notes': secondary_response.text
        })
    
    # Process news articles
    news_articles = cluster_df[cluster_df['type'] == 'news']
    for _, article in news_articles.iterrows():
        research_notes['news_articles'].append({
            'title': article['title'],
            #'publisher': article['publisher'],
            'url': article['url'],
            'notes': ''
        })
    
    return research_notes


### Article Writer - Creates an article for a cluster based on underwriter's research
def create_cluster_article(research_notes):
    """
    Creates an article for an entire cluster based on the underwriter's research.
    
    Args:
        research_notes: Dictionary with research notes from the underwriter
    
    Returns:
        Dictionary containing the article title and content
    """

    tokens = 2500  

    # Extract information from research notes
    primary_doc = research_notes['primary_doc']
    secondary_docs = research_notes['secondary_docs']
    
    # Create a prompt for the article writer
    system_prompt = f"""
    You are an expert journalist for "Auxiom," specializing in accurate, engaging articles about government policy and current events.
    
    CONTENT REQUIREMENTS:
    - Base content on the provided research notes
    - Use your background knowledge to add context, but do not speculate
    - Use direct quotes exactly as provided in research notes

    Your task: Write a well-structured, engaging article that transforms complex government documents into accessible journalism.

    Output exactly:
    "Title": <Specific, newsworthy headline that captures the core development>,
    "People": <List of specific names of the top (at most) 3 real people mentioned in the documents>
    "Keywords": <List the top (at most) 5 relevant policy/topic keywords>,
    "Article": <Content in HTML format using only <p> tags for paragraphs>
    
    **ENHANCED WRITING FRAMEWORK:**
    
    **Structure Requirements:**
    1. **Lead Paragraph**: Open with the most newsworthy aspect - what happened, who was involved, when, and why it matters
    2. **Context Section**: Provide essential background information
    3. **Key Details**: Present specific actions, decisions, numbers, and quotes
    4. **Impact Analysis**: Explain consequences and significance of the development
    5. **Conclusion**: Summarize significance without speculation

    **Writing Standards:**
    - Use active voice and clear, direct sentences
    - Write in present tense for recent developments
    - Include specific data points (dates, amounts, percentages) when available
    - Quote directly from documents when impactful
    - Explain technical terms in plain language
    - Maintain journalistic objectivity - report facts, not opinions
    
    **Style Guidelines:**
    - Write for an educated general audience
    - Use short paragraphs (2-3 sentences max)
    - Vary sentence length for readability  
    - Create smooth transitions between sections
    - Avoid bureaucratic jargon
    - Be comprehensive but concise
    
    Target length: approximately {tokens} tokens.
    
    **RESEARCH NOTES:**
    
    PRIMARY DOCUMENT:
    Title: {primary_doc['title']}
    {primary_doc['notes']}
    
    SECONDARY DOCUMENTS:
    """
    
    # Add secondary documents
    for i, doc in enumerate(secondary_docs):
        system_prompt += f"""
        Document {i+1}:
        Title: {doc['title']}
        {doc['notes']}
        """
    
    # Define your desired JSON schema
    json_schema = {
        "type": "object",
        "properties": {
            "Title": {
                "type": "string"
            },
            "People": {
                "type": "array",
                "items": {
                    "type": "string"
                }
            },
            "Keywords": {
                "type": "array",
                "items": {
                    "type": "string"
                }
            },
            "Article": {
                "type": "string"
            }
        },
        "required": ["Title", "People", "Article"],
    }

    # Generate the article
    response = article_model.generate_content(
        system_prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=tokens*2,
            temperature=0.3,
            response_mime_type="application/json",
            response_schema=json_schema
        )
    )
    
    # Parse the response as JSON
    article_json = json.loads(response.text)
    title = article_json.get("Title", "Auxiom Article").strip()
    content = article_json.get("Article", "").strip()
    people = article_json.get("People", [])
    keywords = article_json.get("Keywords", [])

    # Generate article overview bullet points
    overview_bullets = generate_article_overview(title, content)
    
    # Prepend overview to the beginning of the article content
    final_content = overview_bullets + content
    
    time = round(len(final_content.split()) / 175)  # Average reading speed is 175 words per minute

    return {
        'title': title,
        'content': final_content,
        'people': people,
        'tags': keywords,
        'research_notes': research_notes,
        'time': time
    }


def generate_article_overview(article_title, article_content):
    """
    Generates bullet points overview of the article to be added at the beginning.
    
    Args:
        article_title: Title of the article
        article_content: Content of the article (HTML format)
    
    Returns:
        String containing bullet points with <ul> and <li> tags
    """
    overview_prompt = f"""
    Create a concise bullet point overview for this article that will appear at the beginning.
    
    Article Title: {article_title}
    Article Content: {article_content}
    
    REQUIREMENTS:
    - Extract 3-5 key points that give readers a quick overview
    - Focus on the most important facts, decisions, or developments
    - Use clear, concise language suitable for scanning
    - Include specific details (names, numbers, dates) when relevant
    - Write each bullet point as a complete, informative sentence
    - Do not repeat the article title

    FORMAT:
    Return only the bullet points formatted with <ul> and <li> tags. Do not include any markings beyond <ul> and <li>. This will be embedded in a larger html document.
    Do not include any other text, formatting, or metadata.
    Example:
    <ul>
    <li>Point 1 with specific details</li>
    <li>Point 2 with specific details</li>
    <li>Point 3 with specific details</li>
    </ul>
    
    Keep each bullet point under 25 words. Focus on WHAT HAPPENED and KEY DETAILS.
    """
    
    response = summary_model.generate_content(
        overview_prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=300,
            temperature=0.2
        )
    )
    
    return response.text.strip()


def generate_summary(article_title, article_content):
    """
    Generates a newsletter blurb about the article for email delivery.
    
    Args:
        article_title: Title of the article
        article_content: Content of the article
        research_notes: Dictionary with research notes from the underwriter
    
    Returns:
        Dictionary with newsletter blurb information
    """
    def _clean_summary_text(text):
        text = re.sub(r'\*', '', text)
        return re.sub(r'\s+', ' ', text.replace('\n', ' ').replace('\\', '')).strip()
    
    # Create newsletter blurb using the article content
    blurb_prompt = f"""
    Create a compelling newsletter blurb for this government policy article.
    
    Article Title: {article_title}
    Article Content: {article_content[:2500]}
    
    REQUIREMENTS:
    - Extract only the most newsworthy elements from the article
    - Lead with what changed, who's affected, or what's at stake
    - Use concrete details (numbers, names, dates) when available
    - Write in active voice with strong, specific verbs
    - Make it scannable but substantial
    - End with impact or significance, not generic encouragement
    
    STYLE:
    - 2-3 sentences maximum
    - Under 80 tokens total
    - Write like breaking news, not marketing copy
    - Use present tense for recent developments
    
    Focus on WHAT HAPPENED and WHY IT MATTERS. No fluff or promotional language.
    """
    
    response = summary_model.generate_content(
        blurb_prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=120,
            temperature=0.25
        )
    )
    
    summary = _clean_summary_text(response.text)
    
    print(f"Article Title: {article_title}")
    print(f"Summary: {summary}")
    
    return summary

def parse_sources(cluster_df):
    """
    Process the cluster_df object and extract source information.
    
    Args:
        cluster_df: DataFrame containing documents in a cluster with columns:
                   'source', 'type', 'title', 'text', 'url', 'keyword'
    
    Returns:
        List of dictionaries containing source information with keys:
        'type', 'url', 'publisher', 'title'
    """
    sources = []
    
    for _, row in cluster_df.iterrows():
        source_info = {
            'type': 'primary' if row['type'] in ['primary', 'secondary'] else 'news',
            'url': row['url'],
            'source': row['source'],
            'title': row['title']
        }
        sources.append(source_info)
    
    return sources


def update_db(article_title, article_content, summary, people, time, topics, tags, cluster_id, sources):
    """
    Update database with single article information.
    Capitalizes each word in people, topics, and tags.
    """

    try:
        conn = psycopg2.connect(dsn=db_access_url, client_encoding='utf8')
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE articles 
            SET title = %s, content = %s, summary = %s, people = %s::jsonb, duration = %s, topics = %s::jsonb, tags = %s::jsonb, date = %s, sources = %s::jsonb
            WHERE id = %s
        """, (
            article_title,
            article_content,
            summary,
            json.dumps(people),
            time,
            json.dumps(topics),
            json.dumps(tags),
            datetime.now(),
            json.dumps(sources),
            cluster_id
        ))

        conn.commit()
        print(f"Successfully updated cluster {cluster_id} with article information")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_cluster_metadata(cluster_id):
    """
    Retrieve cluster metadata from database and S3.
    
    Args:
        cluster_id: The cluster ID to retrieve metadata for
        
    Returns:
        DataFrame containing cluster documents or None if error
    """
    try:
        conn = psycopg2.connect(dsn=db_access_url, client_encoding='utf8')
        cursor = conn.cursor()
        
        cursor.execute("SELECT key FROM articles WHERE id = %s", (cluster_id,))
        result = cursor.fetchone()
        
        if not result:
            print(f"No cluster found with ID {cluster_id}")
            return None
            
        cluster_key = result[0]
        
        # Retrieve metadata from S3
        articles_json = common.s3.get_metadata(cluster_key)
        if articles_json is None:
            print(f"Failed to retrieve metadata for cluster {cluster_id}")
            return None
            
        # Parse JSON to DataFrame
        import pandas as pd
        cluster_df = pd.read_json(StringIO(articles_json))
        
        return cluster_df
        
    except Exception as e:
        print(f"Error retrieving cluster metadata for {cluster_id}: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def process_single_cluster(cluster_id):
    """
    Process a single cluster and generate an article.
    
    Args:
        cluster_id: The cluster ID to process
        
    Returns:
        Boolean indicating success or failure
    """
    try:
        print(f"Processing cluster {cluster_id}")
        
        # Step 1: Retrieve cluster metadata from S3
        cluster_df = get_cluster_metadata(cluster_id)
        if cluster_df is None or cluster_df.empty:
            print(f"Failed to retrieve metadata for cluster {cluster_id}")
            return False
        
        # Step 2: Underwriter researches the cluster
        research_notes = underwriter_research(cluster_df)
        
        # Step 3: Article writer creates an article for the cluster
        article = create_cluster_article(research_notes)
        
        # Step 4: Generate newsletter blurb
        summary = generate_summary(
            article['title'], 
            article['content']
        )

        topics = cluster_df['keyword'].unique().tolist()

        sources = parse_sources(cluster_df)

        # Step 5: Update database
        update_db(article['title'], article['content'], summary, article['people'], article['time'], topics, article['tags'], cluster_id, sources)
        
        print(f"Successfully processed cluster {cluster_id}")
        return True
        
    except Exception as e:
        print(f"Error processing cluster {cluster_id}: {e}")
        return False


# Main Execution
def handler(payload):
    cluster_ids = payload.get("clusters", [])
    
    print(f"Processing {len(cluster_ids)} clusters: {cluster_ids}")
    
    successful_clusters = []
    failed_clusters = []
    
    # Process each cluster in the chunk
    for cluster_id in cluster_ids:
        success = process_single_cluster(cluster_id)
        if success:
            successful_clusters.append(cluster_id)
        else:
            failed_clusters.append(cluster_id)
    
    print(f"Processing complete. Successful: {len(successful_clusters)}, Failed: {len(failed_clusters)}")
    if failed_clusters:
        print(f"Failed clusters: {failed_clusters}")


if __name__ == "__main__":
    import pickle as pkl
    
    # Test with sample data - use first cluster as example
    cluster = pkl.loads(open("tmp/example_cluster.pkl", "rb").read())
    cluster_id = 3887

    cluster_df = pd.read_json(StringIO(cluster))
        
    # Step 1: Underwriter researches the cluster
    research_notes = underwriter_research(cluster_df)
    
    # Step 2: Article writer creates an article for the cluster
    article = create_cluster_article(research_notes)
    
    # Step 3: Generate newsletter blurb
    summary = generate_summary(
        article['title'], 
        article['content']
    )

    topics = cluster_df['keyword'].unique().tolist()
    sources = parse_sources(cluster_df)

    update_db(article['title'], article['content'], summary, article['people'], article['time'], topics, article['tags'], cluster_id, sources)

    print("---- GENERATED ARTICLE ----")
    print(f"Title: {article['title']}")
    print(f"Content: {article['content']}")
    print(f"Summary: {summary}")
    print(f"People: {article['people']}")
    print(f"Time to read: {article['time']} minutes")
    print(f"Tags: {article['tags']}")
    print(f"Topics: {topics}")
    print("\n" + "-"*50)
