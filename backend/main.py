from fastapi import FastAPI, File, UploadFile, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from extract_bloodwork import extract_bloodwork
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import tempfile

from tts import text_to_speech
from chatbot import chat as chatbot_chat

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

# Initialize Firebase Admin
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

app = FastAPI()

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
