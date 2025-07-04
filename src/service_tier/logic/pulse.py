"""
Article clustering functionality using sentence transformers and document-based
clustering
"""

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
import logging
import spacy

import common.sqs
import common.s3

from logic.legal_scraper import Gov
from logic.google_scraper import GoogleNewsScraper


class ArticleClusterer:
    """Class for clustering news articles based on government documents"""
    def __init__(self, similarity_threshold=0.35, merge_threshold=0.8):
        self.logger = logging.getLogger('pulse.clustering')
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.nlp = spacy.load("en_core_web_sm")
        self.similarity_threshold = similarity_threshold
        self.merge_threshold = merge_threshold
        #self.scraper = ArticleScraper()
    
    def extract_entities(self, input_text):
        """Extract entities and nouns from text"""
        if not isinstance(input_text, str):
            return ""
        
        input_text = input_text[:5000]
        doc = self.nlp(input_text)
        
        entities = [ent.text.lower() for ent in doc.ents]
        nouns = [token.text.lower() for token in doc if token.pos_ == "NOUN"]
        return " ".join(entities + nouns)
    
    def calculate_cluster_overlap(self, cluster1, cluster2):
        """Calculate overlap between two clusters based on similarity scores"""
        if not cluster1['similarities'] or not cluster2['similarities']:
            return 0
            
        # Get top 10 most similar articles for each cluster
        cluster1_articles = set()
        cluster2_articles = set()
        
        # Sort similarities by value in descending order and take top 10
        sorted_similarities1 = sorted(
            cluster1['similarities'].items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:10]
        
        sorted_similarities2 = sorted(
            cluster2['similarities'].items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:10]
        
        # Extract just the article indices
        cluster1_articles = {idx for idx, _ in sorted_similarities1}
        cluster2_articles = {idx for idx, _ in sorted_similarities2}
        
        # Calculate overlap as percentage of articles that could belong to both clusters
        overlap = len(cluster1_articles & cluster2_articles)
        min_size = min(len(cluster1_articles), len(cluster2_articles))
        return overlap / min_size if min_size > 0 else 0
    
    def merge_similar_clusters(self, clusters):
        """Merge clusters that share more than threshold of their potential articles"""
        merged = True
        while merged:
            merged = False
            cluster_ids = list(clusters.keys())
            
            for i in range(len(cluster_ids)):
                for j in range(i + 1, len(cluster_ids)):
                    
                    c1_id, c2_id = cluster_ids[i], cluster_ids[j]
                    
                    if c1_id not in clusters or c2_id not in clusters:
                        continue
                    
                    overlap = self.calculate_cluster_overlap(
                        clusters[c1_id],
                        clusters[c2_id]
                    )
                    
                    if overlap >= self.merge_threshold:
                        try:
                            if len(clusters[c1_id]['articles']) >= len(
                                clusters[c2_id]['articles']
                            ):
                                self.logger.info(f"Merging cluster {c2_id} into {c1_id}")
                                # Add subdocument before merging
                                if 'subdocuments' not in clusters[c1_id]:
                                    clusters[c1_id]['subdocuments'] = []
                                clusters[c1_id]['subdocuments'].append(
                                    (clusters[c2_id]['doc_index'], 
                                     len(clusters[c2_id]['articles']))
                                )

                                if 'subdocuments' in clusters[c2_id]:
                                    clusters[c1_id]['subdocuments'].extend(
                                        clusters[c2_id]['subdocuments']
                                    )
                                # Merge similarities
                                for idx, sim in clusters[c2_id]['similarities'].items():
                                    if idx not in clusters[c1_id]['similarities'] or \
                                    sim > clusters[c1_id]['similarities'][idx]:
                                        clusters[c1_id]['similarities'][idx] = sim
                                
                                clusters[c1_id]['articles'].extend(
                                    clusters[c2_id]['articles']
                                )
                                clusters[c1_id]['articles'] = list(
                                    set(clusters[c1_id]['articles'])
                                )
                                del clusters[c2_id]

                                self.logger.info(f"New cluster has {len(clusters[c1_id]['articles'])} articles")
                            else:
                                self.logger.info(f"Merging cluster {c1_id} into {c2_id}")
                                # Add subdocument before merging
                                if 'subdocuments' not in clusters[c2_id]:
                                    clusters[c2_id]['subdocuments'] = []
                                clusters[c2_id]['subdocuments'].append(
                                    (clusters[c1_id]['doc_index'], 
                                     len(clusters[c1_id]['articles']))
                                )

                                if 'subdocuments' in clusters[c1_id]:
                                    clusters[c2_id]['subdocuments'].extend(
                                        clusters[c1_id]['subdocuments']
                                    )
                                
                                # Merge similarities
                                for idx, sim in clusters[c1_id]['similarities'].items():
                                    if idx not in clusters[c2_id]['similarities'] or \
                                    sim > clusters[c2_id]['similarities'][idx]:
                                        clusters[c2_id]['similarities'][idx] = sim
                                
                                clusters[c2_id]['articles'].extend(
                                    clusters[c1_id]['articles']
                                )
                                clusters[c2_id]['articles'] = list(
                                    set(clusters[c2_id]['articles'])
                                )
                                del clusters[c1_id]

                                self.logger.info(f"New cluster has {len(clusters[c2_id]['articles'])} articles")
                            merged = True
                            break
                        except Exception as e:
                            self.logger.error(f"Error merging clusters {c1_id} and {c2_id}: {e}")
                if merged:
                    break
        
        return clusters
    
    def create_initial_clusters(self, gov_embeddings, news_embeddings):
        """Create initial clusters based on government documents"""
        clusters = {}
        used_articles = set()
        
        # First pass: Create clusters and find all potential article matches
        for i, doc_embedding in enumerate(gov_embeddings):
            cluster_articles = []
            for j, news_embedding in enumerate(news_embeddings):
                similarity = np.dot(doc_embedding, news_embedding) / (
                    np.linalg.norm(doc_embedding) * np.linalg.norm(news_embedding)
                )
                if similarity >= self.similarity_threshold:
                    cluster_articles.append((j, similarity))
            
            if cluster_articles:
                clusters[i] = {
                    'doc_index': i,
                    'articles': [],
                    'similarities': {}
                }
                for article_idx, similarity in cluster_articles:
                    clusters[i]['similarities'][article_idx] = similarity
        
        self.logger.info(f"Created {len(clusters)} initial clusters")
        # Second pass: Assign articles to clusters based on highest similarity
        for article_idx in range(len(news_embeddings)):
            max_similarity = -1
            best_cluster = None
            
            for cluster_id, cluster_data in clusters.items():
                if article_idx in cluster_data['similarities']:
                    similarity = cluster_data['similarities'][article_idx]
                    if similarity > max_similarity:
                        max_similarity = similarity
                        best_cluster = cluster_id
            
            if best_cluster is not None and article_idx not in used_articles:
                clusters[best_cluster]['articles'].append(article_idx)
                used_articles.add(article_idx)
        
        self.logger.info(f"Assigned {len(used_articles)} articles to clusters")
        
        return clusters
    
    def calculate_cluster_score(self, cluster):
        """Calculate cluster score based on average similarity, merged gov docs, and article count"""
        if not cluster['articles']:
            return 0
            
        # Get top 3 articles by similarity
        sorted_articles = sorted(
            cluster['articles'],
            key=lambda x: cluster['similarities'][x],
            reverse=True
        )[:5]
        
        # Calculate average similarity of top 3 articles
        avg_similarity = sum(
            cluster['similarities'][idx] for idx in sorted_articles
        ) / min(3, len(sorted_articles))
        
        # Calculate normalized article count (assuming max 100 articles)
        norm_article_count = len(cluster['articles']) / 100

        # Secondary gov docs count
        if 'subdocuments' in cluster:
            subdoc_count = len(cluster['subdocuments']) / 10
        else:
            subdoc_count = 0
        
        # Calculate final score
        score = 2 * avg_similarity + 0.4 * norm_article_count + 0.6 * subdoc_count
        return score

    
    def create_cluster_dataframes(self, clusters, news_df, gov_df):
        """Create a dataframe for each cluster with all relevant information"""
        # Rank clusters by score
        ranked_clusters = []
        for cluster_id, cluster_data in clusters.items():
            score = self.calculate_cluster_score(cluster_data)
            ranked_clusters.append((cluster_id, cluster_data, score))
        
        # Sort clusters by score in descending order
        ranked_clusters.sort(key=lambda x: x[2], reverse=True)
        
        # top 5 clusters
        top_clusters = ranked_clusters[:5]

        cluster_dfs = []

        try:
            for rank, (cluster_id, cluster_data, score) in enumerate(top_clusters, 1):
                rows = []
                
                # Add primary document
                doc_idx = cluster_data['doc_index']
                rows.append({
                    'source': 'gov',
                    'type': 'primary',
                    'title': gov_df.iloc[doc_idx]['title'],
                    'text': gov_df.iloc[doc_idx]['text'][100:],
                    'url': gov_df.iloc[doc_idx]['url'],
                    'keyword': gov_df.iloc[doc_idx]['keyword'],
                    'publisher': '',
                })
                
                # Add subdocuments if they exist
                if 'subdocuments' in cluster_data and cluster_data['subdocuments']:
                    # Sort subdocuments by article count
                    sorted_subdocs = sorted(
                        cluster_data['subdocuments'],
                        key=lambda x: x[1],
                        reverse=True
                    )
                    for subdoc_idx, doc_count in sorted_subdocs[:5]:
                        rows.append({
                            'source': 'gov',
                            'type': 'secondary',
                            'title': gov_df.iloc[subdoc_idx]['title'],
                            'text': gov_df.iloc[subdoc_idx]['text'],
                            'url': gov_df.iloc[subdoc_idx]['url'],
                            'keyword': gov_df.iloc[subdoc_idx]['keyword'],
                            'publisher': 'Government',
                        })
                
                # Add news articles
                # Sort articles by similarity score
                sorted_articles = sorted(
                    cluster_data['articles'],
                    key=lambda x: cluster_data['similarities'][x],
                    reverse=True
                )
                start = len(rows)
                for article_idx in sorted_articles:
                    article = news_df.iloc[article_idx]
                    rows.append({
                        'source': 'google_news',
                        'type': 'news',
                        'title': article['title'],
                        'text': '',  # No content available
                        'url': article['url'],
                        'keyword': article['keyword'],
                        'publisher': article['publisher'],
                    })

                    if len(rows) - start > 2:
                        break
        
                # Create dataframe and add to list
                df = pd.DataFrame(rows)
                cluster_dfs.append(df)
        except Exception as e:
            self.logger.error(f"Error processing clusters: {e}")
    
        return cluster_dfs

    def cluster_articles(self, news_df, gov_df, output_file='cluster_report.txt'):
        """Main method to cluster articles and generate report"""
        try:
            if news_df.empty:
                self.logger.error("No Google News articles found")
            
            if gov_df.empty:
                self.logger.error("No federal documents found")
            
            # Embed Google News article titles
            self.logger.info(f"Embedding {len(news_df)} Google News article titles...")
            news_titles = news_df['title'].tolist()
            news_embeddings = self.model.encode(news_titles)
            if len(news_embeddings) == 0:
                self.logger.error("No Google News article embeddings found")
                return
            
            # Embed federal documents
            self.logger.info(f"Embedding {len(gov_df)} government document titles...")
            gov_embeddings = []
            for index, row in gov_df.iterrows():
                title = row['title']
                text = row['text']
                embeddings = self.model.encode(title + " " + self.extract_entities(text[1000:5000]))
                gov_embeddings.append(embeddings)

            if len(gov_embeddings) == 0:
                self.logger.error("No government document embeddings found")
                return
            
            # Create and merge clusters
            clusters = self.create_initial_clusters(gov_embeddings, news_embeddings)
            clusters = self.merge_similar_clusters(clusters)

            self.logger.info(f"Final number of clusters: {len(clusters)}")
                        
            # Create dataframes
            dfs = self.create_cluster_dataframes(clusters, news_df, gov_df)
            
            return dfs
        except Exception as e:
            self.logger.error(f"Error in clustering process: {e}")


def handler(payload):
    user_id = payload.get("user_id")
    user_email = payload.get("user_email")
    plan = payload.get("plan")
    episode = payload.get("episode")
    keywords = payload.get("keywords", [])
    user_name = payload.get("user_name")

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    if not user_id or not keywords:
        raise ValueError("Invalid payload: user_id, episode and keywords are required")

    google_news = GoogleNewsScraper(keywords)
    news_df = google_news.get_articles()

    gov = Gov(keywords)
    gov.get_articles()  # Get government articles

    gov_df = gov.articles_df

    # Create clusterer and run clustering
    clusterer = ArticleClusterer()
    dfs = clusterer.cluster_articles(news_df, gov_df)

    if dfs and len(dfs) > 0:
        common.s3.save_serialized(user_id, episode, "PULSE", {
                "cluster_dfs": dfs,
        })

        # Send message to SQS
        try:
            next_event = {
                "action": "e_nlp",
                "payload": { 
                "user_id": user_id,
                "user_email": user_email,
                "user_name": user_name,
                "plan": plan,
                "episode": episode,
                "ep_type": "pulse"
                }
            }
            common.sqs.send_to_sqs(next_event)
            print(f"Sent message to SQS for next action {next_event['action']}")
        except Exception as e:
            print(f"Exception when sending message to SQS {e}")
    else:
        logging.error("No clusters generated, notifying user.")
        # Notify user via email if no clusters generated
        try:
            next_event = {
                "action": "e_notify",
                "payload": { 
                "user_id": user_id,
                "user_email": user_email,
                "user_name": user_name,
                "keywords": keywords
                }
            }
            common.sqs.send_to_sqs(next_event)
            print(f"Sent message to SQS for next action {next_event['action']}")
        except Exception as e:
            print(f"Exception when sending message to SQS {e}")

if __name__ == "__main__":
    import pickle as pkl
    
    keywords = [ 'tariffs', 'trade', 'Taiwan', 'China']

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    google_news = GoogleNewsScraper(keywords)
    news_df = google_news.get_articles()

    gov = Gov(keywords)
    gov.get_articles()  # Get government articles

    gov_df = gov.articles_df

    # Create clusterer and run clustering
    clusterer = ArticleClusterer()
    dfs = clusterer.cluster_articles(news_df, gov_df)

    # save to tmp
    if dfs and len(dfs) > 0:
        with open ('tmp/cluster_dfs.pkl', 'wb') as f:
            pkl.dump(dfs, f)

        for i, df in enumerate(dfs):
            print( f"Cluster {i+1} DataFrame ({len(df)}):")
            print( df.head(2))
    else:
        logging.error("No clusters generated.")
