import os
from datetime import datetime, timedelta
import psycopg2 
import json
import boto3

sqs = boto3.client('sqs')

ASTRA_QUEUE_URL = os.getenv("ASTRA_QUEUE_URL")
print(f"Astra Queue URL is {ASTRA_QUEUE_URL}")

db_access_url = "postgresql://auxiompostgres:astrapodcast!@auxiom-db.cvoqq0ms6fsc.us-east-1.rds.amazonaws.com:5432/postgres"

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
        user_id, name, email, plan, last_delivered_ts, episode, industry = user

        name = name.split(' ')
        name = name[0]
        
        if not skip_delivery(last_delivered_ts.timestamp()):
            pulse_customers.append(user_id)
            print(f"Sent pulse for user {email}")
            send_to_sqs(
                {
                    "action": "e_pulse",
                    "payload": {
                        "user_id": user_id,
                        "user_name": name,
                        "user_email": email,
                        "plan": plan,
                        "episode": episode,
                        "industry": industry
                    }
                }
            )
    
    # handle notes customers
    user_records = db_getnotes()

    for user in user_records:
        user_id, name, email, plan, note, active_notes, episode = user

        if user_id in pulse_customers:
            print(f"Skipping notes for user {email} as they were already sent pulse")
            continue
        send_to_sqs(
            {
                "action": "e_note",
                "payload": {
                    "user_id": user_id,
                    "user_name": name,
                    "user_email": email,
                    "plan": plan,
                    "notes": note,
                    "episode": episode
                }
            }
        )

        # Clear active notes for the user
        db_clear_active_notes(user_id, active_notes)



def db_getusers(today_weekday):
    try:
        # Connect to the database
        conn = psycopg2.connect(
            dsn=db_access_url
        )
        cursor = conn.cursor()

        query = """
            SELECT id, name, email, plan, delivered as last_delivered_ts, episode
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

def db_getnotes():
    try:
        # Connect to the database
        conn = psycopg2.connect(
            dsn=db_access_url
        )
        cursor = conn.cursor()

        # Query to retrieve users with non-empty active_notes
        query = """
            SELECT id, name, email, plan, note, active_notes, episode
            FROM users
            WHERE jsonb_array_length(active_notes) > 0
            """
        # Execute the query
        cursor.execute(query)

        # Fetch all rows
        rows = cursor.fetchall()

        # Process rows to parse jsonb columns
        processed_rows = []
        for row in rows:
            user_id, user_name, user_email, plan, note, active_notes, episode = row
            
            # Deserialize notes and active_notes from JSONB into Python lists
            notes_list = json.loads(note) if note else []
            active_notes_list = json.loads(active_notes) if active_notes else []

            # Get the specific notes indexed by active_notes
            indexed_notes = [notes_list[i] for i in active_notes_list if i < len(notes_list)]

            processed_rows.append({
                "user_id": user_id,
                "user_name": user_name,
                "user_email": user_email,
                "plan": plan,
                "note": indexed_notes,
                "active_notes": active_notes_list,
                "episode": episode
            })

        return processed_rows

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return []

    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def db_clear_active_notes(user_id, active_notes):
    try:
        # Connect to the database
        conn = psycopg2.connect(
            dsn=db_access_url
        )
        cursor = conn.cursor()

        # Fetch current notes for the given user
        cursor.execute(
            """
            SELECT note
            FROM users
            WHERE id = %s
            """,
            (user_id,)
        )
        result = cursor.fetchone()

        if not result:
            print(f"User with ID {user_id} not found.")
            return

        # Parse notes from JSONB
        notes = json.loads(result[0]) if result[0] else []

        # Remove notes specified by indices in active_notes
        filtered_notes = [
            note for i, note in enumerate(notes) if i not in active_notes
        ]

        # Update notes and reset active_notes in the database
        cursor.execute(
            """
            UPDATE users
            SET note = %s,
                active_notes = '[]'::jsonb
            WHERE id = %s
            """,
            (json.dumps(filtered_notes), user_id)
        )

        # Commit changes
        conn.commit()
        print(f"Successfully cleared active notes for user {user_id}.")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()

    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def send_to_sqs(message):
    """
    Send a message to the SQS queue
    """
    response = sqs.send_message(
        QueueUrl=ASTRA_QUEUE_URL,
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
