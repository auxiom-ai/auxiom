"""
Base class for article resources with common functionality
"""

import requests
from fuzzywuzzy import fuzz
import time

class ArticleResource:
    def __init__(self, user_topics_output):
        self.user_input = user_topics_output
        self.fuzzy_threshold = 95
    
    def _is_duplicate_title(self, title, seen_titles):
        """Check if title is a duplicate using fuzzy matching"""
        title_lower = title.lower().strip()
        for seen_title in seen_titles:
            if fuzz.ratio(title_lower, seen_title) >= self.fuzzy_threshold:
                return True
        return False
    
    def fetch_with_retry(self, func, *args, max_retries=3, delay=1, **kwargs):
        """Fetch with retry mechanism"""
        for attempt in range(max_retries):
            try:
                response = func(*args, **kwargs)
                return response
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                print(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay} seconds...")
                time.sleep(delay)
                delay *= 2  # Exponential backoff
        
    def get_document_text(self, url):
        """Get document text from URL"""
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                return response.text
            else:
                print(f"Failed to fetch document from {url}: {response.status_code}")
                return ""
        except Exception as e:
            print(f"Error fetching document from {url}: {e}")
            return ""
