import boto3
import os          
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import psycopg2 

db_access_url = "postgresql://postgres.uufxuxbilvlzllxgbewh:astrapodcast!@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

def get_emails():
    try:
        conn = psycopg2.connect(dsn=db_access_url)
        cursor = conn.cursor()

        cursor.execute("SELECT email FROM users")
        emails = cursor.fetchall()
        return emails
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def send_email(RECIPIENTS):
    BODY_HTML = ''
    with open('index.html', 'r') as file:
        BODY_HTML = file.read()

    # Create a multipart/mixed parent container
    msg = MIMEMultipart('mixed')
    msg['Subject'] = 'Big things are coming...'
    msg['From'] = "newsletter@auxiomai.com"
    msg['To'] = RECIPIENTS

    # Add the HTML body to the email
    msg_body = MIMEMultipart('alternative')
    html_part = MIMEText(BODY_HTML, 'html', 'utf-8')
    msg_body.attach(html_part)
    msg.attach(msg_body)

    # Send the email
    client = boto3.client('ses',
        region_name="us-east-1",
        aws_access_key_id= os.environ.get('AWS_ACCESS_KEY'), # make sure these are set
        aws_secret_access_key= os.environ.get('AWS_SECRET_KEY') # make sure these are set
        )

    try:
        response = client.send_raw_email(
            Source='newsletter@auxiomai.com',
            Destinations=RECIPIENTS,
            RawMessage={
                'Data': msg.as_string(),
            }
        )
        print("Email sent! Message ID:"),
        print(response['MessageId'])

    except client.exceptions.MessageRejected as e:
        print(f"Email rejected: {e}")
    except client.exceptions.ClientError as e:
        print(f"Unexpected error: {e}")


# Main Execution
def handler(payload):
    #emails = get_emails()
    emails = ['rahilv99@gmail.com']

    send_email(emails)

if __name__ == "__main__":
    handler(None)