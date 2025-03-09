from pulse import handler

def test_handler():
    payload = {
        "user_id": "12345",
        "user_name": "John Doe",
        "user_email": "john.doe@example.com",
        "plan": "premium",
        "episode": "episode_1",
        "industry": "Technology",
        "user_input": ["artificial intelligence", "machine learning"]
    }
    handler(payload)

if __name__ == "__main__":
    print("Testing pulse handler!")
    test_handler()
