from sentence_transformers import SentenceTransformer, util
import common.s3

# Lightweight and effective model
model = SentenceTransformer('./saved_model/all-MiniLM-L6-v2')

# Number of top matches to consider for each keyword
DEFATULT_TOP_TAXONOMY_MATCHES = 3


class UserTopics:
    def __init__(self, user_id, user_input):  # Hardcoded for now
        user_input = [x.lower() for x in user_input]
        self.user_id = user_id
        self.user_input = user_input
        self.user_embeddings = model.encode(
            " ".join(self.user_input), convert_to_tensor=True)

        # Save output to S3
        print('Trying to save output')
        common.s3.save_serialized(self.user_id, "USER_TOPICS", {
            "user_embeddings": self.user_embeddings,
            "user_input": self.user_input
        })

# Main Execution


def handler(payload):
    user_input = payload.get("user_input")
    user_id = payload.get("user_id")
    if (user_input == None):
        print('User Topics: No input specified - using default')
        user_input = ['Generative AI', 'Data Engineering',
                      'Large Language Models', 'Speech Synthesis']
    print(f"User Input Is: {user_input}")
    try:
        # FROM RAHIL - why assign user_topics? You can just statically call UserTopics(user_id, user_input)
        user_topics = UserTopics(user_id, user_input)
    except Exception as e:
        print(f"Got Exception {e}")


if __name__ == "__main__":
    handler(None)
