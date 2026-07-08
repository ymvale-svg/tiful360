-- Schedule HR daily missing-punches summary (12:00 Asia/Jerusalem → 09:00 UTC)
-- and weekly gaps XLSX report (Thursday 14:00 Asia/Jerusalem → 11:00 UTC).
SELECT cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN ('send-hr-daily-missing','send-hr-weekly-gaps');

SELECT cron.schedule(
  'send-hr-daily-missing',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/send-hr-daily-missing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'send-hr-weekly-gaps',
  '0 11 * * 4',
  $$
  SELECT net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/send-hr-weekly-gaps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);