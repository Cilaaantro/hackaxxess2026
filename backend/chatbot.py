import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"
DEFAULT_SYSTEM = "You are a helpful assistant."


def chat(messages: list[dict], system: str | None = None) -> str:
    """
    Send messages to Featherless chat API and return the assistant reply.
    messages: list of {"role": "user"|"assistant", "content": "..."}
    """
    api_key = os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        raise ValueError("FEATHERLESS_API_KEY environment variable is not set")
    full_messages = [{"role": "system", "content": system or DEFAULT_SYSTEM}]
    full_messages.extend(messages)
    response = requests.post(
        FEATHERLESS_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": "deepseek-ai/DeepSeek-V3.2",
            "messages": full_messages,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("No choices in chat response")
    first = choices[0]
    content = first.get("content") or (first.get("message", {}) or {}).get("content")
    if content is None:
        raise ValueError("No content in chat choice")
    return content.strip()
