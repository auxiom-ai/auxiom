import os
import psycopg2
import pandas as pd
from io import StringIO
import sys
#import common.s3

# Add path to import from scraper-lambda
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'scraper-lambda', 'logic'))

# Import the existing Congress class from scraper-lambda
from congress_scraper import Congress

db_access_url = os.environ.get('DB_ACCESS_URL')


def get_cluster_metadata(cluster_id):
    """
    Retrieve cluster metadata from database and S3.
    
    Args:
        cluster_id: The cluster ID to retrieve metadata for
        
    Returns:
        DataFrame containing cluster documents or None if error
    """
    try:
        conn = psycopg2.connect(dsn=db_access_url, client_encoding='utf8')
        cursor = conn.cursor()
        
        cursor.execute("SELECT key FROM articles WHERE id = %s", (cluster_id,))
        result = cursor.fetchone()
        
        if not result:
            print(f"No cluster found with ID {cluster_id}")
            return None
            
        cluster_key = result[0]
        
        # Retrieve metadata from S3
        articles_json = common.s3.get_metadata(cluster_key)
        if articles_json is None:
            print(f"Failed to retrieve metadata for cluster {cluster_id}")
            return None
            
        # Parse JSON to DataFrame
        cluster_df = pd.read_json(StringIO(articles_json))
        
        return cluster_df
        
    except Exception as e:
        print(f"Error retrieving cluster metadata for {cluster_id}: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_bills(cluster_df):
    """
    Find related bills for all primary sources in the cluster using congress scraper.
    Adds bill information as a new column to the DataFrame.
    
    Args:
        cluster_df: DataFrame containing documents in a cluster with columns:
                   'source', 'type', 'title', 'text', 'url', 'keyword'
    
    Returns:
        DataFrame with added 'bills' column containing related bills for primary sources
    """
    try:
        # Create a copy of the DataFrame to avoid modifying the original
        enhanced_df = cluster_df.copy()
        
        # Initialize bills column with empty lists
        enhanced_df['bills'] = [[] for _ in range(len(enhanced_df))]
        
        # Get all primary government documents
        primary_docs = enhanced_df[enhanced_df['type'] == 'primary']
        
        if primary_docs.empty:
            print("No primary documents found for bill search")
            return enhanced_df
        
        print(f"========== FINDING BILLS FOR {len(primary_docs)} PRIMARY DOCUMENTS ===========")
        
        # Process each primary document
        for idx, row in primary_docs.iterrows():
            title = row.get('title', '')
            print(f"Searching for bills related to: '{title}'")
            
            try:
                # Create Congress instance with the document title as topic
                congress = Congress([title])
                
                # Remove time constraint to search all available bills, not just last 7 days
                congress.time_constraint = None
                
                bills = congress.get_bills()
                
                if bills and len(bills) > 0:
                    # Filter bills by similarity threshold (≥ 0.3)
                    filtered_bills = [bill for bill in bills if bill.get('similarity_score', 0) >= 0.3]
                    
                    print(f"Found {len(bills)} total bills, {len(filtered_bills)} above similarity threshold for '{title}'")
                    
                    # Store filtered bills in the DataFrame
                    enhanced_df.at[idx, 'bills'] = filtered_bills
                    
                    # Print first few bills for debugging
                    for j, bill in enumerate(filtered_bills[:3]):
                        print(f"  Bill {j+1}: {bill.get('title', 'No title')}")
                        print(f"    Bill ID: {bill.get('bill_id', 'No ID')}")
                        print(f"    Similarity Score: {bill.get('similarity_score', 0):.4f}")
                else:
                    print(f"No bills found for '{title}'")
                    enhanced_df.at[idx, 'bills'] = []
                    
            except Exception as e:
                print(f"Error finding bills for '{title}': {e}")
                enhanced_df.at[idx, 'bills'] = []
        
        # Print summary
        total_bills = sum(len(bills) for bills in enhanced_df['bills'] if isinstance(bills, list))
        print(f"========== BILL SEARCH COMPLETE: {total_bills} total bills found ===========")
        
        return enhanced_df
        
    except Exception as e:
        print(f"Error in get_bills: {e}")
        # Return original DataFrame with empty bills column if error occurs
        enhanced_df = cluster_df.copy()
        enhanced_df['bills'] = [[] for _ in range(len(enhanced_df))]
        return enhanced_df


def test_get_bills(cluster_df):
    """
    Test function to test the get_bills functionality using primary document titles from cluster_df
    
    Args:
        cluster_df: DataFrame containing cluster documents
    """
    try:
        print("=" * 60)
        print("TESTING GET_BILLS FUNCTIONALITY")
        print("=" * 60)
        
        # Get primary documents from cluster_df
        primary_docs = cluster_df[cluster_df['type'] == 'primary']
        
        if primary_docs.empty:
            print("❌ No primary documents found in cluster_df for testing")
            return
        
        # Extract titles from primary documents
        primary_titles = primary_docs['title'].tolist()
        
        print(f"Found {len(primary_titles)} primary documents to test:")
        for i, title in enumerate(primary_titles, 1):
            print(f"  {i}. {title}")
        
        for title in primary_titles:
            print(f"\nTesting with primary document title: '{title}'")
            print("-" * 40)
            
            try:
                # Create Congress instance
                congress = Congress([title])
                
                # Remove time constraint to search all available bills
                congress.time_constraint = None
                
                # Test get_bills method
                bills = congress.get_bills()
                
                if bills and len(bills) > 0:
                    # Filter by similarity threshold
                    filtered_bills = [bill for bill in bills if bill.get('similarity_score', 0) >= 0.3]
                    
                    print(f"✅ Found {len(bills)} total bills, {len(filtered_bills)} above similarity threshold (≥ 0.3)")
                    print("\nTop 3 most relevant bills:")
                    
                    for i, bill in enumerate(filtered_bills[:3]):
                        similarity = bill.get('similarity_score', 0)
                        bill_title = bill.get('title', 'No title')
                        bill_id = bill.get('bill_id', 'No ID')
                        text_length = len(bill.get('text', ''))
                        
                        print(f"\n  {i+1}. {bill_title}")
                        print(f"     Bill ID: {bill_id}")
                        print(f"     Similarity Score: {similarity:.4f}")
                        print(f"     Text Length: {text_length} characters")
                        
                        # Show a snippet of the bill text
                        if text_length > 0:
                            snippet = bill.get('text', '')[:200] + "..." if text_length > 200 else bill.get('text', '')
                            print(f"     Text Preview: {snippet}")
                        
                else:
                    print(f"❌ No bills found for '{title}' (or none met similarity threshold)")
                    
            except Exception as e:
                print(f"❌ Error testing '{title}': {e}")
                import traceback
                traceback.print_exc()
        
        print("\n" + "=" * 60)
        print("✅ GET_BILLS TEST COMPLETED")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error in test: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Test with a sample cluster DataFrame
    print("🔧 TESTING WITH SAMPLE CLUSTER DATA")
    print("="*60)
    
    # Create sample cluster data for testing with real government document titles
    sample_data = {
        'source': ['gov', 'gov', 'news', 'news'],
        'type': ['primary', 'primary', 'news', 'news'],
        'title': [
            'Federal Funding Impacts on Education: Loan Repayment and Funding Freezes',
            'Infrastructure Investment and Jobs Act Implementation',
            'New Climate Policies Announced',
            'Green Energy Investment Surge'
        ],
        'text': ['Sample text 1', 'Sample text 2', 'Sample text 3', 'Sample text 4'],
        'url': ['url1', 'url2', 'url3', 'url4'],
        'keyword': ['education', 'infrastructure', 'climate', 'energy']
    }
    
    sample_df = pd.DataFrame(sample_data)
    print("Sample cluster DataFrame:")
    print(sample_df)
    
    # Test get_bills functionality using primary document titles from cluster_df
    print("\n🚀 TESTING GET_BILLS FUNCTIONALITY WITH PRIMARY DOCUMENT TITLES")
    test_get_bills(sample_df)
    
    print("\n" + "="*60)
    print("🔧 TESTING FULL get_bills() FUNCTION WITH SAMPLE DATA")
    print("="*60)
    
    print("\nTesting get_bills with sample data...")
    enhanced_df = get_bills(sample_df)
    
    print("\nEnhanced DataFrame with bills column:")
    print(enhanced_df[['type', 'title', 'bills']])
    
    # Show bill details for primary documents
    primary_docs = enhanced_df[enhanced_df['type'] == 'primary']
    for idx, row in primary_docs.iterrows():
        bills = row['bills']
        if bills:
            print(f"\nBills found for '{row['title']}':")
            for i, bill in enumerate(bills[:2]):  # Show first 2 bills
                print(f"  {i+1}. {bill.get('title', 'No title')} (Score: {bill.get('similarity_score', 0):.4f})")
