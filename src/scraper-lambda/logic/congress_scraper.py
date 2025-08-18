import os
import requests
import logging
import json
import datetime
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

# Set cache directories to writable location in Lambda BEFORE importing sentence_transformers
os.environ['SENTENCE_TRANSFORMERS_HOME'] = '/tmp/sentence_transformers'
os.environ['TRANSFORMERS_CACHE'] = '/tmp/transformers'
os.environ['HF_HOME'] = '/tmp/huggingface'
os.environ['HF_HUB_CACHE'] = '/tmp/huggingface/hub'

from sentence_transformers import SentenceTransformer
from article_resource import ArticleResource #revert to logic.article_resource

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

        self.today = datetime.datetime.now()  # Current date
        self.time_constraint = datetime.datetime.now() - datetime.timedelta(days=7)  # 7 days ago
        
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
            # No longer need minimum text length since we're not fetching summaries

            for topic in self.user_input:
                # Build URL - include time constraints only if time_constraint is set
                if self.time_constraint:
                    from_date = self.time_constraint.strftime('%Y-%m-%dT%H:%M:%SZ')
                    to_date = self.today.strftime('%Y-%m-%dT%H:%M:%SZ')
                    url = (f"https://api.congress.gov/v3/bill/119?query={topic}"
                           f"&fromDateTime={from_date}"
                           f"&toDateTime={to_date}"
                           f"&api_key={self.api_key}")
                else:
                    # Search all available bills without time constraints
                    url = (f"https://api.congress.gov/v3/bill/119?query={topic}"
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
                            bill_type = bill.get('type', '').lower()
                            bill_number = bill.get('number')

                            bill_identifier = None
                            if congress_num and bill_type and bill_number:
                                # Example: "hr3876-119"
                                bill_identifier = f"{bill_type}{bill_number}-{congress_num}"
                            
                            # Get basic bill information without fetching summaries
                            bill_url = bill.get('url', '')
                            latest_action = bill.get('latestAction', {})
                            latest_action_date = latest_action.get('actionDate', '')
                            latest_action_text = latest_action.get('text', '')
                            
                            print(f"Retrieved bill: '{title}' - Latest Action: {latest_action_date}")
                            
                            results.append({
                                "title": title,
                                "bill_id": bill_identifier,
                                "url": bill_url,
                                "keyword": topic,
                                "latest_action_date": latest_action_date,
                                "latest_action_text": latest_action_text,
                                "congress": congress_num,
                                "bill_type": bill_type,
                                "bill_number": bill_number
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
                # Sort results by latest action date (most recent first)
                results.sort(key=lambda x: x.get('latest_action_date', ''), reverse=True)
                print(f"Successfully retrieved {len(results)} bills in total.")
                print("Bills ranked by latest action date:")
                for i, bill in enumerate(results[:5]):  # Show top 5
                    print(f"  {i+1}. {bill['title']} - Latest Action: {bill.get('latest_action_date', 'N/A')}")
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
            print(f"URL: {entry['url']}")
            print(f"Keyword: {entry['keyword']}")
            print(f"Latest Action Date: {entry['latest_action_date']}")
            print(f"Latest Action Text: {entry['latest_action_text']}")
            print("--------------------")
        return {"statusCode": 200, "body": json.dumps(bills)}
    else:
        print("No bills found.")
        return {"statusCode": 204, "body": "No bills found."}

if __name__ == "__main__":
    if os.environ.get('CONGRESS_API_KEY'):
        keywords = ["Trade", "Energy","Cybersecurity","Technology", "Economics", "Voting", "International Relations"] 
        
        # Test get_bills() method directly
        print("--- Testing get_bills() method directly ---")
        congress = Congress(keywords)
        bills_result = congress.get_bills()
        print("get_bills() returned:")
        print(bills_result)
        
        # Test handler function
        payload = {"topics": keywords}
        print("\n--- Invoking handler with example keywords ---")
        handler(payload)
    else:
        print("CONGRESS_API_KEY environment variable not set. Please set it to run the example.")
