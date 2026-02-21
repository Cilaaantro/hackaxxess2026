import json
import requests
from typing import Optional

# ── Configuration ────────────────────────────────────────────────────────────

FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-0528"   # swap to any model on Featherless

# Reference ranges used to give the LLM context about what's normal/abnormal
REFERENCE_RANGES = {
    "total_cholesterol": {"low": 0,   "optimal_low": 0,   "optimal_high": 200, "high": 240,  "unit": "mg/dL"},
    "ldl":               {"low": 0,   "optimal_low": 0,   "optimal_high": 100, "high": 160,  "unit": "mg/dL"},
    "hdl":               {"low": 40,  "optimal_low": 60,  "optimal_high": 999, "high": 999,  "unit": "mg/dL"},
    "triglycerides":     {"low": 0,   "optimal_low": 0,   "optimal_high": 150, "high": 200,  "unit": "mg/dL"},
    "glucose":           {"low": 70,  "optimal_low": 70,  "optimal_high": 100, "high": 126,  "unit": "mg/dL"},
    "hba1c":             {"low": 0,   "optimal_low": 0,   "optimal_high": 5.7, "high": 6.5,  "unit": "%"},
    "hemoglobin":        {"low": 12,  "optimal_low": 13.5,"optimal_high": 17.5,"high": 999,  "unit": "g/dL"},
    "hematocrit":        {"low": 36,  "optimal_low": 41,  "optimal_high": 53,  "high": 999,  "unit": "%"},
    "wbc":               {"low": 4.5, "optimal_low": 4.5, "optimal_high": 11,  "high": 11,   "unit": "K/uL"},
    "platelets":         {"low": 150, "optimal_low": 150, "optimal_high": 400, "high": 400,  "unit": "K/uL"},
    "vitamin_d":         {"low": 20,  "optimal_low": 40,  "optimal_high": 80,  "high": 100,  "unit": "ng/mL"},
    "vitamin_b12":       {"low": 200, "optimal_low": 400, "optimal_high": 900, "high": 999,  "unit": "pg/mL"},
    "ferritin":          {"low": 12,  "optimal_low": 30,  "optimal_high": 300, "high": 300,  "unit": "ng/mL"},
    "iron":              {"low": 60,  "optimal_low": 80,  "optimal_high": 170, "high": 170,  "unit": "ug/dL"},
    "tsh":               {"low": 0.4, "optimal_low": 0.4, "optimal_high": 4.0, "high": 4.0,  "unit": "mIU/L"},
    "creatinine":        {"low": 0.6, "optimal_low": 0.7, "optimal_high": 1.2, "high": 1.3,  "unit": "mg/dL"},
    "bun":               {"low": 7,   "optimal_low": 7,   "optimal_high": 20,  "high": 25,   "unit": "mg/dL"},
    "alt":               {"low": 0,   "optimal_low": 0,   "optimal_high": 40,  "high": 56,   "unit": "U/L"},
    "ast":               {"low": 0,   "optimal_low": 0,   "optimal_high": 40,  "high": 56,   "unit": "U/L"},
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _flag_biomarkers(biomarkers: dict) -> dict:
    """
    Compare each biomarker against reference ranges and attach a status flag.
    Returns a dict: { marker: { value, unit, status, reference } }
    """
    flagged = {}
    for marker, value in biomarkers.items():
        ref = REFERENCE_RANGES.get(marker)
        if ref is None:
            flagged[marker] = {"value": value, "unit": "unknown", "status": "no_reference"}
            continue

        unit = ref["unit"]
        if value < ref["low"]:
            status = "low"
        elif value > ref["high"]:
            status = "high"
        elif value < ref["optimal_low"] or value > ref["optimal_high"]:
            status = "borderline"
        else:
            status = "optimal"

        flagged[marker] = {
            "value": value,
            "unit": unit,
            "status": status,
            "reference": f"{ref['optimal_low']}–{ref['optimal_high']} {unit} (optimal)",
        }
    return flagged


def _build_system_prompt() -> str:
    return (
        "You are a certified clinical nutritionist and exercise physiologist. "
        "You analyze blood work data and provide evidence-based, personalized meal plans "
        "and exercise programs. Always:\n"
        "- Explain WHY each recommendation ties back to specific biomarker findings.\n"
        "- Prioritize safety — flag anything that warrants a doctor's visit.\n"
        "- Keep language clear, practical, and actionable.\n"
        "- Format your response with clear sections: "
        "**Summary**, **Key Concerns**, **7-Day Meal Plan**, **Exercise Program**, "
        "**Supplements to Consider**, **When to See a Doctor**.\n"
        "- Do NOT provide medical diagnoses."
    )


def _build_user_prompt(flagged: dict, user_profile: Optional[dict] = None) -> str:
    profile_text = ""
    if user_profile:
        profile_text = (
            f"\n\nUser profile:\n"
            f"- Age: {user_profile.get('age', 'unknown')}\n"
            f"- Sex: {user_profile.get('sex', 'unknown')}\n"
            f"- Weight: {user_profile.get('weight_kg', 'unknown')} kg\n"
            f"- Height: {user_profile.get('height_cm', 'unknown')} cm\n"
            f"- Activity level: {user_profile.get('activity_level', 'unknown')}\n"
            f"- Health goals: {user_profile.get('goals', 'general wellness')}\n"
            f"- Dietary restrictions: {user_profile.get('dietary_restrictions', 'none')}\n"
        )

    markers_text = json.dumps(flagged, indent=2)

    return (
        f"Here are the patient's blood work results with status flags:{profile_text}\n\n"
        f"```json\n{markers_text}\n```\n\n"
        "Please provide a comprehensive, personalized meal plan and exercise program "
        "based on these results. Explain each recommendation in the context of the "
        "specific biomarker values shown above."
    )


# ── Main public function ──────────────────────────────────────────────────────

def analyze_bloodwork(
    bloodwork_data: dict,
    api_key: str,
    user_profile: Optional[dict] = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 3000,
) -> dict:
    """
    Send parsed bloodwork JSON to Featherless.ai (DeepSeek) and get back
    a personalized meal plan + exercise program.

    Args:
        bloodwork_data:  Output dict from extract_bloodwork() — must have a 'biomarkers' key.
        api_key:         Your Featherless.ai API key.
        user_profile:    Optional dict with keys: age, sex, weight_kg, height_cm,
                         activity_level, goals, dietary_restrictions.
        model:           Featherless model string.
        max_tokens:      Max response tokens.

    Returns:
        dict with keys: flagged_biomarkers, raw_response, recommendations (str)
    """
    biomarkers = bloodwork_data.get("biomarkers", {})
    if not biomarkers:
        raise ValueError("No biomarkers found in bloodwork_data. Run extract_bloodwork() first.")

    # Flag each marker vs. reference ranges
    flagged = _flag_biomarkers(biomarkers)

    # Build prompts
    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(flagged, user_profile)

    # Call Featherless.ai  (OpenAI-compatible endpoint)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }

    response = requests.post(FEATHERLESS_API_URL, headers=headers, json=payload, timeout=120)
    response.raise_for_status()

    data = response.json()
    recommendations = data["choices"][0]["message"]["content"]

    return {
        "filename": bloodwork_data.get("filename", "unknown"),
        "flagged_biomarkers": flagged,
        "model_used": model,
        "recommendations": recommendations,
    }