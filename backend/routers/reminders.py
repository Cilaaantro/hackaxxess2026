from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import pytz

scheduler = BackgroundScheduler()

def check_and_send_reminders():
    now_utc = datetime.utcnow()

    reminders = db.collection("reminders").where("active", "==", True).stream()

    for doc in reminders:
        data = doc.to_dict()
        user_timezone = pytz.timezone(data["timezone"])
        user_time = now_utc.astimezone(user_timezone).strftime("%H:%M")

        if user_time == data["time"]:
            send_email(data["email"])

scheduler.add_job(check_and_send_reminders, "interval", minutes=1)
scheduler.start()