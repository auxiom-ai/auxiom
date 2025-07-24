import os
import requests
import logging
import json
import datetime
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

from logic.article_resource import ArticleResource # Assuming this class is defined elsewhere

logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

# Congress Documents Integration
class Congress(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)
        self.fuzzy_threshold = 95
        self.api_key = os.environ.get('CONGRESS_API_KEY')
        # Note: self.search_url is currently not used in get_bills.
        # It points to an NREL API, not the Congress.gov API.
        # Consider removing it if it's not used elsewhere.
        self.search_url = f"https://developer.nrel.gov/api/alt-fuel-stations/v1.json?limit=1&api_key={self.api_key}"
        self.headers = {"Content-Type": "application/json"}

        self.today = datetime.date.today()
        self.time_constraint = self.today - datetime.timedelta(days=7)
        
        # Initialize semantic similarity model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.similarity_threshold = 0.3  # Minimum similarity score to include bill

    def get_bills(self):
        """
        Fetch recent bills from the Congress API matching user topics,
        including their constructed bill_id and concatenated summaries as text.
        Returns a list of dicts with bill info and text.
        """
        try:
            results = []
            seen_titles = set()
            # Define the minimum character length for full_text
            MIN_FULL_TEXT_LENGTH = 50 # You can adjust this value as needed

            for topic in self.user_input:
                # Remove datetime restrictions to search all bills
                url = (f"https://api.congress.gov/v3/bill?query={topic}"
                       f"&limit=30" # Using the original pageSize value as limit
                       f"&api_key={self.api_key}")

                try:
                    print(f"Searching for bills related to: '{topic}' using URL: {url}")
                    response = requests.get(url, headers=self.headers)

                    if response.status_code == 200:
                        data = response.json()
                        bills = data.get('bills', [])
                        print(f"Found {len(bills)} bills for topic: '{topic}'")

                        if not bills:
                            continue

                        for i, bill in enumerate(bills):
                            title = bill.get('title', '')
                            if not title:
                                continue

                            # Fuzzy duplicate check (retained as per original code)
                            if self._is_duplicate_title(title, seen_titles):
                                print(f"Skipping duplicate bill: {title}")
                                continue
                            seen_titles.add(title.lower().strip())

                            congress_num = bill.get('congress')
                            bill_type = bill.get('type').lower() # Ensure bill_type is lowercase for consistency
                            bill_number = bill.get('number')

                            bill_identifier = None
                            if congress_num and bill_type and bill_number:
                                # Example: "hr3876-117"
                                bill_identifier = f"{bill_type}{bill_number}-{congress_num}"
                            
                            text_url = None
                            full_text = '' # Initialize full_text as an empty string

                            if bill_identifier and congress_num and bill_type and bill_number:
                                # Current URL points to the summaries endpoint, as per your last snippet
                                text_url = (f"https://api.congress.gov/v3/bill/{congress_num}/"
                                            f"{bill_type}/{bill_number}/summaries?api_key={self.api_key}")
                                
                                #print(f"Attempting to fetch summaries for bill ID: {bill_identifier} from URL: {text_url}")
                                text_resp = requests.get(text_url, headers=self.headers)

                                if text_resp.status_code == 200:
                                    text_data = text_resp.json()
                                    # --- FIX: Process the 'summaries' list to get a single string ---
                                    summaries_list = text_data.get('summaries', [])
                                    
                                    if isinstance(summaries_list, list):
                                        # Concatenate all 'text' fields from the summaries list
                                        full_text = "\n\n".join([s.get('text', '') for s in summaries_list if s.get('text')])
                                    else:
                                        print(f"Expected 'summaries' to be a list for bill ID: {bill_identifier}, but got {type(summaries_list)}")
                                     
                                    if not full_text:
                                        print(f"No meaningful text extracted from summaries for bill ID: {bill_identifier}.")
                                else:
                                    print(f"Failed to fetch summaries for {bill_identifier}. Status code: {text_resp.status_code}")
                                    print(f"Response content for summaries request: {text_resp.text}")
                            else:
                                print(f"Missing components (congress, type, number) for bill '{title}'. Cannot fetch summaries.")

                            # --- ADDED LENGTH CHECK LOGIC HERE ---
                            if len(full_text) < MIN_FULL_TEXT_LENGTH:
                                print(f"Skipping bill '{title}' ({bill_identifier}) due to insufficient text length from summaries: {len(full_text)} characters (min required: {MIN_FULL_TEXT_LENGTH})")
                                continue # Skip to the next bill if text is too short

                            # Calculate semantic similarity between topic and bill text
                            try:
                                # Generate embeddings for both topic and bill text
                                topic_embedding = self.model.encode([topic])
                                bill_embedding = self.model.encode([full_text])
                                
                                # Calculate cosine similarity
                                similarity_score = cosine_similarity(topic_embedding, bill_embedding)[0][0]
                                
                                print(f"Semantic similarity for '{title}': {similarity_score:.4f}")
                                
                                # Only include bills that meet the similarity threshold
                                if similarity_score >= self.similarity_threshold:
                                    print(f"Retrieved bill: '{title}' ({len(full_text)} characters) - Similarity: {similarity_score:.4f}")
                                    results.append({
                                        "title": title,
                                        "text": full_text,
                                        "url": text_url, # This URL points to the bill's summaries endpoint.
                                        "keyword": topic,
                                        "bill_id": bill_identifier,
                                        "similarity_score": float(similarity_score)
                                    })
                                else:
                                    print(f"Skipping bill '{title}' due to low semantic similarity: {similarity_score:.4f} < {self.similarity_threshold}")
                                    
                            except Exception as e:
                                print(f"Error calculating semantic similarity for '{title}': {e}")
                                # Fallback: include without similarity score
                                print(f"Retrieved bill (no similarity): '{title}' ({len(full_text)} characters)")
                                results.append({
                                    "title": title,
                                    "text": full_text,
                                    "url": text_url,
                                    "keyword": topic,
                                    "bill_id": bill_identifier,
                                    "similarity_score": 0.0
                                })
                    else:
                        print(f"Congress API main search failed for topic '{topic}'. Status code: {response.status_code}")
                        print(f"Response content: {response.text}")
                except requests.exceptions.RequestException as req_err:
                    print(f"Network or request error for topic '{topic}': {req_err}")
                except json.JSONDecodeError as json_err:
                    print(f"JSON decoding error for topic '{topic}': {json_err}. Response: {response.text}")
                except Exception as e:
                    print(f"An unexpected error occurred processing Congress API query for '{topic}': {e}")

            if results:
                # Sort results by similarity score (highest first)
                results.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
                print(f"Successfully retrieved {len(results)} bills in total.")
                print("Bills ranked by semantic similarity:")
                for i, bill in enumerate(results[:5]):  # Show top 5
                    print(f"  {i+1}. {bill['title']} - Similarity: {bill.get('similarity_score', 0):.4f}")
                return results
            else:
                print("No bills found matching the search criteria across all topics.")
                return None
        except Exception as e:
            print(f"Error in Congress integration's get_bills method: {e}")
            return None
            
def handler(payload):
    """
    AWS Lambda handler function to process incoming events for Congress bills.
    """
    topics = payload.get("topics")
    if not topics:
        print("No topics provided in the payload.")
        return {"statusCode": 400, "body": "Missing 'topics' in payload."}

    print(f"congress_scraper invoked with topics: {topics}")
    congress = Congress(topics)
    bills = congress.get_bills()

    if bills is not None and len(bills) > 0:
        print(f"Retrieved {len(bills)} bills.")
        for entry in bills:
            print(f"Title: {entry['title']}")
            print(f"Bill ID: {entry['bill_id']}") 
            print(f"Text: {entry['text']}") # Print first 150 chars of text
            print(f"URL: {entry['url']}")
            print(f"Keyword: {entry['keyword']}")
            print("--------------------")
        return {"statusCode": 200, "body": json.dumps(bills)}
    else:
        print("No bills found.")
        return {"statusCode": 204, "body": "No bills found."}

if __name__ == "__main__":
    if os.environ.get('CONGRESS_API_KEY'):
        keywords = ['climate'] 
        payload = {"topics": keywords}
        print("\n--- Invoking handler with example keywords ---")
        handler(payload)
    else:
        print("CONGRESS_API_KEY environment variable not set. Please set it to run the example.")
