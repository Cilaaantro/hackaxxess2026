import os
import requests
from dotenv import load_dotenv

load_dotenv()

LEMONFOX_URL = "https://api.lemonfox.ai/v1/audio/speech"


def text_to_speech(text: str, voice: str = "sarah", response_format: str = "mp3") -> bytes:
    """Call LEMONFOX TTS API and return audio bytes."""
    api_key = os.getenv("LEMONFOX_TTS")
    if not api_key:
        raise ValueError("LEMONFOX_TTS environment variable is not set")
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }
    data = {
        "input": text,
        "voice": voice,
        "response_format": response_format,
    }
    response = requests.post(LEMONFOX_URL, headers=headers, json=data, timeout=30)
    response.raise_for_status()
    return response.content


if __name__ == "__main__":
    sample = (
        "Football is a family of team sports in which the object is to get the ball "
        "over a goal line, into a goal, or between goalposts using merely the body."
    )
    audio_bytes = text_to_speech(sample)
    with open("speech.mp3", "wb") as f:
        f.write(audio_bytes)
    print("Wrote speech.mp3")
