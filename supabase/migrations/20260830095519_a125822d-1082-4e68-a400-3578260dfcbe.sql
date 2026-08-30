SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('send-monthly-gaps-hr-payroll-30th');

SELECT cron.schedule(
  'send-monthly-gaps-hr-payroll-30th',
  '0 5 30 * *',
  $$
  SELECT net.http_post(
    url := 'https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1/send-payroll-monthly-gaps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{"period":"current_month","recipients":"roles"}'::jsonb
  );
  $$
);