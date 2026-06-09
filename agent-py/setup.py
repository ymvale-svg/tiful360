"""Interactive setup wizard. Writes .env."""
import os
import sys
from pathlib import Path
import requests

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
DEFAULT_INGEST = "https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1"


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    v = input(f"{prompt}{suffix}: ").strip()
    return v or default


def load_existing() -> dict:
    if not ENV_PATH.exists():
        return {}
    out = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def pick_company(token: str, ingest_url: str) -> str | None:
    try:
        r = requests.get(
            f"{ingest_url.rstrip('/')}/list-companies-for-agent",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        companies = r.json().get("companies", [])
    except Exception as e:
        print(f"  ! could not fetch companies: {e}")
        return None
    if not companies:
        print("  ! no companies returned")
        return None
    print("\nCompanies:")
    for i, c in enumerate(companies, 1):
        print(f"  {i}. {c.get('name')}  ({c.get('id')})")
    while True:
        s = input("Pick number: ").strip()
        if s.isdigit() and 1 <= int(s) <= len(companies):
            return companies[int(s) - 1]["id"]


def main():
    print("=== Tiful360 Attendance Agent — Setup ===\n")
    existing = load_existing()

    ingest = ask("Ingest URL", existing.get("INGEST_URL", DEFAULT_INGEST))
    token = ask("Ingest token (ATTENDANCE_INGEST_TOKEN)", existing.get("INGEST_TOKEN", ""))
    while not token:
        token = ask("Ingest token is required", "")

    company = existing.get("COMPANY_ID", "")
    company = ask("Company ID (Enter to pick from list)", company)
    if not company:
        company = pick_company(token, ingest) or ""
        while not company:
            company = ask("Company ID required", "")

    ip = ask("Clock IP", existing.get("CLOCK_IP", "192.168.1.201"))
    port = ask("Clock port", existing.get("CLOCK_PORT", "4370"))
    timezone = ask("Clock timezone", existing.get("CLOCK_TIMEZONE", "Asia/Jerusalem"))
    prefix = ask("Employee code prefix (optional)", existing.get("EMPLOYEE_CODE_PREFIX", ""))
    poll = ask("Poll interval seconds", existing.get("POLL_INTERVAL", "30"))

    lines = [
        f"INGEST_URL={ingest}",
        f"INGEST_TOKEN={token}",
        f"COMPANY_ID={company}",
        f"CLOCK_IP={ip}",
        f"CLOCK_PORT={port}",
        f"CLOCK_TIMEZONE={timezone}",
        f"EMPLOYEE_CODE_PREFIX={prefix}",
        f"POLL_INTERVAL={poll}",
        f"HEARTBEAT_INTERVAL=60",
        f"AGENT_VERSION=3.0.1",
        "",
    ]
    ENV_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {ENV_PATH}")
    print("Run:   python main.py")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
