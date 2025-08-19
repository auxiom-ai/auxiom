import os
import requests
import logging
import json
import datetime
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from urllib.parse import quote_plus
import boto3
import hashlib
from botocore.exceptions import ClientError

from logic.article_resource import ArticleResource

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
        
        # Initialize TF-IDF vectorizer for semantic similarity
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words='english',
            ngram_range=(1, 2),
            lowercase=True
        )
        self.similarity_threshold = 0.1  # Minimum similarity score to include bill (lower for TF-IDF)

    def get_bills(self):
        """
        Fetch recent bills from the Congress API and filter by semantic similarity to user interests.
        Only returns bills that are semantically similar to at least one interest above the threshold.
        
        Returns:
            list: List of dicts with bill info, filtered by semantic similarity to user interests
        """
        try:
            results = []
            seen_titles = set()
            
            # Build URL - get all recent bills without search query since API search is broken
            if self.time_constraint:
                from_date = self.time_constraint.strftime('%Y-%m-%dT%H:%M:%SZ')
                to_date = self.today.strftime('%Y-%m-%dT%H:%M:%SZ')
                url = (f"https://api.congress.gov/v3/bill/119?"
                       f"fromDateTime={from_date}"
                       f"&toDateTime={to_date}"
                       f"&api_key={self.api_key}")
            else:
                # Get all available bills without time constraints
                url = f"https://api.congress.gov/v3/bill/119?api_key={self.api_key}"

            try:
                print(f"Fetching bills from Congress API: {url}")
                response = requests.get(url, headers=self.headers)

                if response.status_code == 200:
                    data = response.json()
                    bills = data.get('bills', [])
                    print(f"Retrieved {len(bills)} bills from Congress API")

                    if not bills:
                        print("No bills found from Congress API")
                        return None

                    # Process all bills
                    all_bills = []
                    for bill in bills:
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
                        
                        # Get basic bill information
                        bill_url = bill.get('url', '')
                        latest_action = bill.get('latestAction', {})
                        latest_action_date = latest_action.get('actionDate', '')
                        latest_action_text = latest_action.get('text', '')
                        
                        all_bills.append({
                            "title": title,
                            "bill_id": bill_identifier,
                            "url": bill_url,
                            "latest_action_date": latest_action_date,
                            "latest_action_text": latest_action_text,
                            "congress": congress_num,
                            "bill_type": bill_type,
                            "bill_number": bill_number
                        })
                        
                    print(f"Processed {len(all_bills)} unique bills")
                    
                    # Apply semantic filtering against all user interests
                    if self.user_input and all_bills:
                        print(f"Applying semantic filtering against {len(self.user_input)} interests: {self.user_input}")
                        filtered_results = self._filter_bills_by_interests(all_bills, self.user_input)
                        
                        # Count total bills across all interests
                        total_bills = sum(len(bills) for bills in filtered_results.values())
                        print(f"Semantic filtering reduced results from {len(all_bills)} to {total_bills} bills")
                        results = filtered_results
                    else:
                        # If no user input, return empty dict with interests as keys
                        results = {interest: [] for interest in (self.user_input or [])}
                    
                    if results and any(bills for bills in results.values()):
                        total_bills = sum(len(bills) for bills in results.values())
                        print(f"Successfully retrieved {total_bills} bills organized by {len(results)} interests.")
                        print("Bills by interest:")
                        for interest, bills in results.items():
                            if bills:
                                print(f"  {interest}: {len(bills)} bills")
                                for i, bill in enumerate(bills[:3]):  # Show top 3 per interest
                                    similarity = bill.get('similarity_score', 'N/A')
                                    print(f"    {i+1}. {bill['title'][:50]}... - Similarity: {similarity}")
                        return results
                    else:
                        print("No bills found matching the search criteria.")
                        return None
                        
                else:
                    print(f"Congress API request failed. Status code: {response.status_code}")
                    print(f"Response content: {response.text}")
                    return None
                    
            except requests.exceptions.RequestException as req_err:
                print(f"Network or request error: {req_err}")
                return None
            except json.JSONDecodeError as json_err:
                print(f"JSON decoding error: {json_err}. Response: {response.text}")
                return None
            except Exception as e:
                print(f"An unexpected error occurred processing Congress API query: {e}")
                return None

        except Exception as e:
            print(f"Error in Congress integration's get_bills method: {e}")
            return None
    
    def _filter_bills_by_interests(self, bills, interests):
        """
        Filter bills by TF-IDF similarity to user interests and organize by interest.
        
        Args:
            bills (list): List of bill dictionaries
            interests (list): List of interest strings to compare against
            
        Returns:
            dict: Dictionary where keys are interests and values are lists of matching bills
        """
        try:
            if not bills or not interests:
                return {interest: [] for interest in interests}
                
            # Prepare texts for similarity comparison
            bill_texts = []
            for bill in bills:
                # Combine title and latest action text for better semantic matching
                text = f"{bill.get('title', '')} {bill.get('latest_action_text', '')}"
                bill_texts.append(text)
            
            # Combine all texts for TF-IDF fitting
            all_texts = interests + bill_texts
            
            # Fit TF-IDF vectorizer and transform texts
            tfidf_matrix = self.vectorizer.fit_transform(all_texts)
            
            # Split back into interests and bills
            interest_vectors = tfidf_matrix[:len(interests)]
            bill_vectors = tfidf_matrix[len(interests):]
            
            # Calculate cosine similarities between each bill and all interests
            similarities_matrix = cosine_similarity(bill_vectors, interest_vectors)
            
            # Initialize result dictionary with empty lists for each interest
            bills_by_interest = {interest: [] for interest in interests}
            
            # Group bills by ALL interests where they meet the threshold
            for i, (bill, bill_similarities) in enumerate(zip(bills, similarities_matrix)):
                bill_added_to_interests = []
                
                # Check similarity against each interest
                for j, (interest, similarity) in enumerate(zip(interests, bill_similarities)):
                    if similarity >= self.similarity_threshold:
                        bill_copy = bill.copy()
                        bill_copy['similarity_score'] = float(similarity)
                        bill_copy['keyword'] = interest
                        bills_by_interest[interest].append(bill_copy)
                        bill_added_to_interests.append(f"{interest} ({similarity:.3f})")
                
                # Log which interests this bill was added to
                if bill_added_to_interests:
                    interests_str = ", ".join(bill_added_to_interests)
                    print(f"  Bill '{bill['title'][:60]}...' added to: {interests_str}")
            
            # Sort bills within each interest by similarity score
            for interest in bills_by_interest:
                bills_by_interest[interest].sort(key=lambda x: x['similarity_score'], reverse=True)
            
            return bills_by_interest
            
        except Exception as e:
            print(f"Error in TF-IDF filtering by interests: {e}")
            return {interest: [] for interest in interests}
    
    def _filter_bills_by_similarity(self, bills, query):
        """
        Filter bills by TF-IDF similarity to the query.
        
        Args:
            bills (list): List of bill dictionaries
            query (str): Query string to compare against
            
        Returns:
            list: Filtered list of bills above similarity threshold
        """
        try:
            if not bills or not query:
                return bills
                
            # Prepare texts for similarity comparison
            bill_texts = []
            for bill in bills:
                # Combine title and latest action text for better semantic matching
                text = f"{bill.get('title', '')} {bill.get('latest_action_text', '')}"
                bill_texts.append(text)
            
            # Combine query and bill texts for TF-IDF fitting
            all_texts = [query] + bill_texts
            
            # Fit TF-IDF vectorizer and transform texts
            tfidf_matrix = self.vectorizer.fit_transform(all_texts)
            
            # Split back into query and bills
            query_vector = tfidf_matrix[0:1]
            bill_vectors = tfidf_matrix[1:]
            
            # Calculate cosine similarities
            similarities = cosine_similarity(query_vector, bill_vectors)[0]
            
            # Filter bills above threshold and add similarity scores
            filtered_bills = []
            for i, (bill, similarity) in enumerate(zip(bills, similarities)):
                if similarity >= self.similarity_threshold:
                    bill_copy = bill.copy()
                    bill_copy['similarity_score'] = float(similarity)
                    bill_copy['keyword'] = query  # Add the query as keyword for compatibility
                    filtered_bills.append(bill_copy)
                    print(f"  Bill '{bill['title'][:60]}...' - Similarity: {similarity:.3f}")
            
            # Sort by similarity score (highest first)
            filtered_bills.sort(key=lambda x: x['similarity_score'], reverse=True)
            
            return filtered_bills
            
        except Exception as e:
            print(f"Error in TF-IDF filtering: {e}")
            return bills  # Return original bills if filtering fails


def save_to_s3(bills, hash_key):
    """
    Save congress bills to S3.
    
    Args:
        bills: List of congress bills to save
        hash_key: Hash key for the filename
    """
    # Initialize S3 client
    s3_client = boto3.client(
        's3',
        region_name=os.getenv('AWS_REGION', 'us-east-1')
    )

    # Use astra bucket and congress path
    bucket_name = '905418457861-astra-bucket'
    filename = f"congress/bills_{hash_key[:10]}.json"
    
    # Prepare upload parameters
    params = {
        'Bucket': bucket_name,
        'Key': filename,
        'Body': json.dumps(bills),
        'ContentType': 'application/json'
    }

    try:
        print(f"Saving congress bills to S3: s3://{bucket_name}/{filename}")
        s3_client.put_object(**params)
        print('Successfully saved congress bills to S3')
    except ClientError as e:
        print(f"Error saving to S3: {e}")
        raise
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise


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
    bills_by_interest = congress.get_bills()

    if bills_by_interest is not None and any(bills for bills in bills_by_interest.values()):
        total_bills = sum(len(bills) for bills in bills_by_interest.values())
        print(f"Retrieved {total_bills} congress bills organized by interests.")
        
        # Generate hash for S3 filename
        topics_str = json.dumps(topics, sort_keys=True)
        topics_hash = hashlib.sha256(topics_str.encode('utf-8')).hexdigest()
        
        # Save bills to S3
        print(f"Saving congress bills dictionary to S3 with hash: {topics_hash}")
        save_to_s3(bills_by_interest, topics_hash)
        
        # Log bill details by interest
        for interest, bills in bills_by_interest.items():
            if bills:
                print(f"\n--- {interest} ({len(bills)} bills) ---")
                for entry in bills[:3]:  # Show first 3 bills per interest
                    print(f"Title: {entry['title']}")
                    print(f"Bill ID: {entry['bill_id']}") 
                    print(f"URL: {entry['url']}")
                    print(f"Similarity Score: {entry.get('similarity_score', 'N/A')}")
                    print(f"Latest Action Date: {entry['latest_action_date']}")
                    print(f"Latest Action Text: {entry['latest_action_text'][:100]}...")
                    print("--------------------")
        
        return {"statusCode": 200, "body": json.dumps(bills_by_interest)}
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
