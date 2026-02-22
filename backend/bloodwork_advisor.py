import json
import requests
import re
from typing import Optional

FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-0528"

# Reference ranges (same as before)
REFERENCE_RANGES = {
    "total_cholesterol": {"low": 0, "optimal_low": 0, "optimal_high": 200, "high": 240, "unit": "mg/dL"},
    "ldl": {"low": 0, "optimal_low": 0, "optimal_high": 100, "high": 160, "unit": "mg/dL"},
    "hdl": {"low": 40, "optimal_low": 60, "optimal_high": 999, "high": 999, "unit": "mg/dL"},
    "triglycerides": {"low": 0, "optimal_low": 0, "optimal_high": 150, "high": 200, "unit": "mg/dL"},
    "glucose": {"low": 70, "optimal_low": 70, "optimal_high": 100, "high": 126, "unit": "mg/dL"},
    "hba1c": {"low": 0, "optimal_low": 0, "optimal_high": 5.7, "high": 6.5, "unit": "%"},
    "hemoglobin": {"low": 12, "optimal_low": 13.5, "optimal_high": 17.5, "high": 999, "unit": "g/dL"},
    "hematocrit": {"low": 36, "optimal_low": 41, "optimal_high": 53, "high": 999, "unit": "%"},
    "wbc": {"low": 4.5, "optimal_low": 4.5, "optimal_high": 11, "high": 11, "unit": "K/uL"},
    "platelets": {"low": 150, "optimal_low": 150, "optimal_high": 400, "high": 400, "unit": "K/uL"},
    "vitamin_d": {"low": 20, "optimal_low": 40, "optimal_high": 80, "high": 100, "unit": "ng/mL"},
    "vitamin_b12": {"low": 200, "optimal_low": 400, "optimal_high": 900, "high": 999, "unit": "pg/mL"},
    "ferritin": {"low": 12, "optimal_low": 30, "optimal_high": 300, "high": 300, "unit": "ng/mL"},
    "iron": {"low": 60, "optimal_low": 80, "optimal_high": 170, "high": 170, "unit": "ug/dL"},
    "tsh": {"low": 0.4, "optimal_low": 0.4, "optimal_high": 4.0, "high": 4.0, "unit": "mIU/L"},
    "creatinine": {"low": 0.6, "optimal_low": 0.7, "optimal_high": 1.2, "high": 1.3, "unit": "mg/dL"},
    "bun": {"low": 7, "optimal_low": 7, "optimal_high": 20, "high": 25, "unit": "mg/dL"},
    "alt": {"low": 0, "optimal_low": 0, "optimal_high": 40, "high": 56, "unit": "U/L"},
    "ast": {"low": 0, "optimal_low": 0, "optimal_high": 40, "high": 56, "unit": "U/L"},
}

def _flag_biomarkers(biomarkers: dict) -> dict:
    flagged = {}
    for marker, value in biomarkers.items():
        ref = REFERENCE_RANGES.get(marker)
        if not ref:
            flagged[marker] = {"value": value, "unit": "unknown", "status": "no_reference"}
            continue
        if value < ref["low"]:
            status = "low"
        elif value > ref["high"]:
            status = "high"
        elif value < ref["optimal_low"] or value > ref["optimal_high"]:
            status = "borderline"
        else:
            status = "optimal"
        flagged[marker] = {"value": value, "unit": ref["unit"], "status": status}
    return flagged

def _clean_text(text: str) -> str:
    """Remove reasoning blocks and excessive whitespace."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"\s+\n", "\n", text)  # remove empty lines
    return text.strip()

def _build_system_prompt() -> str:
    return (
        "You are a practical nutrition and fitness coach.\n"
        "RULES:\n"
        "- Output final answer only, in plain text.\n"
        "- Do NOT include reasoning or <think> blocks.\n"
        "- Use short, readable lines.\n"
        "- Separate sections clearly with blank lines.\n"
        "- Sections: Summary, Nutrition Focus, Training Plan, Optional Supplements.\n"
    )

def _build_user_prompt(flagged: dict, user_profile: Optional[dict]) -> str:
    profile_text = ""
    if user_profile:
        profile_text = (
            f"User Profile:\n"
            f"Age: {user_profile.get('age', 'unknown')}\n"
            f"Sex: {user_profile.get('sex', 'unknown')}\n"
            f"Weight: {user_profile.get('weight_kg', 'unknown')} kg\n"
            f"Height: {user_profile.get('height_cm', 'unknown')} cm\n"
            f"Activity: {user_profile.get('activity_level', 'unknown')}\n"
            f"Goals: {user_profile.get('goals', 'general wellness')}\n"
            f"Diet: {user_profile.get('dietary_restrictions', 'none')}\n\n"
        )
    markers_text = json.dumps(flagged, indent=2)
    return (
        f"{profile_text}Bloodwork Results:\n{markers_text}\n\n"
        "Respond exactly in this structure:\n\n"
        "Summary:\n"
        "Nutrition Focus:\n"
        "Training Plan:\n"
        "Optional Supplements:\n"
    )

def analyze_bloodwork(
    bloodwork_data: dict,
    api_key: str,
    user_profile: Optional[dict] = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1200,
) -> dict:

    biomarkers = bloodwork_data.get("biomarkers", {})
    if not biomarkers:
        raise ValueError("No biomarkers found in bloodwork_data.")

    flagged = _flag_biomarkers(biomarkers)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _build_system_prompt()},
            {"role": "user", "content": _build_user_prompt(flagged, user_profile)},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    response = requests.post(FEATHERLESS_API_URL, headers=headers, json=payload, timeout=120)
    response.raise_for_status()
    raw_output = response.json()["choices"][0]["message"]["content"]

    cleaned_output = _clean_text(raw_output)

    return {
        "filename": bloodwork_data.get("filename", "unknown"),
        "flagged_biomarkers": flagged,
        "model_used": model,
        "recommendations": cleaned_output,
    }