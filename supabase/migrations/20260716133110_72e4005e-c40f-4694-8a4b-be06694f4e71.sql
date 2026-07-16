ALTER TABLE public.leave_requests ALTER COLUMN end_date DROP NOT NULL;
ALTER TABLE public.leave_requests ALTER COLUMN total_days DROP NOT NULL;
ALTER TABLE public.leave_requests ALTER COLUMN total_days SET DEFAULT 0;