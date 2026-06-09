DELETE FROM public.attendance_punches a
USING public.attendance_punches b
WHERE a.id > b.id
  AND a.company_id = b.company_id
  AND a.employee_code_raw = b.employee_code_raw
  AND a.punch_at = b.punch_at
  AND a.direction = b.direction;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_punches_dedup_idx
  ON public.attendance_punches (company_id, employee_code_raw, punch_at, direction);