"""Persist last seen punch to avoid duplicates."""
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from config import STATE_PATH, CLOCK_TIMEZONE


CLOCK_TZ = ZoneInfo(CLOCK_TIMEZONE)


def load_last_punch_at() -> datetime | None:
    if not STATE_PATH.exists():
        return None
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        v = data.get("last_punch_at")
        if not v:
            return None
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is not None and dt.utcoffset() == timezone.utc.utcoffset(dt):
            # v3.0.0 wrote local clock times with a +00:00 offset. Reinterpret those wall-clock values locally.
            return dt.replace(tzinfo=CLOCK_TZ)
        return dt
    except Exception:
        return None


def save_last_punch_at(dt: datetime) -> None:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CLOCK_TZ)
    STATE_PATH.write_text(
        json.dumps({"last_punch_at": dt.isoformat()}),
        encoding="utf-8",
    )


def ensure_initial_state(default: datetime) -> datetime:
    """If no state file exists, seed it with `default` to skip historical data."""
    existing = load_last_punch_at()
    if existing is not None:
        return existing
    save_last_punch_at(default)
    return default
