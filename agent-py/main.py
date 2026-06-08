"""Tiful360 Attendance Agent — Python edition (polling-only)."""
import logging
import logging.handlers
import threading
import time
from datetime import datetime, timezone

import config
from config import CLOCK_IP, CLOCK_PORT, POLL_INTERVAL, LOG_DIR, AGENT_VERSION
from state import load_last_punch_at, save_last_punch_at
from uploader import punch_to_payload, send_in_batches
from heartbeat import start_loop as start_heartbeat
import zk_client


def setup_logging():
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(level=logging.INFO, format=fmt)
    fh = logging.handlers.RotatingFileHandler(
        LOG_DIR / "agent.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    fh.setFormatter(logging.Formatter(fmt))
    logging.getLogger().addHandler(fh)


log = logging.getLogger("agent")


def _as_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def filter_new(atts):
    last = load_last_punch_at()
    if last is None:
        return list(atts)
    last = _as_aware(last)
    out = []
    for a in atts:
        ts = _as_aware(a.timestamp)
        if ts > last:
            out.append(a)
    return out


def commit(atts):
    if not atts:
        return
    # Send oldest first so state advances safely
    atts = sorted(atts, key=lambda a: _as_aware(a.timestamp))
    payloads = [punch_to_payload(a) for a in atts]
    sent = send_in_batches(payloads)
    if sent == 0:
        return
    newest = max(_as_aware(a.timestamp) for a in atts[:sent])
    save_last_punch_at(newest)
    log.info(f"Committed {sent}/{len(atts)} punches; last_punch_at={newest.isoformat()}")


def poll_once():
    log.info("Polling clock for attendance…")
    atts = zk_client.fetch_attendance(CLOCK_IP, CLOCK_PORT)
    log.info(f"Clock returned {len(atts)} records")
    new = filter_new(atts)
    log.info(f"{len(new)} new records to send")
    commit(new)


def main():
    setup_logging()
    config.validate()
    log.info(
        f"Tiful360 Agent v{AGENT_VERSION} starting — clock={CLOCK_IP}:{CLOCK_PORT} "
        f"(polling every {POLL_INTERVAL}s)"
    )

    stop_event = threading.Event()
    start_heartbeat(stop_event)

    while not stop_event.is_set():
        try:
            poll_once()
        except Exception as e:
            log.error(f"Poll failed: {e}")
        for _ in range(POLL_INTERVAL):
            if stop_event.is_set():
                break
            time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Stopped.")
