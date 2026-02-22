"""
Vercel serverless entry point.
Vercel looks for a callable named `app` or `handler` in api/index.py.
We import the FastAPI app from main.py (one level up) and expose it here.
"""
import sys
import os

# Make the backend root importable so all relative imports in main.py work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: F401  — Vercel picks up `app` as the ASGI handler
