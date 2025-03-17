from sentence_transformers import SentenceTransformer, util
import numpy as np
import pandas as pd
import spacy
import datetime
from Bio import Entrez
from semanticscholar import SemanticScholar
import os
import time
import random
import torch
import requests
from dotenv import load_dotenv
import requests
from dotenv import load_dotenv
import requests
import pandas as pd
from Bio import Entrez
from bs4 import BeautifulSoup
import arxiv
import fitz  # PyMuPDF
from datetime import datetime, timedelta
import pytz
# Constants
DEFAULT_ARTICLE_AGE = 7
MODEL = SentenceTransformer('all-MiniLM-L6-v2')
MAX_RETRIES = 10
BASE_DELAY = 0.33
MAX_DELAY = 15
INDUSTRY_MAP = {
  "Technology": ["technology", "blockchain"],
  "Healthcare": ["life_sciences"],
  "Finance": ["finance", "financial_markets", "economy_fiscal", "economy_monetary", "economy_macro"],
  "Consulting": ["economy_macro", "mergers_and_acquisitions"],
  "Life Sciences": ["life_sciences"],
  "Academia": ["life_sciences", "technology"],
  "Marketing": ["retail_wholesale"],
  "Manufacturing": ["manufacturing"],
  "Retail": ["retail_wholesale"],
  "Entertainment": [],
  "Free Thinker": ["technology", "life_sciences", "finance", "economy_macro"]
}

load_dotenv()

# Base ArticleResource class
class ArticleResource:
    def __init__(self, user_topics_output):
        self.articles_df = pd.DataFrame()
        self.today = datetime.today().date()
        self.time_constraint = self.today - timedelta(days=DEFAULT_ARTICLE_AGE)
        self.user_input = user_topics_output.user_input
        self.user_embeddings = user_topics_output.user_embeddings
        self.nlp = spacy.load("en_core_web_sm")
        self.industry = user_topics_output.industry

    def _extract_entities(self, input_text):
        if not isinstance(input_text, str):
            return ""
        doc = self.nlp(input_text)
        entities = [ent.text for ent in doc.ents] + [token.text for token in doc if token.pos_ == "NOUN"]
        return " ".join(entities)

    def normalize_df(self):
        self.articles_df.rename(columns={
            'Article Text': 'text', 'Abstract': 'text', 'domain': 'journal',
            'Title': 'title', 'Authors': 'author'
        }, inplace=True)
        self.articles_df.drop_duplicates(subset=['title'], inplace=True)

    def rank_data(self, scoring_column='text'):
        if self.articles_df.empty:
            return

        print(f"Preview before ranking: {self.articles_df.head()}")

        self.articles_df[scoring_column] = self.articles_df[scoring_column].fillna("")

        entities = self.articles_df[scoring_column].apply(self._extract_entities)
        entities_list = entities.tolist()
        embeddings = MODEL.encode(entities_list, convert_to_tensor=True)

        self.articles_df['score'] = util.cos_sim(self.user_embeddings, embeddings).flatten().detach().cpu().numpy()
        self.articles_df.sort_values(by='score', ascending=False, inplace=True)
        self.articles_df = self.articles_df.head(5)

    @staticmethod
    def finalize_df(resources):
        combined_df = pd.concat([r.articles_df for r in resources])
        combined_df.drop_duplicates(subset=['title'], inplace=True)
        if 'score' in combined_df.columns:
            return combined_df.sort_values(by='score', ascending=False).head(5)
        return combined_df

    def fetch_with_retry(self, func, *args, **kwargs):
        for attempt in range(MAX_RETRIES):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    raise e
                time.sleep(min(BASE_DELAY * 2 ** attempt + random.uniform(0, 1), MAX_DELAY))

# PubMed Integration
class PubMed(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)
        Entrez.email = 'mark.ghattas@duke.edu'  # Required for PubMed API

    def fetch_with_retry(self, func, **kwargs):
        """Helper function to retry API requests if they fail."""
        for _ in range(3):  # Try up to 3 times
            try:
                handle = func(**kwargs)
                return handle
            except Exception as e:
                print(f"Error: {e}, retrying...")
        return None

    def get_full_text_link(self, pmid):
        """Finds full-text links from PubMed Central (PMC) or publisher DOI."""
        try:
            # Get PMC link (if available)
            handle = self.fetch_with_retry(Entrez.elink, dbfrom="pubmed", id=pmid, linkname="pubmed_pmc")
            links = Entrez.read(handle)
            for link_set in links:
                for link in link_set.get("LinkSetDb", []):
                    for link_info in link["Link"]:
                        return f"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC{link_info['Id']}"
            
            # Get DOI and check Unpaywall
            handle = self.fetch_with_retry(Entrez.efetch, db="pubmed", id=pmid, retmode="xml")
            paper = Entrez.read(handle)
            article = paper['PubmedArticle'][0]['MedlineCitation']['Article']
            doi = None

            # Extract DOI from article metadata
            for el in article.get("ELocationID", []):
                if el.attributes.get("EIdType") == "doi":
                    doi = el

            if doi:
                return self.check_unpaywall(doi)

        except Exception as e:
            print(f"Error retrieving full-text link: {e}")
        return "No full-text link available"

    def check_unpaywall(self, doi):
        """Checks Unpaywall API for open-access full text."""
        api_url = f"https://api.unpaywall.org/v2/{doi}?email=mark.ghattas@duke.edu"
        try:
            response = requests.get(api_url)
            data = response.json()
            if data.get("is_oa"):
                return data.get("best_oa_location", {}).get("url", "No open-access version found")
        except Exception as e:
            print(f"Error checking Unpaywall: {e}")
        return "No open-access version found"

    def get_articles(self):
        """Fetches PubMed articles, extracts abstracts, and finds full-text links."""
        try:
            topics = self.user_input
            query = f'{topics[0]} AND "{self.time_constraint}"[Date] : "{self.today}"[Date]'
            for t in topics[1:]:
                query += f' OR {t} AND "{self.time_constraint}"[Date] : "{self.today}"[Date]'

            # Search PubMed for article IDs
            handle = self.fetch_with_retry(Entrez.esearch, db='pubmed', term=query, sort='relevance', retmax='50', retmode='xml')
            results = Entrez.read(handle)
            id_list = results.get('IdList', [])

            if not id_list:
                print("No articles found.")
                return

            # Fetch article details
            handle = self.fetch_with_retry(Entrez.efetch, db='pubmed', id=','.join(id_list), retmode='xml')
            papers = Entrez.read(handle)
            rows = []

            for article in papers['PubmedArticle']:
                pmid = article['MedlineCitation']['PMID']
                title = article['MedlineCitation']['Article'].get('ArticleTitle', 'N/A')
                abstract = ' '.join(article['MedlineCitation']['Article'].get('Abstract', {}).get('AbstractText', ''))
                pubmed_url = f"https://www.ncbi.nlm.nih.gov/pubmed/{pmid}"
                full_text_link = self.get_full_text_link(pmid)  # Retrieve full-text link
                
                rows.append({
                    'PMID': pmid,
                    'Title': title,
                    'Abstract': abstract,
                    'PubMed URL': pubmed_url,
                    'Full-Text URL': full_text_link
                })

            # Convert to DataFrame
            self.articles_df = pd.DataFrame(rows)
            self.normalize_df()

        except Exception as e:
            print(f"Error in PubMed integration: {e}")

# Semantic Scholar Integration
class Sem(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)
        self.sch = SemanticScholar(
            timeout=7, api_key=os.environ.get('SEMANTIC_SCHOLAR_API_KEY'))

    def get_articles(self):
        try:
            results = []
            for k in self.user_input:
                try:
                    response = self.fetch_with_retry(
                        self.sch.search_paper, query=k, 
                        publication_date_or_year=f'{self.time_constraint.strftime("%Y-%m-%d")}:{self.today.strftime("%Y-%m-%d")}'
                    )
                    results += response.items
                except Exception as e:
                    print(f"Error fetching Semantic Scholar query for {k}: {e}")

            rows = []
            for r in results:
                paper_url = r.url
                full_text = None
                
                # Check if an Open Access PDF is available
                if hasattr(r, 'openAccessPdf') and r.openAccessPdf:
                    pdf_url = r.openAccessPdf.get('url')
                    if pdf_url:
                        full_text = self.fetch_full_text(pdf_url)
                
                # Default to abstract if full text isn't available
                rows.append({
                    'title': r.title,
                    'text': full_text if full_text else r.abstract,  
                    'url': paper_url,
                    'pdf_url': pdf_url if 'pdf_url' in locals() else None
                })
                
            self.articles_df = pd.DataFrame(rows)
            self.normalize_df()
        except Exception as e:
            print(f"Error in Semantic Scholar integration: {e}")

    def fetch_full_text(self, pdf_url):
        """Attempts to fetch full text from a PDF link"""
        try:
            response = requests.get(pdf_url, timeout=10)
            if response.status_code == 200:
                return response.text  # This assumes it's plain text, but PDFs need parsing
            else:
                print(f"Failed to fetch PDF: {pdf_url} (Status: {response.status_code})")
        except Exception as e:
            print(f"Error fetching full text from {pdf_url}: {e}")
        return None

# AlphaVantage Integration
class AlphaVantage(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)
        self.api_key = os.environ.get('ALPHA_VANTAGE_API_KEY')
        self.base_url = "https://www.alphavantage.co/query"
        self.industry = user_topics_output.industry
        self.stocks = user_topics_output.stocks

    def get_articles(self):
        try:
            all_rows = []
            for topic in self.stocks:
                params = {
                    "function": "NEWS_SENTIMENT",
                    "apikey": self.api_key,
                    "sort": "RELEVANT",
                    "limit": 500,
                    "time_from": self.time_constraint.strftime("%Y%m%dT%H%M"),
                    "time_to": self.today.strftime("%Y%m%dT%H%M"),
                    #"topics": topic
                    "tickers": topic
                }

                if self.user_input:
                    params["topics"] = INDUSTRY_MAP[self.industry]

                # if self.user_input:
                #     params["tickers"] = [stock for stock in self.stocks]

                response = self.fetch_with_retry(requests.get, self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                print(data)
                if "feed" in data:
                    rows = [{
                        'title': article.get('title', 'N/A'),
                        'text': article.get('summary', ''),
                        'url': article.get('url', '')
                    } for article in data['feed']]
                    all_rows.extend(rows)

            self.articles_df = pd.DataFrame(all_rows)
            self.normalize_df()
        except Exception as e:
            print(f"Error in AlphaVantage integration: {e}")

# Arxiv Integration
class Arxiv(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)

    def download_and_extract_arxiv_paper(self, query, max_results=5):
        seven_days_ago = datetime.now() - timedelta(days=7)
        utc_timezone = pytz.UTC
        seven_days_ago = utc_timezone.localize(seven_days_ago)

        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate
        )

        search_results = search.results()

        if not search_results:
            print("No results found for the query.")
            return None

        recent_results = []
        for result in search_results:
            naive_datetime = result.published
            if naive_datetime.tzinfo is None:
                published_date = utc_timezone.localize(naive_datetime)
            else:
                published_date = naive_datetime

            if published_date >= seven_days_ago:
                recent_results.append(result)

        if not recent_results:
            print("No recent papers found within the last 7 days.")
            return None


        for result in recent_results:
            print(f"Title: {result.title}")
            print(f"Abstract: {result.summary}")

            pdf_response = requests.get(result.pdf_url)
            pdf_path = f"{result.entry_id.split('/')[-1]}.pdf"

            with open(pdf_path, "wb") as f:
                f.write(pdf_response.content)

            print(f"Downloaded PDF: {pdf_path}")

            doc = fitz.open(pdf_path)
            full_text = "\n".join(page.get_text("text") for page in doc)

            return full_text

    def get_articles(self):
        try:
            all_rows = []
            for topic in self.user_input:
                full_text = self.download_and_extract_arxiv_paper(topic)
                if full_text:
                    rows.append({
                        'title': topic,
                        'text': full_text,
                        'url': f"https://arxiv.org/search/?query={topic}&searchtype=all"
                    })
            self.articles_df = pd.DataFrame(all_rows)
            self.normalize_df()
        except Exception as e:
            print(f"Error in Arxiv integration: {e}")

# Main Execution


def handler(payload):
    user_id = payload.get("user_id")
    user_name = payload.get("user_name")
    user_email = payload.get("user_email")
    plan = payload.get("plan")
    episode = payload.get("episode")
    industry = payload.get("industry")
    user_input = payload.get("user_input")
    stocks = payload.get("stocks")
    
    user_embeddings = MODEL.encode(" ".join(user_input), convert_to_tensor=True)
    data = {'user_input': user_input, 'user_embeddings': user_embeddings, 'industry': industry}

    user_topics_output = UserTopicsOutput(episode, user_id)
    pubmed = PubMed(user_topics_output)
    sem = Sem(user_topics_output)
    alpha = AlphaVantage(user_topics_output)

    pubmed.get_articles()
    sem.get_articles()
    alpha.get_articles()

    pubmed.rank_data()
    sem.rank_data()
    alpha.rank_data()

    final_df = ArticleResource.finalize_df([pubmed, sem, alpha])
    # final_df.to_csv('./data/final_df.csv', index=False)
    print(final_df)

    common.s3.save_serialized(user_id, episode, "PULSE", {
            "final_df": final_df,
    })

    # Send message to SQS
    try:
        next_event = {
            "action": "e_nlp",
            "payload": {
                "user_id": user_id,
                "user_name": user_name,
                "user_email": user_email,
                "plan": plan,
                "episode": episode,
                "ep_type": "pulse",
                "industry": industry
                #"stocks": stocks
            }
        }
        common.sqs.send_to_sqs(next_event)
        print(f"Sent message to SQS for next action {next_event['action']}")
    except Exception as e:
        print(f"Exception when sending message to SQS {e}")


class UserTopicsOutput:
    def __init__(self, data):
        self.user_embeddings = data["user_embeddings"]
        self.user_input = data["user_input"]
        self.industry = data["industry"]
        self.stocks = data.get("stocks", [])


if __name__ == "__main__":
    user_input = ['poop', 'pee', 'fart']
    user_input = [topic.lower() for topic in user_input]
    user_embeddings = MODEL.encode(
        " ".join(user_input), convert_to_tensor=True)

    data = {'user_input': user_input, 'user_embeddings': user_embeddings, 'industry': 'Finance', 'stocks':['AAPL']}

    user_topics = UserTopicsOutput(data)
    pubmed = PubMed(user_topics)
    sem = Sem(user_topics)
    alpha = AlphaVantage(user_topics)
    arx = Arxiv(user_topics)
    arx.download_and_extract_arxiv_paper("machine learning")

    # pubmed.get_articles()
    # sem.get_articles()
    # alpha.get_articles()
    arx.get_articles()

    # pubmed.rank_data()
    #sem.rank_data()
    #alpha.rank_data()
    arx.rank_data()

    # final_df = ArticleResource.finalize_df([pubmed, sem, alpha])
    final_df = ArticleResource.finalize_df([arx])
    #final_df.to_csv('./data/final_df.csv', index=False)
    #print(alpha.get_articles())
