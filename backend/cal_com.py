"""
Cal.com API v2 integration for creating bookings and fetching available slots.
See https://cal.com/docs/api-reference/v2/bookings/create-a-booking
     https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
"""
import os
import re
import requests
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

_CAL_ENV_PATH = Path(__file__).resolve().parent / ".env"

CAL_API_URL = "https://api.cal.com/v2/bookings"
CAL_SLOTS_URL = "https://api.cal.com/v2/slots"
CAL_API_VERSION = "2024-08-13"
CAL_SLOTS_API_VERSION = "2024-09-04"


def _get_cal_api_key() -> str:
    """Load .env from backend dir and read API key; try CAL_API_KEY and CAL_COM_API_KEY."""
    load_dotenv(_CAL_ENV_PATH)
    raw = os.getenv("CAL_API_KEY") or os.getenv("CAL_COM_API_KEY") or ""
    return raw.strip().strip('"').strip("'").strip()


def _normalize_start_iso(start: str) -> str:
    """Ensure start is ISO 8601 UTC ending with Z (e.g. 2024-08-13T09:00:00Z)."""
    s = (start or "").strip()
    if not s:
        return s
    # If it has a timezone offset (e.g. -05:00 or +02:00), parse and convert to UTC
    if re.search(r"[+-]\d{2}:\d{2}$", s) or re.search(r"[+-]\d{2}\d{2}$", s):
        try:
            # fromisoformat accepts 2024-08-13T09:00:00.000-05:00
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            s = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    if s.upper().endswith("Z"):
        s = s[:-1] + "Z"
    if "." in s and "Z" in s.upper():
        s = re.sub(r"\.\d+Z$", "Z", s, flags=re.IGNORECASE)
    elif "." in s:
        s = re.sub(r"\.\d+$", "", s)
    if s and not s.upper().endswith("Z"):
        s = s + "Z" if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", s) else s
    return s


def create_booking(
    start: str,
    name: str,
    email: str,
    time_zone: str = "America/New_York",
    event_type_id: int | None = None,
    event_type_slug: str | None = None,
    username: str | None = None,
    organization_slug: str | None = None,
    length_in_minutes: int | None = None,
) -> dict:
    """
    Create a Cal.com booking.
    start: ISO 8601 datetime in UTC (e.g. 2024-08-13T18:00:00Z).
    name, email: attendee details.
    Identify event type by event_type_id OR (event_type_slug + username).
    """
    api_key = _get_cal_api_key()
    if not api_key:
        raise ValueError(
            "Cal.com API key not found. Set CAL_API_KEY (or CAL_COM_API_KEY) in backend/.env"
        )
    if not event_type_id and not (event_type_slug and username):
        raise ValueError("Set event_type_id OR (event_type_slug and username) in .env or request")
    start_iso = _normalize_start_iso(start)
    payload = {
        "start": start_iso,
        "attendee": {
            "name": name,
            "email": email,
            "timeZone": time_zone,
        },
    }
    if event_type_id is not None:
        payload["eventTypeId"] = int(event_type_id)
    if event_type_slug and username:
        payload["eventTypeSlug"] = event_type_slug
        payload["username"] = username
        if organization_slug:
            payload["organizationSlug"] = organization_slug
    if length_in_minutes is not None:
        payload["lengthInMinutes"] = int(length_in_minutes)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "cal-api-version": CAL_API_VERSION,
    }
    r = requests.post(CAL_API_URL, headers=headers, json=payload, timeout=15)
    if not r.ok:
        try:
            err_body = r.json()
            msg = err_body.get("message") or err_body.get("error") or str(err_body) or r.text or r.reason
        except Exception:
            msg = r.text or r.reason
        raise ValueError(f"Cal.com {r.status_code}: {msg}")
    return r.json()


def get_available_slots(
    start: str,
    end: str,
    time_zone: str = "America/New_York",
    event_type_id: int | None = None,
    event_type_slug: str | None = None,
    username: str | None = None,
    organization_slug: str | None = None,
    duration_minutes: int | None = None,
) -> dict:
    """
    Get available time slots from Cal.com.
    start, end: date or ISO range (e.g. 2025-02-24, 2025-03-10) in UTC.
    Returns Cal.com response data: { "YYYY-MM-DD": [ { "start", "end" }, ... ], ... }.
    """
    api_key = _get_cal_api_key()
    if not api_key:
        raise ValueError(
            "Cal.com API key not found. Set CAL_API_KEY (or CAL_COM_API_KEY) in backend/.env"
        )
    if not event_type_id and not (event_type_slug and username):
        raise ValueError("Set event_type_id OR (event_type_slug and username) in .env or request")
    params = {"start": start.strip(), "end": end.strip(), "timeZone": time_zone or "America/New_York", "format": "range"}
    if event_type_id is not None:
        params["eventTypeId"] = event_type_id
    if event_type_slug and username:
        params["eventTypeSlug"] = event_type_slug
        params["username"] = username
        if organization_slug:
            params["organizationSlug"] = organization_slug
    if duration_minutes is not None:
        params["duration"] = duration_minutes
    headers = {
        "Authorization": f"Bearer {api_key}",
        "cal-api-version": CAL_SLOTS_API_VERSION,
    }
    r = requests.get(CAL_SLOTS_URL, params=params, headers=headers, timeout=15)
    if not r.ok:
        try:
            err_body = r.json()
            msg = err_body.get("message") or err_body.get("error") or str(err_body) or r.text or r.reason
        except Exception:
            msg = r.text or r.reason
        raise ValueError(f"Cal.com slots {r.status_code}: {msg}")
    out = r.json()
    data = out.get("data") if isinstance(out, dict) and "data" in out else out
    if not data or not isinstance(data, dict):
        return data
    # Only return slots between 9am and 5pm in the requested timezone
    tz = ZoneInfo(time_zone or "America/New_York")
    filtered = {}
    for date_key, slot_list in data.items():
        if not isinstance(slot_list, list):
            continue
        keep = []
        for slot in slot_list:
            start_str = slot.get("start") if isinstance(slot, dict) else slot
            if not start_str:
                continue
            try:
                dt = datetime.fromisoformat(str(start_str).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                local = dt.astimezone(tz)
                if 9 <= local.hour < 17:
                    keep.append(slot)
            except (ValueError, TypeError):
                keep.append(slot)
        if keep:
            filtered[date_key] = keep
    return filtered
