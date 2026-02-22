import os
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

from extract_bloodwork import extract_bloodwork

# Load .env from backend directory so it works regardless of cwd
_load_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_load_env_path)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import tempfile

from tts import text_to_speech
from chatbot import chat as chatbot_chat
from cal_com import create_booking as cal_create_booking, get_available_slots as cal_get_available_slots

import firebase_admin
from firebase_admin import credentials, auth

app = FastAPI(title="Hack Axxess 2026 API")


class TranscriptBody(BaseModel):
    transcript: str


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages: list[ChatMessage]


class SendEmailBody(BaseModel):
    email: str


class CreateAppointmentBody(BaseModel):
    start: str  # ISO 8601 UTC, e.g. 2024-08-13T18:00:00Z
    name: str
    email: str
    time_zone: str = "America/New_York"

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
        reply = chatbot_chat(msg_list)
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
