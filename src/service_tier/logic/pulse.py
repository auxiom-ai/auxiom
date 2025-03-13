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

# from logic.user_topics_output import UserTopicsOutput
# import common.sqs
# import common.s3=

# Constants
DEFAULT_ARTICLE_AGE = 7
# MODEL = SentenceTransformer('./saved_model/all-MiniLM-L6-v2')
# Lightweight and effective model
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
  "Free Thinker": ["technology", "life_sciences", "finance", "economy_macro"] #what should I put here?
}

load_dotenv()  # Add this near the top of the file with other imports

# Base ArticleResource class
class ArticleResource:
    def __init__(self, user_topics_output):
        self.articles_df = pd.DataFrame()
        self.today = datetime.date.today()
        self.time_constraint = self.today - \
            datetime.timedelta(days=DEFAULT_ARTICLE_AGE)
        self.user_input = user_topics_output.user_input
        self.user_embeddings = user_topics_output.user_embeddings
        self.nlp = spacy.load("en_core_web_sm")

    def _extract_entities(self, input_text):
        if not isinstance(input_text, str):
            return ""
        doc = self.nlp(input_text)
        entities = [ent.text for ent in doc.ents] + \
            [token.text for token in doc if token.pos_ == "NOUN"]
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

        # Fill NaN or None values in the scoring column with empty strings
        self.articles_df[scoring_column] = self.articles_df[scoring_column].fillna(
            "")

        entities = self.articles_df[scoring_column].apply(
            self._extract_entities)
        entities_list = entities.tolist()  # Convert Series to list
        embeddings = MODEL.encode(entities_list, convert_to_tensor=True)

        self.articles_df['score'] = util.cos_sim(
            self.user_embeddings, embeddings).flatten().detach().cpu().numpy()
        self.articles_df.sort_values(by='score', ascending=False, inplace=True)
        self.articles_df = self.articles_df.head(5)

    @staticmethod
    def finalize_df(resources):
        combined_df = pd.concat([r.articles_df for r in resources])
        combined_df.drop_duplicates(subset=['title'], inplace=True)
        return combined_df.sort_values(by='score', ascending=False).head(5)

    def fetch_with_retry(self, func, *args, **kwargs):
        for attempt in range(MAX_RETRIES):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    raise e
                time.sleep(min(BASE_DELAY * 2 ** attempt +
                           random.uniform(0, 1), MAX_DELAY))

# PubMed Integration
class PubMed(ArticleResource):
    def __init__(self, user_topics_output):
        super().__init__(user_topics_output)

    def get_articles(self):
        try:
            Entrez.email = 'rahil.verma@duke.com'
            topics = self.user_input
            query = f'{topics[0]} AND "{self.time_constraint}"[Date] : "{self.today}"[Date]'
            for t in topics[1:]:
                query += f' OR {t} AND "{self.time_constraint}"[Date] : "{self.today}"[Date]'
            try:
                handle = self.fetch_with_retry(
                    Entrez.esearch, db='pubmed', term=query, sort='relevance', retmax='500', retmode='xml')
                results = Entrez.read(handle)
                id_list = results['IdList']
            except Exception as e:
                print(f"Error fetching PubMed query: {e}")

            try:
                handle = self.fetch_with_retry(
                    Entrez.efetch, db='pubmed', id=','.join(id_list), retmode='xml')
                papers = Entrez.read(handle)
                rows = []
                for article in papers['PubmedArticle']:
                    data = {
                        'title': article['MedlineCitation']['Article'].get('ArticleTitle', 'N/A'),
                        'text': ' '.join(article['MedlineCitation']['Article'].get('Abstract', {}).get('AbstractText', '')),
                        'url': f"https://www.ncbi.nlm.nih.gov/pubmed/{article['MedlineCitation']['PMID']}"
                    }
                    rows.append(data)
                self.articles_df = pd.DataFrame(rows)
                self.normalize_df()
            except Exception as e:
                print(f"Error fetching PubMed articles: {e}")
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
                        self.sch.search_paper, query=k, publication_date_or_year=f'{self.time_constraint.strftime("%Y-%m-%d")}:{self.today.strftime("%Y-%m-%d")}')
                    results += response.items
                except Exception as e:
                    print(
                        f"Error fetching Semantic Scholar query for {k}: {e}")

            rows = [{'title': r.title, 'text': r.abstract, 'url': r.url}
                    for r in results]
            self.articles_df = pd.DataFrame(rows)
            self.normalize_df()
        except Exception as e:
            print(f"Error in Semantic Scholar integration: {e}")

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

    # pubmed.get_articles()
    # sem.get_articles()
    alpha.get_articles()

    # pubmed.rank_data()
    # sem.rank_data()
    alpha.rank_data()

    # final_df = ArticleResource.finalize_df([pubmed, sem, alpha])
    #final_df = ArticleResource.finalize_df([alpha])
    # final_df.to_csv('./data/final_df.csv', index=False)
    print(alpha.get_articles())
