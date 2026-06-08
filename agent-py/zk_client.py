"""Thin wrapper around pyzk. Supports TCP/UDP + Comm Key (password)."""
import logging
from contextlib import contextmanager
from zk import ZK

from config import CLOCK_PASSWORD, FORCE_UDP

log = logging.getLogger(__name__)


@contextmanager
def connect(ip: str, port: int = 4370, timeout: int = 10):
    proto = "UDP" if FORCE_UDP else "TCP"
    zk = ZK(
        ip,
        port=port,
        timeout=timeout,
        password=CLOCK_PASSWORD,
        force_udp=FORCE_UDP,
        ommit_ping=True,
    )
    conn = None
    try:
        log.info(f"Connecting to clock {ip}:{port} ({proto}, password={'set' if CLOCK_PASSWORD else '0'})")
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
