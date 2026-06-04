import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatTodayHebrewGematriya } from "@/lib/hebrewBirthday";

const WEEKDAYS_HE = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];
const GREG_MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export function WelcomeDateTime() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Align next tick to top of minute
    const ms = (60 - new Date().getSeconds()) * 1000;
    const timeout = setTimeout(() => {
      tick();
      const interval = setInterval(tick, 60_000);
      // store on window to clear via cleanup below
      (timeout as any)._interval = interval;
    }, ms);
    return () => {
      clearTimeout(timeout);
      const i = (timeout as any)._interval;
      if (i) clearInterval(i);
    };
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const weekday = WEEKDAYS_HE[now.getDay()];
  const gregDate = `${now.getDate()} ב${GREG_MONTHS_HE[now.getMonth()]} ${now.getFullYear()}`;
  const hebDate = formatTodayHebrewGematriya();

  return (
    <div className="text-left ltr:text-left rtl:text-left shrink-0 leading-tight text-xs sm:text-sm">
      <div className="flex items-center gap-1.5 text-foreground font-semibold text-base sm:text-lg justify-start">
        <Clock className="w-4 h-4 text-primary" aria-hidden="true" />
        <span dir="ltr">{time}</span>
      </div>
      <div className="text-muted-foreground mt-0.5">{weekday}</div>
      <div className="text-muted-foreground">{gregDate}</div>
      {hebDate && <div className="text-muted-foreground">{hebDate}</div>}
    </div>
  );
}
