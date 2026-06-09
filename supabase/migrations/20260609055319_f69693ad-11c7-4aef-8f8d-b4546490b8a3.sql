UPDATE attendance_punches
SET punch_at = punch_at - interval '3 hours',
    raw_payload = raw_payload || jsonb_build_object('clock_timezone','Asia/Jerusalem','tz_backfilled',true)
WHERE raw_payload->>'clock_timezone' IS NULL
  AND raw_payload->>'agent_version' = '3.0.0';