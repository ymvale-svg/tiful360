"""Thin wrapper around pyzk. TCP only."""
import logging
from contextlib import contextmanager
from zk import ZK

log = logging.getLogger(__name__)


@contextmanager
def connect(ip: str, port: int = 4370, timeout: int = 10):
    zk = ZK(ip, port=port, timeout=timeout, password=0, force_udp=False, ommit_ping=True)
    conn = None
    try:
        log.info(f"Connecting to clock {ip}:{port} (TCP)")
        conn = zk.connect()
        try:
            conn.disable_device()
        except Exception:
            pass
        yield conn
    finally:
        if conn:
            try:
                conn.enable_device()
            except Exception:
                pass
            try:
                conn.disconnect()
            except Exception:
                pass


def fetch_attendance(ip: str, port: int = 4370):
    """Return list of attendance records (one-shot poll)."""
    with connect(ip, port) as conn:
        return conn.get_attendance() or []


def live_stream(ip: str, port: int = 4370):
    """Generator that yields live attendance events. Blocks until disconnected."""
    zk = ZK(ip, port=port, timeout=30, password=0, force_udp=False, ommit_ping=True)
    conn = zk.connect()
    try:
        for att in conn.live_capture():
            if att is None:
                continue
            yield att
    finally:
        try:
            conn.end_live_capture = True
        except Exception:
            pass
        try:
            conn.disconnect()
        except Exception:
            pass
