import logic.embed
import logic.infer
import logic.represent_user
import json
import traceback

def _handler(event, context):
    """
    Main Lambda handler
    :param event: Input event with 'action' and 'payload'
    :param context: AWS Lambda context object
    """
     # Check if the event is triggered by SQS
    json_message = None
    if "Records" in event and event["Records"][0].get("eventSource") == "aws:sqs":
        print(f"ServiceTier Lambda Invoked from SQS")
        if len(event["Records"]) > 1:
            print(f"Got {len(event['Records'])} messages, expected 1 - bailing")
            return {
                "statusCode": 400,
                "body": f"Multiple messages unsupported"
            }
        record = event["Records"][0]
        message_body = json.loads(record["body"])
        json_message = message_body
    else:
        print(f"ServiceTier Lambda Invoked manually")
        json_message = event

    # Extract the action and payload
    action = json_message.get('action')
    payload = json_message.get('payload', {})
    print(f"ServiceTier Lambda Invoked with action {action}")

    # Map actions to internal functions
    action_map = {
        "e_embed": logic.embed.handler, # convert raw data sources to stories
        "e_infer": logic.infer.handler, # infer recommendations
        "e_represent_user": logic.represent_user.handler # represent user in embedding space
    }

    # Route to the appropriate function
    if action in action_map:
        result = action_map[action](payload)
    else:
        print(f"Unsupported Action {action}")

def handler(event, context):
    try:
        _handler(event, context)
        return {
            "statusCode": 200,
            "body": "Success"
        }
    except Exception as e:
        print(f"Lambda Exception {e}")
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": f"Error executing action '{event}': {str(e)}"
        }