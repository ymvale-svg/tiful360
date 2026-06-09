UPDATE public.attendance_punches
SET
  punch_at = punch_at - interval '3 hours',
  raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
    'clock_timezone', 'Asia/Jerusalem',
    'timezone_fix', 'v3.0.1_subtract_3h'
  )
WHERE source = 'clock'
  AND raw_payload->>'agent_version' = '3.0.0'
  AND raw_payload->>'clock_timezone' IS NULL;