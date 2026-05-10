-- Auto-approve incoming punches
CREATE OR REPLACE FUNCTION public.auto_approve_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_approve_punch ON public.attendance_punches;
CREATE TRIGGER trg_auto_approve_punch
BEFORE INSERT ON public.attendance_punches
FOR EACH ROW
EXECUTE FUNCTION public.auto_approve_punch();

-- Approve all currently-pending punches
UPDATE public.attendance_punches SET status = 'approved' WHERE status = 'pending';