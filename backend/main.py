from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tempfile, os
import requests
from dotenv import load_dotenv
from extract_bloodwork import extract_bloodwork
from bloodwork_advisor import analyze_bloodwork
from med_recommender import get_otc_recommendation

load_dotenv()
app = FastAPI(title="bioflow.ai API")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok"}


# ── Bloodwork analysis endpoint (existing) ────────────────────────────────────

@app.post("/analyze")
async def analyze(file: UploadFile = File(...), api_key: str = Form(...)):
    """
    Upload a bloodwork PDF and receive a personalized meal plan + exercise program.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        bloodwork = extract_bloodwork(tmp_path)
        result = analyze_bloodwork(bloodwork, api_key)
        return result
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