
CREATE OR REPLACE FUNCTION public.delete_company_cascade(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete in correct order to respect foreign keys
  DELETE FROM public.attendance_records WHERE company_id = _company_id;
  DELETE FROM public.it_tickets WHERE company_id = _company_id;
  DELETE FROM public.digital_access WHERE company_id = _company_id;
  DELETE FROM public.activity_log WHERE company_id = _company_id;
  DELETE FROM public.alerts WHERE company_id = _company_id;
  DELETE FROM public.announcements WHERE company_id = _company_id;
  DELETE FROM public.knowledge_base WHERE company_id = _company_id;
  DELETE FROM public.portal_contacts WHERE company_id = _company_id;
  DELETE FROM public.portal_links WHERE company_id = _company_id;
  DELETE FROM public.category_fields WHERE company_id = _company_id;
  DELETE FROM public.assets WHERE company_id = _company_id;
  DELETE FROM public.asset_categories WHERE company_id = _company_id;
  DELETE FROM public.employees WHERE company_id = _company_id;
  DELETE FROM public.user_company_access WHERE company_id = _company_id;
  DELETE FROM public.companies WHERE id = _company_id;
END;
$$;
