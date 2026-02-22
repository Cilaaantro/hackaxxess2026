import os
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Depends, Form, HTTPException
from fastapi.responses import Response

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
import requests
from dotenv import load_dotenv

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


class SendEmailBody(BaseModel):
    email: str

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