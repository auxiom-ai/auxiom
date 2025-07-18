import os
from datetime import datetime, timedelta
import psycopg2 
import json
import boto3

sqs = boto3.client('sqs')

CLUSTERER_QUEUE_URL = os.getenv("CLUSTERER_QUEUE_URL")
print(f"Astra Queue URL is {CLUSTERER_QUEUE_URL}")

db_access_url = os.environ.get('DB_ACCESS_URL')

def _handler(event, context):
    print("Cron lambda Invoked")


    # handle pulse customers 
    pulse_customers = []
    # Get all active users whose delivery day is today
    today_weekday = datetime.now().weekday() + 1  # Python weekday 0=Mon, 1=Tues and so on
    if today_weekday == 7:
        today_weekday = 0
    user_records = db_getusers(today_weekday)
    print(f"Got {len(user_records)} records from DB")
    for user in user_records:
        user_id, email, name, plan, last_delivered_ts, episode, keywords = user

        if not skip_delivery(last_delivered_ts.timestamp()):
            pulse_customers.append(user_id)
            print(f"Sent pulse for user {email}")
            send_to_clusterer_queue(
                {
                    "action": "e_infer",
                    "payload": {
                        "user_id": user_id,
                        "user_email": email,
                        "plan": plan,
                        "episode": episode,
                        "keywords": keywords,
                        "user_name": name
                    }
                }
            )


def db_getusers(today_weekday):
    try:
        # Connect to the database
        conn = psycopg2.connect(
            dsn=db_access_url
        )
        cursor = conn.cursor()

        query = """
            SELECT id, email, name, plan, delivered as last_delivered_ts, episode, keywords
            FROM users
            WHERE active = %s AND delivery_day = %s
            """
        # Execute the query with parameter substitution
        cursor.execute(query, (True, today_weekday))

        # Fetch all rows
        rows = cursor.fetchall()
        return rows

    except psycopg2.Error as e:
        print(f"Database error: {e}")

    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# DeliveryDay in DB: 0=Sun, 1=Mon and so on
# Special condition check - if user was delivered this week and they changed their preference after
def skip_delivery(last_delivered_ts):
    
    today_dt = datetime.now()
    today_weekday = today_dt.weekday()  # Python weekday 0=Mon, 1=Tues and so on
    
    # We should deliver unless we have already delivered during this week
    monday_date = today_dt - timedelta(days=today_weekday)
    # Get the timestamp for midnight of that Monday
    monday_timestamp = monday_date.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    if last_delivered_ts > monday_timestamp:
        return True
    
    return False


def send_to_clusterer_queue(message):
    """
    Send a message to the SQS queue
    """
    response = sqs.send_message(
        QueueUrl=CLUSTERER_QUEUE_URL,
        MessageBody=json.dumps(message)
    )

def handler(event, context):
    """
    Lambda handler triggered by the scheduled event.
    """
    try:
        _handler(event, context)
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Job executed successfully"})
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
