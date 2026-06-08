"""Install/uninstall the agent as a Windows Service. Requires pywin32.

Usage (as Administrator):
    python service_windows.py install
    python service_windows.py start
    python service_windows.py stop
    python service_windows.py remove
"""
import sys
import os
from pathlib import Path

if sys.platform != "win32":
    print("This script only runs on Windows.")
    sys.exit(1)

import servicemanager
import win32event
import win32service
import win32serviceutil

BASE_DIR = Path(__file__).resolve().parent


class Tiful360AgentService(win32serviceutil.ServiceFramework):
    _svc_name_ = "Tiful360AttendanceAgent"
    _svc_display_name_ = "Tiful360 Attendance Agent"
    _svc_description_ = "Polls ZKTeco attendance clock and ships punches to Tiful360 Cloud."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._stopping = False

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self._stopping = True
        win32event.SetEvent(self.stop_event)

    def SvcDoRun(self):
        os.chdir(str(BASE_DIR))
        sys.path.insert(0, str(BASE_DIR))
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        import main as agent_main
        agent_main.main()


if __name__ == "__main__":
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(Tiful360AgentService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(Tiful360AgentService)
