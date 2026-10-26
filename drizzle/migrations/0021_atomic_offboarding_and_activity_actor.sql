ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS performed_by_name text;

CREATE OR REPLACE FUNCTION public.stamp_activity_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.performed_by := auth.uid();
  END IF;
  IF NEW.performed_by IS NOT NULL THEN
    SELECT COALESCE(p.display_name, 'משתמש מזוהה') INTO NEW.performed_by_name
    FROM public.profiles p WHERE p.user_id = NEW.performed_by;
    NEW.performed_by_name := COALESCE(NEW.performed_by_name, 'משתמש מזוהה');
  END IF;
  IF NEW.company_id IS NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.employees WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_activity_actor_before_insert BEFORE INSERT ON public.activity_log FOR EACH ROW EXECUTE FUNCTION public.stamp_activity_actor();
UPDATE public.activity_log a SET performed_by_name = COALESCE(p.display_name, 'משתמש מזוהה') FROM public.profiles p WHERE a.performed_by = p.user_id AND a.performed_by_name IS NULL;

CREATE POLICY "HR Payroll view company activity" ON public.activity_log FOR SELECT TO authenticated USING ((public.is_hr(auth.uid()) OR public.is_payroll(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));

CREATE OR REPLACE FUNCTION public.log_employee_offboarding_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.end_date IS DISTINCT FROM NEW.end_date THEN
    IF OLD.status = 'leaving' OR NEW.status = 'leaving' OR OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
      VALUES (NEW.id, NEW.company_id, 'עדכון פרטי עזיבה - ' || NEW.full_name,
        'סטטוס: ' || OLD.status::text || ' ← ' || NEW.status::text || '. תאריך סיום: ' || COALESCE(to_char(NEW.end_date, 'DD/MM/YYYY'), 'בוטל'), 'employee', NEW.id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER log_employee_offboarding_change AFTER UPDATE OF status, end_date ON public.employees FOR EACH ROW EXECUTE FUNCTION public.log_employee_offboarding_change();

CREATE OR REPLACE FUNCTION public.start_employee_offboarding(_employee_id uuid, _end_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _emp public.employees;
  _ticket public.it_tickets;
  _checklist jsonb;
  _code text;
BEGIN
  IF _actor IS NULL OR public.my_access_blocked() THEN RAISE EXCEPTION 'אין הרשאה להפעלת תהליך עזיבה'; END IF;
  SELECT * INTO _emp FROM public.employees WHERE id = _employee_id FOR UPDATE;
  IF NOT FOUND OR _emp.company_id IS NULL THEN RAISE EXCEPTION 'העובד לא נמצא או אינו משויך לחברה'; END IF;
  IF NOT (public.is_super_admin(_actor) OR (
    _emp.company_id IN (SELECT public.user_company_ids(_actor)) AND
    (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'hr') OR public.is_payroll(_actor) OR public.is_operations(_actor))
  )) THEN RAISE EXCEPTION 'אין הרשאה להפעלת תהליך עזיבה בחברה זו'; END IF;
  IF _end_date IS NULL THEN RAISE EXCEPTION 'יש לבחור תאריך סיום עבודה'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('label', CASE WHEN c.prefix = 'DACC' THEN 'ניתוק גישה: ' ELSE 'משיכת ציוד: ' END || a.asset_name || ' (' || a.asset_code || ')', 'done', false)), '[]'::jsonb)
  INTO _checklist FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.current_owner_id = _emp.id AND a.company_id = _emp.company_id;
  _checklist := _checklist || '[{"label":"השבתת חשבון Active Directory","done":false},{"label":"ניתוק רישיונות ותוכנות בתשלום","done":false},{"label":"החזרת רכב חברה / רכב ליסינג (אם קיים)","done":false},{"label":"מחיקת נתונים אישיים מהמכשירים","done":false},{"label":"ביטול כרטיס כניסה / מפתחות","done":false}]'::jsonb;

  SELECT * INTO _ticket FROM public.it_tickets WHERE employee_id = _emp.id AND ticket_type = 'offboarding' AND status <> 'done' AND (company_id = _emp.company_id OR company_id IS NULL) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  _code := COALESCE(_ticket.ticket_code, 'IT-OFF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
  IF _ticket.id IS NULL THEN
    INSERT INTO public.it_tickets(ticket_code, company_id, title, description, employee_id, ticket_type, subject_category, priority, status, sla_deadline, checklist)
    VALUES (_code, _emp.company_id, 'ניתוקים וסיום העסקה - ' || _emp.full_name, 'תהליך עזיבה לעובד ' || _emp.full_name || ' (' || _emp.employee_code || '). יום עבודה אחרון: ' || to_char(_end_date, 'DD/MM/YYYY'), _emp.id, 'offboarding', 'offboarding', 'critical', 'open', (_end_date + time '17:00') AT TIME ZONE 'Asia/Jerusalem', _checklist)
    RETURNING * INTO _ticket;
  ELSE
    UPDATE public.it_tickets SET company_id = _emp.company_id, title = 'ניתוקים וסיום העסקה - ' || _emp.full_name, sla_deadline = (_end_date + time '17:00') AT TIME ZONE 'Asia/Jerusalem', checklist = _checklist WHERE id = _ticket.id;
  END IF;
  UPDATE public.employees SET status = 'leaving', end_date = _end_date WHERE id = _emp.id;
  UPDATE public.assets a SET status = 'in_stock', current_owner_id = NULL FROM public.asset_categories c WHERE a.category_id = c.id AND c.prefix = 'DACC' AND a.current_owner_id = _emp.id AND a.company_id = _emp.company_id;
  INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
  VALUES (_emp.id, _emp.company_id, 'התנעת תהליך עזיבה - ' || _emp.full_name, 'תאריך סיום: ' || to_char(_end_date, 'DD/MM/YYYY') || '. קריאת שירות ' || _code || '.', 'employee', _emp.id, _actor);
  IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE related_employee_id = _emp.id AND company_id = _emp.company_id AND title LIKE 'עובד בתהליך עזיבה:%' AND NOT is_resolved) THEN
    INSERT INTO public.alerts(company_id, title, category, severity, target_date, related_employee_id) VALUES (_emp.company_id, 'עובד בתהליך עזיבה: ' || _emp.full_name, 'עובדים', 'critical', _end_date, _emp.id);
  END IF;
  RETURN jsonb_build_object('ticketCode', _code, 'ticketId', _ticket.id);
END;
$$;
REVOKE ALL ON FUNCTION public.start_employee_offboarding(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_employee_offboarding(uuid, date) TO authenticated;
