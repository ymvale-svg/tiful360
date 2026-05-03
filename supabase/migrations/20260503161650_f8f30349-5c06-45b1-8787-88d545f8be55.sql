-- Attach dedup trigger BEFORE INSERT (must run first to drop duplicates)
DROP TRIGGER IF EXISTS trg_dedup_punch_5min ON public.attendance_punches;
CREATE TRIGGER trg_dedup_punch_5min
  BEFORE INSERT ON public.attendance_punches
  FOR EACH ROW
  EXECUTE FUNCTION public.dedup_punch_5min();

-- Attach classify trigger BEFORE INSERT (runs after dedup alphabetically: trg_dedup < trg_zclassify)
DROP TRIGGER IF EXISTS trg_classify_punch_direction ON public.attendance_punches;
CREATE TRIGGER trg_zclassify_punch_direction
  BEFORE INSERT ON public.attendance_punches
  FOR EACH ROW
  EXECUTE FUNCTION public.classify_punch_direction();