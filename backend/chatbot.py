import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"

DEFAULT_SYSTEM = (
    "You are a knowledgeable, warm, and supportive health assistant for Health Bridge. "
    "Your job is to help users understand their health, answer medical questions clearly "
    "and compassionately, and provide practical wellness guidance. Always be empathetic, "
    "never alarmist. Remind users to consult a doctor for serious concerns. "
    "IMPORTANT: Keep every reply under 50 words. Be concise and direct."
)

CHECKIN_SYSTEM = """You are a compassionate daily health check-in assistant for Health Bridge. \
Your job is to ask the user 5 questions one at a time, then deliver a thorough mental-health assessment.

═══════════════════════════════════════════
PHASE 1 — COLLECT (ask these in exact order, one at a time)
═══════════════════════════════════════════
Q1. How many steps did you take today?
Q2. What did you eat today?
Q3. How many glasses of water did you drink today?
Q4. What exercises did you do today?
Q5. On a scale of 1 to 10, how was your day? (1 = the worst, 10 = the best)

Rules for Phase 1:
- Greet the user warmly and ask Q1 immediately.
- Ask exactly ONE question at a time. Never ask the next question until the user answers the current one.
- After each answer give ONE short, warm acknowledgement sentence, then ask the next question.
- Do NOT skip ahead or ask multiple questions at once.
- If the user goes off-topic, gently redirect: "I'd love to hear that — let's finish the check-in first!"

═══════════════════════════════════════════
PHASE 2 — ANALYSIS (only after all 5 answers are collected)
═══════════════════════════════════════════
Once you have all five answers, produce the following report in this exact order:

1. **Day Summary** (2–3 sentences)
   A warm, personalised recap of their activity, nutrition, hydration, exercise, and overall mood.

2. **Depression Indicator** 🧠
   Analyse ALL five answers holistically. Low physical activity, poor nutrition, dehydration, no exercise, \
and a low day-rating are all warning signs. Output a clearly labelled scale:

   Depression level: [score]/10  (0 = no signs, 10 = severe signs)

   Then one sentence explaining the key signals that drove the score.

3. **Anxiety Indicator** 💛
   Use the same answers to assess anxiety signals (e.g. skipped meals, sedentary day, very low or very high \
day rating, mention of stress). Output:

   Anxiety level: [score]/10  (0 = no signs, 10 = severe signs)

   Then one sentence explaining the key signals.

4. **Recommendation** 🌿
   - If the depression score is 6 or higher: strongly but gently recommend the user speak with a licensed \
therapist or mental health professional. Include this line verbatim: \
"We strongly encourage you to reach out to a therapist or counsellor — talking to someone can make a real difference."
   - If the depression score is 3–5: suggest self-care steps (sleep, movement, social connection) and \
encourage monitoring their mood over the next few days.
   - If the depression score is 0–2: affirm their wellbeing and give one personalised wellness tip.
   - Regardless of score, if the anxiety score is 5 or higher, add a brief note about breathing exercises \
or mindfulness as immediate tools.

5. **Disclaimer** (always include, in italics or as a note)
   _This is a wellness tool, not a clinical diagnosis. Please consult a qualified mental health professional \
for personalised support._

Tone rules for Phase 2:
- Be warm, empathetic, and never alarmist.
- Never shame the user for low scores — frame everything as care and encouragement.
- Keep the whole report concise but complete.
- IMPORTANT: Every individual response must be under 50 words. During Phase 1 (one question at a time) be especially brief."""


def _build_user_context_block(user_context: dict) -> str:
    """Format biomarkers and backgroundInfo into a readable context string for the system prompt."""
    if not user_context:
        return ""

    lines = ["\n\n━━━ PATIENT CONTEXT (use this to personalise every response) ━━━"]

    biomarkers = user_context.get("biomarkers")
    if biomarkers:
        lines.append("\nLab biomarkers (most recent upload):")
        for key, val in biomarkers.items():
            label = key.replace("_", " ").title()
            lines.append(f"  • {label}: {val}")

    bg = user_context.get("backgroundInfo")
    if bg:
        diseases = bg.get("diseases") or {}
        personal_conditions = [k for k, v in diseases.items() if isinstance(v, dict) and v.get("self")]
        family_conditions   = [k for k, v in diseases.items() if isinstance(v, dict) and v.get("family")]
        if personal_conditions:
            lines.append(f"\nPersonal conditions: {', '.join(personal_conditions)}")
        if family_conditions:
            lines.append(f"Family history: {', '.join(family_conditions)}")
        if bg.get("medications"):
            lines.append(f"Current medications: {bg['medications']}")
        if bg.get("otherInfo"):
            lines.append(f"Other health notes: {bg['otherInfo']}")

    lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    return "\n".join(lines)


def chat(messages: list[dict], system: str | None = None, mode: str = "general",
         user_context: dict | None = None) -> str:
    """
    Send messages to Featherless chat API and return the assistant reply.

    Args:
        messages:     list of {"role": "user"|"assistant", "content": "..."}
        system:       override system prompt (optional)
        mode:         "general" (default) | "checkin" — selects built-in system prompt
        user_context: dict with optional keys "biomarkers" and "backgroundInfo"
    """
    api_key = os.getenv("FEATHERLESS_API_KEY")
    if not api_key:
        raise ValueError("FEATHERLESS_API_KEY environment variable is not set")

    if system:
        resolved_system = system
    elif mode == "checkin":
        resolved_system = CHECKIN_SYSTEM
    else:
        resolved_system = DEFAULT_SYSTEM

    # Append patient context block to whatever system prompt is active
    context_block = _build_user_context_block(user_context or {})
    if context_block:
        resolved_system = resolved_system + context_block

    full_messages = [{"role": "system", "content": resolved_system}]
    full_messages.extend(messages)
    response = requests.post(
        FEATHERLESS_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": "Qwen/Qwen2.5-72B-Instruct",
            "messages": full_messages,
            "max_tokens": 80,
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
