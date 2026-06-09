"""Load configuration from .env."""
import os
from pathlib import Path
from dotenv import load_dotenv
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

AGENT_VERSION = "3.0.1"

INGEST_URL = os.getenv("INGEST_URL", "").rstrip("/")
INGEST_TOKEN = os.getenv("INGEST_TOKEN", "")
COMPANY_ID = os.getenv("COMPANY_ID", "")
CLOCK_IP = os.getenv("CLOCK_IP", "")
CLOCK_PORT = int(os.getenv("CLOCK_PORT", "4370"))
CLOCK_PASSWORD = int(os.getenv("CLOCK_PASSWORD", "0") or "0")
FORCE_UDP = os.getenv("FORCE_UDP", "false").strip().lower() in ("1", "true", "yes")
CLOCK_TIMEZONE = os.getenv("CLOCK_TIMEZONE", "Asia/Jerusalem").strip() or "Asia/Jerusalem"
EMPLOYEE_CODE_PREFIX = os.getenv("EMPLOYEE_CODE_PREFIX", "")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "60"))
# Ignore any clock records older than this ISO date. Defaults to "now" on first run.
MIN_PUNCH_DATE = os.getenv("MIN_PUNCH_DATE", "").strip()

STATE_PATH = BASE_DIR / "state.json"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)


def validate():
    missing = [k for k, v in {
        "INGEST_URL": INGEST_URL,
        "INGEST_TOKEN": INGEST_TOKEN,
        "COMPANY_ID": COMPANY_ID,
        "CLOCK_IP": CLOCK_IP,
    }.items() if not v]
    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}. Run setup.py.")
    try:
        ZoneInfo(CLOCK_TIMEZONE)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(f"Invalid CLOCK_TIMEZONE={CLOCK_TIMEZONE!r}") from exc
