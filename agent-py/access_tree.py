"""Scan a drive's folder tree and send it to Tiful360 (system access > tree and access groups).

Runs inside the attendance agent when ACCESS_TREE_* is set, or on its own on any machine that
sees the share (for example a scheduled task on the file server):

    python access_tree.py --dry-run   # list what would be sent
    python access_tree.py --once      # scan and send now
    python access_tree.py             # scan now, then every ACCESS_TREE_INTERVAL_HOURS

Only folder names travel, never files or their contents. The scan key is created per system in
the system access screen and opens that one system only.
"""
import argparse
import logging
import os
import socket
import stat
import threading
import time
from collections import deque

import requests
from dotenv import load_dotenv

from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

log = logging.getLogger(__name__)

INGEST_URL = os.getenv("INGEST_URL", "").rstrip("/")
ROOT = os.getenv("ACCESS_TREE_ROOT", "").strip()
SYSTEM_ID = os.getenv("ACCESS_TREE_SYSTEM_ID", "").strip()
TOKEN = os.getenv("ACCESS_TREE_TOKEN", "").strip()
DEPTH = int(os.getenv("ACCESS_TREE_DEPTH", "3") or "3")
INTERVAL_HOURS = float(os.getenv("ACCESS_TREE_INTERVAL_HOURS", "24") or "24")
EXCLUDE = {n.strip().lower() for n in os.getenv("ACCESS_TREE_EXCLUDE", "").split(",") if n.strip()}

MAX_PATHS = 20000
_HIDDEN = getattr(stat, "FILE_ATTRIBUTE_HIDDEN", 0x2) | getattr(stat, "FILE_ATTRIBUTE_SYSTEM", 0x4)
# Folders Windows and backup tools create on shares; never access groups.
_ALWAYS_SKIP = {"$recycle.bin", "system volume information", "~snapshot", ".snapshot", "dfsrprivate"}


def enabled() -> bool:
    return bool(ROOT and SYSTEM_ID and TOKEN and INGEST_URL)


def _skip(entry: os.DirEntry, exclude: set[str]) -> bool:
    name = entry.name.lower()
    if name in _ALWAYS_SKIP or name in exclude or name.startswith((".", "$", "~")):
        return True
    try:
        # Junctions and symlinks could loop or leave the share.
        if entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
            return True
        attrs = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
        return bool(attrs & _HIDDEN)
    except OSError:
        return True


def scan(root: str, depth: int = DEPTH, exclude: set[str] | None = None, limit: int = MAX_PATHS) -> list[str]:
    """Relative folder paths under root, "\\"-joined, breadth first, at most `depth` levels."""
    exclude = exclude or set()
    out: list[str] = []
    queue: deque[tuple[str, str, int]] = deque([(root, "", 0)])
    while queue:
        full, rel, level = queue.popleft()
        if level >= depth:
            continue
        try:
            with os.scandir(full) as it:
                entries = sorted((e for e in it if not _skip(e, exclude)), key=lambda e: e.name.lower())
        except OSError as e:
            # A folder the agent may not read is left out, not fatal.
            log.warning(f"Skipped {full}: {e}")
            continue
        for e in entries:
            child = f"{rel}\\{e.name}" if rel else e.name
            out.append(child)
            if len(out) >= limit:
                log.warning(f"Stopped at {limit} folders; raise ACCESS_TREE_DEPTH carefully or exclude folders")
                return out
            queue.append((e.path, child, level + 1))
    return out


def send(paths: list[str]) -> dict:
    res = requests.post(
        f"{INGEST_URL}/ingest-access-tree",
        json={"system_id": SYSTEM_ID, "paths": paths, "agent": socket.gethostname()},
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=120,
    )
    if res.status_code == 401:
        raise RuntimeError("Scan key refused: create a new one in the system access screen")
    res.raise_for_status()
    return res.json().get("result", {})


def run_once() -> dict | None:
    if not os.path.isdir(ROOT):
        log.error(f"ACCESS_TREE_ROOT {ROOT!r} is not reachable; nothing sent")
        return None
    paths = scan(ROOT, DEPTH, EXCLUDE)
    if not paths:
        # Sending nothing would mark every folder missing; an empty share is far more likely a broken mount.
        log.error(f"No folders found under {ROOT!r}; nothing sent")
        return None
    result = send(paths)
    log.info(f"Folder tree sent: {len(paths)} folders, result {result}")
    return result


def start_loop(stop_event: threading.Event) -> threading.Thread:
    """Scan now and then every INTERVAL_HOURS, until stop_event is set."""
    def loop():
        while not stop_event.is_set():
            try:
                run_once()
            except Exception as e:
                log.error(f"Folder tree scan failed: {e}")
            stop_event.wait(max(INTERVAL_HOURS, 1) * 3600)

    t = threading.Thread(target=loop, name="access-tree", daemon=True)
    t.start()
    return t


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--once", action="store_true", help="scan and send once")
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.dry_run:
        paths = scan(ROOT, DEPTH, EXCLUDE)
        print(f"{len(paths)} folders under {ROOT}")
        for p in paths[:50]:
            print(" ", p)
        return
    if not enabled():
        raise SystemExit("Set INGEST_URL, ACCESS_TREE_ROOT, ACCESS_TREE_SYSTEM_ID and ACCESS_TREE_TOKEN in .env")
    if args.once:
        run_once()
        return
    stop = threading.Event()
    start_loop(stop)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    main()
