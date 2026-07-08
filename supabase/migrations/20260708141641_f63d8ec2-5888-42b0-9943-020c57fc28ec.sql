SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('send-payroll-monthly-gaps');

SELECT cron.schedule(
  'send-payroll-monthly-gaps',
  '0 5 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/send-payroll-monthly-gaps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);