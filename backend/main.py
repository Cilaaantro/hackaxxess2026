from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Hack Axxess 2026 API")


class TranscriptBody(BaseModel):
    transcript: str


@app.get("/")
def root():
    return {"message": "Hello from Hack Axxess 2026 API"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcript")
def submit_transcript(body: TranscriptBody):
    return {"received": True, "transcript": body.transcript}
