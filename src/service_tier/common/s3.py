import boto3
import pickle
import os

bucket_name = os.getenv("ASTRA_BUCKET_NAME")
print(f"Astra Bucket name is {bucket_name}")

# Centralized area to define where various stuff is in S3 bucket
def s3LocationMapping(user_id, episode_number, type):
    if (type == "USER_TOPICS"):
        return f"user/{user_id}/user_topics.pkl"
    elif (type == "PULSE"):
        return f"user/{user_id}/pulse.pkl"
    elif (type == "EMAIL"):
        return f"user/{user_id}/{episode_number}/email.pkl"
    elif (type == "PODCAST"):
        return f"user/{user_id}/{episode_number}/podcast.wav"
    else:
        print(f"Unsupported type {type}")

def get_s3_url(user_id, episode_number, type):
    object_key = s3LocationMapping(user_id, episode_number, type)
    return f'https://{bucket_name}.s3.us-east-1.amazonaws.com/{object_key}'

def save_serialized(user_id, episode_number, type, data):
    object_key = s3LocationMapping(user_id, episode_number, type)
    # Serialize the data
    serialized_data = pickle.dumps(data)

    # Upload to S3
    try:
        s3 = boto3.client('s3')
        s3.put_object(Bucket=bucket_name, Key=object_key, Body=serialized_data)
        print('Saved serialized data')
    except Exception as e:
        print(f"Error saving to bucket {e}")

def restore_serialized(user_id, episode_number, type):
    object_key = s3LocationMapping(user_id, episode_number, type)
    # Download serialized data from S3
    s3 = boto3.client('s3')

    try:
        response = s3.get_object(Bucket=bucket_name, Key=object_key)
        serialized_data = response['Body'].read()
        print('Retrieved serialized data')
    except Exception as e:
        print(f"Error reading from bucket {e}")
        return {}

    # Deserialize the data
    data = pickle.loads(serialized_data)
    return data

def save(user_id, episode_number, type, f_path):
    object_key = s3LocationMapping(user_id, episode_number, type)
    # Upload to S3
    try:
        s3 = boto3.client('s3')

        with open(f_path, 'rb') as f:
            s3.upload_fileobj(f, bucket_name, object_key)
        print('Saved data')
    except Exception as e:
        print(f"Error saving to bucket {e}")

def restore(user_id, episode_number, type, f_path):
    object_key = s3LocationMapping(user_id, episode_number, type)
    # Download data from S3
    s3 = boto3.client('s3')

    try:
        with open(f_path, 'wb') as f:
            s3.download_fileobj(bucket_name, object_key, f)
        print('Retrieved data')
    except Exception as e:
        print(f"Error reading from bucket {e}")
        return {}
    

def restore_from_system(type, f_path):
    object_key = "system/intro_music.wav"
    # Download data from S3
    s3 = boto3.client('s3')

    # Check if the object exists before attempting to download
    try:
        with open(f_path, 'wb') as f:
            s3.download_fileobj(bucket_name, object_key, f)
        print('Retrieved data')
    except s3.exceptions.NoSuchKey:
        print(f"Error: Object with key '{object_key}' does not exist in the bucket.")
        return {}
    except Exception as e:
        print(f"Error reading from bucket: {e}")
        return {}