"""Send punches to the ingest edge function."""
import logging
import time
import requests
from zoneinfo import ZoneInfo
from config import INGEST_URL, INGEST_TOKEN, COMPANY_ID, EMPLOYEE_CODE_PREFIX, AGENT_VERSION, CLOCK_IP, CLOCK_TIMEZONE

log = logging.getLogger(__name__)
CLOCK_TZ = ZoneInfo(CLOCK_TIMEZONE)


def _format_code(uid) -> str:
    return f"{EMPLOYEE_CODE_PREFIX}{uid}"


def punch_to_payload(att) -> dict:
    # pyzk Attendance: .user_id, .timestamp (datetime), .status, .punch
    ts = att.timestamp
    if ts.tzinfo is None:
        # Clock has no tz — treat as local clock time and include its timezone offset.
        iso = ts.replace(tzinfo=CLOCK_TZ).isoformat()
    else:
        iso = ts.isoformat()
    direction = "unknown"
    try:
        # pyzk punch codes: 0=check-in, 1=check-out
        if att.punch == 0:
            direction = "in"
        elif att.punch == 1:
            direction = "out"
    except Exception:
        pass
    return {
        "company_id": COMPANY_ID,
        "employee_code": _format_code(att.user_id),
        "punch_at": iso,
        "direction": direction,
        "raw": {
            "user_id": str(att.user_id),
            "status": getattr(att, "status", None),
            "punch": getattr(att, "punch", None),
            "agent_version": AGENT_VERSION,
            "clock_ip": CLOCK_IP,
            "clock_timezone": CLOCK_TIMEZONE,
        },
    }


def send_batch(punches: list[dict], max_retries: int = 5) -> bool:
    if not punches:
        return True
    url = f"{INGEST_URL}/ingest-attendance-punch"
    headers = {
        "Authorization": f"Bearer {INGEST_TOKEN}",
        "Content-Type": "application/json",
    }
    delay = 2
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.post(url, json=punches, headers=headers, timeout=30)
            if r.status_code == 200:
                log.info(f"Sent {len(punches)} punches: {r.text[:200]}")
                return True
            log.warning(f"Ingest returned {r.status_code}: {r.text[:300]}")
            if r.status_code in (400, 401, 403):
                return False  # no point retrying
        except Exception as e:
            log.warning(f"Ingest error (attempt {attempt}): {e}")
        time.sleep(delay)
        delay = min(delay * 2, 60)
    return False


def send_in_batches(punches: list[dict], batch_size: int = 100) -> int:
    sent = 0
    for i in range(0, len(punches), batch_size):
        chunk = punches[i : i + batch_size]
        if send_batch(chunk):
            sent += len(chunk)
        else:
            log.error(f"Failed to send batch starting at index {i}")
            break
    return sent
