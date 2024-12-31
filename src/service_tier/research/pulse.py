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

from research.user_topics_output import UserTopicsOutput
import common.sqs
import common.s3

# Constants
DEFAULT_ARTICLE_AGE = 7
MODEL = SentenceTransformer('./saved_model/all-MiniLM-L6-v2')
MAX_RETRIES = 10
BASE_DELAY = 0.33
MAX_DELAY = 15


# Base ArticleResource class
class ArticleResource:
    def __init__(self, user_topics_output):
        self.articles_df = pd.DataFrame()
        self.today = datetime.date.today()
        self.time_constraint = self.today - datetime.timedelta(days=DEFAULT_ARTICLE_AGE)
        self.user_input = user_topics_output.user_input
        self.user_embeddings = user_topics_output.user_embeddings
        self.nlp = spacy.load("en_core_web_sm")

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

        # Fill NaN or None values in the scoring column with empty strings
        self.articles_df[scoring_column] = self.articles_df[scoring_column].fillna("")

        entities = self.articles_df[scoring_column].apply(self._extract_entities)
        entities_list = entities.tolist()  # Convert Series to list
        embeddings = MODEL.encode(entities_list, convert_to_tensor=True)
        
        self.articles_df['score'] = util.cos_sim(self.user_embeddings, embeddings).flatten().numpy() 
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
                time.sleep(min(BASE_DELAY * 2 ** attempt + random.uniform(0, 1), MAX_DELAY))

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
                handle = self.fetch_with_retry(Entrez.esearch, db='pubmed', term=query, sort='relevance', retmax='500', retmode='xml')
                results = Entrez.read(handle)
                id_list = results['IdList']
            except Exception as e:
                print(f"Error fetching PubMed query: {e}")

            try:
                handle = self.fetch_with_retry(Entrez.efetch, db='pubmed', id=','.join(id_list), retmode='xml')
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
        self.sch = SemanticScholar(timeout = 7, api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY'))

    def get_articles(self):
        try:
            results = []
            for k in self.user_input:
                try:
                    response = self.fetch_with_retry(self.sch.search_paper, query=k, publication_date_or_year=f'{self.time_constraint.strftime("%Y-%m-%d")}:{self.today.strftime("%Y-%m-%d")}')
                    results += response.items
                except Exception as e:
                    print(f"Error fetching Semantic Scholar query for {k}: {e}")

            rows = [{'title': r.title, 'text': r.abstract, 'url': r.url} for r in results]
            self.articles_df = pd.DataFrame(rows)
            self.normalize_df()
        except Exception as e:
            print(f"Error in Semantic Scholar integration: {e}")

# Main Execution
def handler(payload):
    user_id = payload.get("user_id")
    user_name = payload.get("user_name")
    plan = payload.get("plan")

    user_topics_output = UserTopicsOutput(user_id)
    pubmed = PubMed(user_topics_output)
    sem = Sem(user_topics_output)

    pubmed.get_articles()
    sem.get_articles()

    pubmed.rank_data()
    sem.rank_data()

    final_df = ArticleResource.finalize_df([pubmed, sem])
    # final_df.to_csv('./data/final_df.csv', index=False)
    print(final_df)

    common.s3.save_serialized(user_id, "PULSE", {
            "final_df": final_df,
    })

    # Send message to SQS
    try:
        next_event = {
            "action": "e_nlp",
            "payload": { "user_id": user_id,
                        "user_name": user_name,
                        "plan": plan }
        }
        common.sqs.send_to_sqs(next_event)
        print(f"Sent message to SQS for next action {next_event['action']}")
    except Exception as e:
        print(f"Exception when sending message to SQS {e}")

if __name__ == "__main__":
    handler(None)