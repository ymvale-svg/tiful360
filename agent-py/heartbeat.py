"""Periodic heartbeat to the cloud."""
import logging
import threading
import time
from datetime import datetime, timezone
import requests
from config import (
    INGEST_URL, INGEST_TOKEN, COMPANY_ID, CLOCK_IP, CLOCK_PORT,
    AGENT_VERSION, HEARTBEAT_INTERVAL,
)
from state import load_last_punch_at

log = logging.getLogger(__name__)


def send_once(status: str = "ok", error: str | None = None):
    url = f"{INGEST_URL}/ingest-attendance-heartbeat"
    last = load_last_punch_at()
    payload = {
        "company_id": COMPANY_ID,
        "agent_version": AGENT_VERSION,
        "clock_ip": CLOCK_IP,
        "clock_port": CLOCK_PORT,
        "status": status,
        "error": error,
        "last_punch_at": last.isoformat() if last else None,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        r = requests.post(
            url, json=payload,
            headers={"Authorization": f"Bearer {INGEST_TOKEN}", "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code != 200:
            log.warning(f"Heartbeat {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log.warning(f"Heartbeat failed: {e}")


def start_loop(stop_event: threading.Event):
    def loop():
        while not stop_event.is_set():
            send_once()
            stop_event.wait(HEARTBEAT_INTERVAL)
    t = threading.Thread(target=loop, daemon=True, name="heartbeat")
    t.start()
    return t
