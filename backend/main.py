import json
import os
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI, File, UploadFile, Depends, Form, HTTPException
from fastapi.responses import Response

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
import requests
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

from extract_bloodwork import extract_bloodwork
from bloodwork_advisor import analyze_bloodwork
from med_recommender import get_otc_recommendation 

from typing import Optional

# Load .env from backend directory so it works regardless of cwd
_load_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_load_env_path)

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import tempfile

from tts import text_to_speech
from chatbot import chat as chatbot_chat
from cal_com import create_booking as cal_create_booking, get_available_slots as cal_get_available_slots

import firebase_admin
from firebase_admin import credentials, auth

app = FastAPI(title="Hack Axxess 2026 API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TranscriptBody(BaseModel):
    transcript: str


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage]
    mode: str = "general"  # "general" | "checkin"
    user_context: dict = {}  # biomarkers + backgroundInfo injected by the frontend


class SendEmailBody(BaseModel):
    email: str


class CreateAppointmentBody(BaseModel):
    start: str  # ISO 8601 UTC, e.g. 2024-08-13T18:00:00Z
    name: str
    email: str
    time_zone: str = "America/New_York"


class MedicationReminderSubscribeBody(BaseModel):
    email: str
    time_zone: str = "America/New_York"
    remind_hour: int = 8    # 0-23 local time
    remind_minute: int = 0  # 0-59


# Medication reminder: subscriber list and "sent today" tracking (backend dir)
_backend_dir = Path(__file__).resolve().parent
_MEDICATION_SUBSCRIBERS_PATH = _backend_dir / "medication_reminder_subscribers.json"
_MEDICATION_SENT_PATH = _backend_dir / "medication_reminder_sent.json"


def _load_medication_subscribers() -> list[dict]:
    if not _MEDICATION_SUBSCRIBERS_PATH.exists():
        return []
    try:
        with open(_MEDICATION_SUBSCRIBERS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_medication_subscribers(subscribers: list[dict]) -> None:
    with open(_MEDICATION_SUBSCRIBERS_PATH, "w", encoding="utf-8") as f:
        json.dump(subscribers, f, indent=2)


def _load_medication_sent_today() -> dict:
    if not _MEDICATION_SENT_PATH.exists():
        return {}
    try:
        with open(_MEDICATION_SENT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_medication_sent_today(sent: dict) -> None:
    with open(_MEDICATION_SENT_PATH, "w", encoding="utf-8") as f:
        json.dump(sent, f, indent=2)


def _send_medication_reminder_email(to_email: str) -> None:
    """Send 8am medication reminder via Resend. Raises on failure."""
    load_dotenv(_load_env_path)
    api_key = (os.getenv("RESEND_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        raise ValueError("RESEND_API_KEY must be set in .env")
    from_email = os.getenv("RESEND_FROM_EMAIL") or "onboarding@resend.dev"
    r = requests.post(
        RESEND_EMAILS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": from_email,
            "to": [to_email],
            "subject": "Reminder: time to take your medication",
            "text": "Good morning!\n\nThis is your daily reminder to take your medication.\n\nStay healthy!",
        },
        timeout=10,
    )
    r.raise_for_status()


def _run_medication_reminders() -> None:
    """For each subscriber, check if it's their custom reminder time and send if not yet sent today."""
    load_dotenv(_load_env_path)
    if not (os.getenv("RESEND_API_KEY") or "").strip():
        return
    now_utc = datetime.now(timezone.utc)
    subscribers = _load_medication_subscribers()
    sent = _load_medication_sent_today()
    today = now_utc.strftime("%Y-%m-%d")
    changed = False
    for sub in subscribers:
        email = (sub.get("email") or "").strip()
        tz_name = (sub.get("time_zone") or "America/New_York").strip()
        remind_hour = int(sub.get("remind_hour", 8))
        remind_minute = int(sub.get("remind_minute", 0))
        if not email:
            continue
        try:
            tz = ZoneInfo(tz_name)
            local = now_utc.astimezone(tz)
            if local.hour != remind_hour or local.minute != remind_minute:
                continue
            if sent.get(email) == today:
                continue
            _send_medication_reminder_email(email)
            sent[email] = today
            changed = True
        except Exception:
            continue
    if changed:
        _save_medication_sent_today(sent)


# Initialize Firebase Admin
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

# CORS for frontend (Vite default port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    result = extract_bloodwork(tmp_path)
    return result

# Firebase token security
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        decoded_token = auth.verify_id_token(credentials.credentials)
        return decoded_token
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/protected")
def protected_route(user=Depends(verify_token)):
    return {
        "message": "You are authenticated",
        "user_id": user["uid"],
        "email": user["email"]
    }

@app.get("/")
def root():
    return {"message": "Hello from Hack Axxess 2026 API"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
def chat_endpoint(body: ChatBody):
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")
    try:
        msg_list = [{"role": m.role, "content": m.content} for m in body.messages]
        reply = chatbot_chat(msg_list, mode=body.mode, user_context=body.user_context or {})
        return {"message": reply}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat failed: {e!s}")


FIREBASE_SEND_EMAIL_URL = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode"


RESEND_EMAILS_URL = "https://api.resend.com/emails"


def _send_welcome_email(to_email: str) -> None:
    """Send a welcome email via Resend API. Raises on failure."""
    api_key = (os.getenv("RESEND_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        raise ValueError("RESEND_API_KEY must be set in .env")
    from_email = os.getenv("RESEND_FROM_EMAIL") or "onboarding@resend.dev"
    r = requests.post(
        RESEND_EMAILS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": from_email,
            "to": [to_email],
            "subject": "Welcome to Bloodwork Analyzer",
            "text": "Hi,\n\nWelcome to Bloodwork Analyzer!\n",
        },
        timeout=10,
    )
    r.raise_for_status()


@app.post("/send-welcome-email")
def send_welcome_email(body: SendEmailBody):
    """Send a custom welcome email: 'Hi, welcome to Bloodwork Analyzer'."""
    email = (body.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    try:
        _send_welcome_email(email)
        return {"message": "Welcome email sent."}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {e!s}")


@app.post("/subscribe-medication-reminder")
def subscribe_medication_reminder(body: MedicationReminderSubscribeBody):
    """Subscribe to a daily medication reminder at a custom local time."""
    email = (body.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    tz = (body.time_zone or "America/New_York").strip()
    remind_hour = max(0, min(23, int(body.remind_hour)))
    remind_minute = max(0, min(59, int(body.remind_minute)))
    # Format display time e.g. "8:05 AM"
    display_hour = remind_hour % 12 or 12
    ampm = "AM" if remind_hour < 12 else "PM"
    display_time = f"{display_hour}:{remind_minute:02d} {ampm}"
    subscribers = _load_medication_subscribers()
    # Update if already subscribed, otherwise append
    existing = next((s for s in subscribers if (s.get("email") or "").strip().lower() == email.lower()), None)
    if existing:
        existing["time_zone"] = tz
        existing["remind_hour"] = remind_hour
        existing["remind_minute"] = remind_minute
    else:
        subscribers.append({"email": email, "time_zone": tz, "remind_hour": remind_hour, "remind_minute": remind_minute})
    _save_medication_subscribers(subscribers)
    return {"message": f"Reminder set for {display_time} daily in your timezone."}


@app.post("/unsubscribe-medication-reminder")
def unsubscribe_medication_reminder(body: SendEmailBody):
    """Unsubscribe from the 8am medication reminder."""
    email = (body.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    subscribers = _load_medication_subscribers()
    subscribers = [s for s in subscribers if (s.get("email") or "").strip().lower() != email.lower()]
    _save_medication_subscribers(subscribers)
    return {"message": "Unsubscribed from medication reminders."}


@app.get("/available-slots")
def available_slots(
    start: str,
    end: str,
    time_zone: str = "America/New_York",
):
    """Return available Cal.com slots for the given date range (start/end as YYYY-MM-DD). Respects your Cal.com availability (e.g. Mon–Fri 9–5)."""
    load_dotenv(_load_env_path)
    event_type_id = os.getenv("CAL_EVENT_TYPE_ID")
    event_type_id = int(event_type_id) if event_type_id and str(event_type_id).isdigit() else None
    event_type_slug = (os.getenv("CAL_EVENT_TYPE_SLUG") or "").strip() or None
    username = (os.getenv("CAL_USERNAME") or "").strip() or None
    organization_slug = (os.getenv("CAL_ORGANIZATION_SLUG") or "").strip() or None
    raw_minutes = os.getenv("CAL_LENGTH_IN_MINUTES")
    duration_minutes = int(raw_minutes) if raw_minutes and str(raw_minutes).isdigit() else None
    try:
        data = cal_get_available_slots(
            start=start.strip(),
            end=end.strip(),
            time_zone=time_zone or "America/New_York",
            event_type_id=event_type_id,
            event_type_slug=event_type_slug,
            username=username,
            organization_slug=organization_slug,
            duration_minutes=duration_minutes,
        )
        return {"slots": data}
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except requests.RequestException as e:
        err = getattr(e, "response", None)
        msg = str(e)
        if err is not None and getattr(err, "text", None):
            try:
                data = err.json()
                msg = data.get("message") or data.get("detail") or msg
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=f"Cal.com slots failed: {msg}")


@app.post("/create-appointment")
def create_appointment(body: CreateAppointmentBody):
    """Create a Cal.com booking. Set CAL_API_KEY and CAL_EVENT_TYPE_ID (or CAL_EVENT_TYPE_SLUG + CAL_USERNAME) in .env."""
    load_dotenv(_load_env_path)
    start = (body.start or "").strip()
    name = (body.name or "").strip()
    email = (body.email or "").strip()
    if not start or not name or not email:
        raise HTTPException(status_code=400, detail="start, name, and email are required")
    event_type_id = os.getenv("CAL_EVENT_TYPE_ID")
    event_type_id = int(event_type_id) if event_type_id and str(event_type_id).isdigit() else None
    event_type_slug = (os.getenv("CAL_EVENT_TYPE_SLUG") or "").strip() or None
    username = (os.getenv("CAL_USERNAME") or "").strip() or None
    organization_slug = (os.getenv("CAL_ORGANIZATION_SLUG") or "").strip() or None
    raw_minutes = os.getenv("CAL_LENGTH_IN_MINUTES")
    length_in_minutes = int(raw_minutes) if raw_minutes and str(raw_minutes).isdigit() else None
    try:
        result = cal_create_booking(
            start=start,
            name=name,
            email=email,
            time_zone=body.time_zone or "America/New_York",
            event_type_id=event_type_id,
            event_type_slug=event_type_slug,
            username=username,
            organization_slug=organization_slug,
            length_in_minutes=length_in_minutes,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except requests.RequestException as e:
        err = getattr(e, "response", None)
        msg = str(e)
        if err is not None and getattr(err, "text", None):
            try:
                data = err.json()
                msg = data.get("message") or data.get("detail") or msg
            except Exception:
                pass
        raise HTTPException(status_code=502, detail=f"Cal.com booking failed: {msg}")


@app.post("/send-password-reset-email")
def send_password_reset_email(body: SendEmailBody):
    """Ask Firebase Auth to send a password reset email to the given address."""
    email = (body.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    api_key = os.getenv("FIREBASE_WEB_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="FIREBASE_WEB_API_KEY is not set")
    try:
        r = requests.post(
            f"{FIREBASE_SEND_EMAIL_URL}?key={api_key}",
            json={"requestType": "PASSWORD_RESET", "email": email},
            timeout=10,
        )
        if r.status_code != 200:
            # Don't leak whether the email exists; return generic message
            return {"message": "If an account exists for this email, a reset link was sent."}
        return {"message": "Password reset email sent."}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {e!s}")


@app.post("/transcript")
def submit_transcript(body: TranscriptBody):
    text = (body.transcript or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Transcript is empty")
    try:
        audio_bytes = text_to_speech(text)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e!s}")
    return Response(content=audio_bytes, media_type="audio/mpeg")

# ── Bloodwork analysis endpoint (existing) ────────────────────────────────────

from typing import Optional
from fastapi import Form

@app.post("/analyze-full")
async def analyze_full(
    file: UploadFile = File(...),
    age: Optional[int] = Form(None),
    sex: Optional[str] = Form(None),
    weight_kg: Optional[float] = Form(None),
    height_cm: Optional[float] = Form(None),
    activity: Optional[str] = Form(None),
    goals: Optional[str] = Form(None),
    diet: Optional[str] = Form(None),
):
    """
    Full bloodwork pipeline:
    1. Extract biomarkers
    2. Build user profile
    3. Send to Featherless
    4. Return structured result
    """

    api_key = os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="FEATHERLESS_API_KEY not set in .env")

    # Save uploaded PDF temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # Step 1: Extract bloodwork
        bloodwork = extract_bloodwork(tmp_path)

        if not bloodwork.get("biomarkers"):
            raise HTTPException(status_code=400, detail="No biomarkers extracted.")

        # Step 2: Build optional user profile
        user_profile = {
            k: v for k, v in {
                "age": age,
                "sex": sex,
                "weight_kg": weight_kg,
                "height_cm": height_cm,
                "activity_level": activity,
                "goals": goals,
                "dietary_restrictions": diet,
            }.items() if v is not None
        }

        # Step 3: Analyze with LLM
        result = analyze_bloodwork(
            bloodwork_data=bloodwork,
            api_key=api_key,
            user_profile=user_profile or None,
            model="deepseek-ai/DeepSeek-R1-0528"
        )

        return {
            "extracted_biomarkers": bloodwork["biomarkers"],
            "flagged_biomarkers": result["flagged_biomarkers"],
            "recommendations": result["recommendations"],
        }

    finally:
        os.unlink(tmp_path)


# ── OTC Medication Recommender endpoint (new) ─────────────────────────────────

class OTCRequest(BaseModel):
    disease: str
    api_key: str = None  # Optional — falls back to env var


@app.post("/recommend-otc")
async def recommend_otc(body: OTCRequest):
    """
    Given a disease or illness name, return OTC medication recommendations
    or a specialist referral if the condition is severe.

    Request body (JSON):
        {
            "disease": "common cold",
            "api_key": "your_featherless_key"   // optional if set in .env
        }
    """
    if not body.disease or not body.disease.strip():
        raise HTTPException(status_code=400, detail="'disease' field cannot be empty.")

    api_key = body.api_key or os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Featherless API key required. Pass 'api_key' in the request body or set FEATHERLESS_API_KEY in .env.",
        )

    try:
        result = get_otc_recommendation(disease=body.disease.strip(), api_key=api_key)
        return result
    except requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Featherless API error: {e.response.status_code} - {e.response.text}")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Could not connect to Featherless API.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))