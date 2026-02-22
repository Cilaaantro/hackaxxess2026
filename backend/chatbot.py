
from dotenv import load_dotenv
import requests
import os

load_dotenv()

response = requests.post(
    url="https://api.featherless.ai/v1/chat/completions",
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('FEATHERLESS_API_KEY')}"
    },
    json={
        "model": "deepseek-ai/DeepSeek-V3.2",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello! How are you?"}
        ]
    }
)
print(response.json()["choices"][0]["content"])