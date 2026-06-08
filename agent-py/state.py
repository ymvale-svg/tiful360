"""Persist last seen punch to avoid duplicates."""
import json
from datetime import datetime, timezone
from config import STATE_PATH


def load_last_punch_at() -> datetime | None:
    if not STATE_PATH.exists():
        return None
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        v = data.get("last_punch_at")
        if not v:
            return None
        return datetime.fromisoformat(v)
    except Exception:
        return None


def save_last_punch_at(dt: datetime) -> None:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    STATE_PATH.write_text(
        json.dumps({"last_punch_at": dt.isoformat()}),
        encoding="utf-8",
    )
