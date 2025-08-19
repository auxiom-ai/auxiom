import boto3
import json
from botocore.exceptions import ClientError
import os
import psycopg2

PUPPET_QUEUE_URL = os.getenv("PUPPET_QUEUE_URL")
SCRAPER_QUEUE_URL = os.getenv("SCRAPER_QUEUE_URL")

DB_ACCESS_URL = os.getenv('DB_ACCESS_URL')

def get_unique_keywords(conn):
    """
    Fetch all unique keywords from users table
    
    Args:
        conn: psycopg2 connection object
    
    Returns:
        list: List of unique keywords
    """
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM get_unique_keywords()")
            keywords = [row[0] for row in cur.fetchall()]
            return keywords
    except psycopg2.Error as e:
        print(f"Error fetching keywords: {e}")
        return []

def chunked_list(lst, chunk_size):
    """Split list into chunks of specified size"""
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]

def send_to_scraper_queue(message):
    sqs = boto3.client('sqs')
    response = sqs.send_message(
        QueueUrl=SCRAPER_QUEUE_URL,
        MessageBody=json.dumps(message)
    )

def handler(payload):
    """
    Main Lambda handler to dispatch messages to SQS.
    """
    print("Starting the dispatch process to SQS queue.")

    conn = psycopg2.connect(DB_ACCESS_URL)
    topics = get_unique_keywords(conn)
    conn.close()
    
    sqs = boto3.client('sqs')
    CHUNK_SIZE = 5
    
    # Split topics into chunks of 20
    topic_chunks = chunked_list(topics, CHUNK_SIZE)
    print(f"Total topics to dispatch: {len(topics)}")
    for chunk in topic_chunks:
        message = {
                'action': 'e_news',
                "payload": {
                    'topics': chunk
                }
            }
        try:
            send_to_scraper_queue(message)
            
        except ClientError as e:
            error_info = {
                'topics': chunk,
                'error': str(e)
            }
            print(f"Failed to send message in SCRAPER_QUEUE_URL: {error_info}")
        
        message = {
            'action': 'e_gov',
            "payload": {
                'topics': chunk
            }
        }
        try:
            send_to_scraper_queue(message)
            
        except ClientError as e:
            error_info = {
                'topics': chunk,
                'error': str(e)
            }
            print(f"Failed to send message in SCRAPER_QUEUE_URL: {error_info}")
            
        # Add Congress scraper dispatch
        message = {
            'action': 'e_congress',
            "payload": {
                'topics': chunk
            }
        }
        try:
            send_to_scraper_queue(message)
            
        except ClientError as e:
            error_info = {
                'topics': chunk,
                'error': str(e)
            }
            print(f"Failed to send message in SCRAPER_QUEUE_URL: {error_info}")
            
    print(f"Dispatched {len(topics)} topics in {len(topic_chunks)} chunks")
    
    return {
        "statusCode": 200,
        "body": "Topics dispatched successfully"
    }
