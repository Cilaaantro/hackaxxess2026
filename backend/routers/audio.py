from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException

router = APIRouter(prefix="/upload", tags=["audio"])

AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio"


@router.post("/audio")
async def upload_audio(audio: UploadFile = File(...)):
    if not audio.filename or not audio.filename.lower().endswith(".mp3"):
        raise HTTPException(400, detail="File must be an MP3 audio file")
    contents = await audio.read()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    file_path = AUDIO_DIR / audio.filename
    file_path.write_bytes(contents)
    return {
        "filename": audio.filename,
        "content_type": audio.content_type or "audio/mpeg",
        "size_bytes": len(contents),
        "saved_to": str(file_path),
    }
