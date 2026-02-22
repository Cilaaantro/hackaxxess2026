"""
med_recommender.py — OTC Medication Recommender via Featherless AI
------------------------------------------------------------------
Given a disease or illness as text input, this module:
  - Determines if the condition is SEVERE → recommends a specialist doctor
  - Determines if the condition is MILD/MODERATE → recommends OTC medications
    with dosage directions

Can be used standalone (CLI) or imported into the FastAPI app.
"""

import requests

FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions"
DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"

# After
SYSTEM_PROMPT = """You are a medical assistant. Be brief and direct. No introductions, no filler.

If the condition is SEVERE (cancer, heart disease, stroke, organ failure, serious infection, etc.):
- One sentence: state it is serious.
- Specialist to see: [name the exact type of doctor]
- Reason: [one sentence why]

If the condition is MILD (cold, flu, fever, headache, allergies, sore throat, minor pain, etc.):
- Medications (list 2-3):
  • [Brand / Generic] — [dose] — [how often] — [one warning if any]
- Do: [2-3 bullet care tips, e.g. rest, fluids]
- Avoid: [1-2 things to avoid]

End with one line: "See a doctor if symptoms worsen or last more than X days."
No lengthy explanations. No disclaimers beyond the final line."""


def get_otc_recommendation(disease: str, api_key: str, model: str = DEFAULT_MODEL) -> dict:
    """
    Call Featherless AI to get an OTC medication recommendation for a given disease.

    Args:
        disease:  The disease or illness string entered by the user.
        api_key:  Your Featherless.ai API key.
        model:    Featherless model string.

    Returns:
        dict with keys: disease (str), recommendation (str), model_used (str)
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"I think I might have: {disease}"},
        ],
        "temperature": 0.2,
        "max_tokens": 800,
    }

    response = requests.post(FEATHERLESS_API_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()

    data = response.json()
    recommendation = data["choices"][0]["message"]["content"]

    return {
        "disease": disease,
        "recommendation": recommendation,
        "model_used": model,
    }


# ── CLI entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    import sys
    from dotenv import load_dotenv

    load_dotenv()

    api_key = os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        print("ERROR: Set FEATHERLESS_API_KEY in your .env file or environment.")
        sys.exit(1)

    print("=" * 60)
    print("       MedAssist — OTC Medication Recommender")
    print("=" * 60)
    print("NOTE: For informational purposes only. Always consult a")
    print("licensed physician for medical advice.\n")

    while True:
        disease = input("Enter a disease or illness (or 'quit' to exit): ").strip()

        if disease.lower() in ("quit", "exit", "q"):
            print("Stay healthy!")
            break

        if not disease:
            print("Please enter a valid condition.\n")
            continue

        print("\nFetching recommendation...\n")
        try:
            result = get_otc_recommendation(disease, api_key)
            print("-" * 60)
            print(result["recommendation"])
            print("-" * 60)
        except requests.exceptions.HTTPError as e:
            print(f"API Error {e.response.status_code}: {e.response.text}")
        except requests.exceptions.ConnectionError:
            print("Connection error: Could not reach the Featherless API.")
        except Exception as e:
            print(f"Unexpected error: {e}")
        print()