import common.s3

class PulseOutput:
    def __init__(self, user_id, episode_number):
        data = common.s3.restore_serialized(user_id, episode_number, "PULSE")
        self.all_data = data["final_df"]
