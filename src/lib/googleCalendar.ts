// Build a Google Calendar "Add event" URL for an all-day range.
// start/end are ISO date strings (YYYY-MM-DD). end is inclusive; Google expects exclusive end.
export function buildGoogleCalendarUrl(opts: {
  title: string;
  startDate: string;
  endDate?: string | null;
  details?: string;
}): string {
  const toYmd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const start = new Date(opts.startDate);
  const endInclusive = new Date(opts.endDate || opts.startDate);
  const endExclusive = new Date(endInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${toYmd(start)}/${toYmd(endExclusive)}`,
  });
  if (opts.details) params.set("details", opts.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
