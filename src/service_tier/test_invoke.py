# Test lamda invovations locally
import service_dispatcher

user_topics_json = {
    "action": "e_user_topics",
    "payload": {
        "user_id": "5678",
        "user_input": [
            "Generative AI",
            "Data Engineering",
            "Large Language Models",
            "Adversarial Neural Networks",
            "Agentic Frameworks"
        ]
    }
}

pulse_json = {
    "action": "e_pulse",
    "payload": {
        "user_id": "5678",
        "user_name": "Rahil Verma",
        "user_email": "rahilv99@gmail.com",
        "plan": "free",
        "episode": "1"
    }
}

nlp_json = {
    "action": "e_nlp",
    "payload": {
        "user_id": "5678",
        "user_name": "Rahil Verma",
        "user_email": "rahilv99@gmail.com",
        "plan": "plus",
        "episode": "1",
        "ep_type": "pulse"
    }
}

email_json = {
    "action": "e_email",
    "payload": {
        "user_id": "5678",
        "user_email": "rahilv99@gmail.com",
        "episode": "1",
        "ep_type": "pulse"
    }
}

note_json = {
    "action": "e_note",
    "payload": {
        "user_id": "5678",
        "user_name": "Rahil",
        "user_email": "rahilv99@gmail.com",
        "plan": "pro",
        "notes": ["Neuralink Implant", "What is causing the recent stock market downturn?", "How to enter the world of building startups"],
        "episode": "1"
    }
}




test_sqs = {'Records': [{'messageId': '42ed9301-9f03-43a8-88bd-ee1d69ddf566', 
    'receiptHandle': 'AQEBR3BaWBjBb+Trhx/bHBWyVr/Msg6LWURiFqd53TfvWGPwniHH0zwlDY661cmVdCC8tD7MFDcJTP8ggBBmlrpgqAQeo+o/15um6RJJq4gAEt+mHHN1AXFoW52ZutjMeU+DxcPL2wFLCjmOlZXk1Du7RSeyh7Zh23LHF+aFOvaGZxAgDdu4haktQcp2wHTEDr5nHny894hSn39ki7wOw6FIzgDDIGuRf4AewYeJX3I1s6rhESlUfAlCrktQEJYn+rBRWhMkKhPZxCx7HfIPqEv8o4niySe+RbJ7HkHQIym6RZD4FOWzG4AJoBvjP7jCOYZn/2bQ7R0UE9XvmmZ3s/OSAnojNb8OajhnoL/duy8lqBK0Ou8xY2Kbt0oMhE4t94tU8qnaE2TG1hqwVO3DealxSTB9xNSkUAPG+ejz7j9eiKwRsKl202iGwEN1ZjPgC3Yf', 
    'body': '{\n    "action": "e_user_topics",\n    "payload": {\n        "user_id": "5678",\n        "user_input": [\n            "Generative AI",\n            "Data Engineering",\n            "Large Language Models",\n            "Speech Synthesis"\n        ]\n    }\n}\n', 
    'attributes': {'ApproximateReceiveCount': '5', 'SentTimestamp': '1735261784182', 'SenderId': 'AROA32RCUZCBX3GOOROU6:atul.verma@foundryco.com', 'ApproximateFirstReceiveTimestamp': '1735261784183'}, 
    'messageAttributes': {}, 'md5OfBody': '2e85380cd60ad76c246571ca586aeb17', 
    'eventSource': 'aws:sqs', 
    'eventSourceARN': 'arn:aws:sqs:us-east-1:812895225987:CoreStack-AstraSqsQueue178D14DD-Wr6BGmm3P6qv', 'awsRegion': 'us-east-1'}]}

# Invoke main dispatcher
service_dispatcher.handler(test_json, {})