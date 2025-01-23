import common.s3


class UserTopicsOutput:
    def __init__(self, user_id):
        data = common.s3.restore_serialized(user_id, "USER_TOPICS")
        self.user_embeddings = data["user_embeddings"]
        self.user_input = data["user_input"]
