import os
import requests
import logging
import json
import datetime
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

from article_resource import ArticleResource

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
        self.headers = {"Content-Type": "application/json"}

        self.today = datetime.datetime.now()
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
            MIN_FULL_TEXT_LENGTH = 50

            for topic in self.user_input:
                # Build URL - include time constraints only if time_constraint is set
                if self.time_constraint:
                    from_date = self.time_constraint.strftime('%Y-%m-%dT%H:%M:%SZ')
                    to_date = self.today.strftime('%Y-%m-%dT%H:%M:%SZ')
                    url = (f"https://api.congress.gov/v3/bill/119?query={topic}"
                           f"&fromDateTime={from_date}"
                           f"&toDateTime={to_date}"
                           f"&limit=30"
                           f"&api_key={self.api_key}")
                else:
                    # Search all available bills without time constraints
                    url = (f"https://api.congress.gov/v3/bill/119?query={topic}"
                           f"&limit=30"
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

                            if title and self._is_duplicate_title(title, seen_titles):
                                print(f"Skipping duplicate bill: {title}")
                                continue
                            
                           
                            if title:
                                seen_titles.add(title.lower().strip())

                            congress_num = bill.get('congress')
                            bill_type = bill.get('type').lower()
                            bill_number = bill.get('number')

                            bill_identifier = None
                            if congress_num and bill_type and bill_number:
                                # Example: "hr3876-117"
                                bill_identifier = f"{bill_type}{bill_number}-{congress_num}"
                            
                            text_url = None
                            full_text = ''

                            if bill_identifier and congress_num and bill_type and bill_number:
                                text_url = (f"https://api.congress.gov/v3/bill/{congress_num}/"
                                            f"{bill_type}/{bill_number}/summaries?api_key={self.api_key}")
                                
                                text_resp = requests.get(text_url, headers=self.headers)

                                if text_resp.status_code == 200:
                                    text_data = text_resp.json()
                                    summaries_list = text_data.get('summaries', [])
                                    
                                    if isinstance(summaries_list, list):
                                        full_text = "\n\n".join([s.get('text', '') for s in summaries_list if s.get('text')])
                                    else:
                                        print(f"Expected 'summaries' to be a list for bill ID: {bill_identifier}, but got {type(summaries_list)}")
                                     
                                else:
                                    print(f"Failed to fetch summaries for {bill_identifier}. Status code: {text_resp.status_code}")
                                    print(f"Response content for summaries request: {text_resp.text}")
                            else:
                                print(f"Missing components (congress, type, number) for bill '{title}'. Cannot fetch summaries.")


                            # Calculate semantic similarity between topic and bill (title + text)
                            try:
                                topic_embedding = self.model.encode([topic])               
                                combined_text = f"{title}\n\n{full_text}"
                                bill_embedding = self.model.encode([combined_text])
                                
                                similarity_score = cosine_similarity(topic_embedding, bill_embedding)[0][0]
                                
                                print(f"Semantic similarity for '{title}': {similarity_score:.4f}")
                                
                                print(f"Retrieved bill: '{title}' ({len(full_text)} characters) - Similarity: {similarity_score:.4f}")
                                results.append({
                                    "title": title,
                                    "text": full_text,
                                    "url": text_url, # This URL points to the bill's summaries endpoint.
                                    "keyword": topic,
                                    "bill_id": bill_identifier,
                                    "similarity_score": float(similarity_score)
                                })
                                    
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
            print(f"Text: {entry['text']}")
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
