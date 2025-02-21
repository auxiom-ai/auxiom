import common.s3

class EmailOutput:
    def __init__(self, user_id, episode_number):
        data = common.s3.restore_serialized(user_id, episode_number, "EMAIL")
        self.email_description = data["email_description"]
        self.episode_title = data["episode_title"]
