
-- Enums
CREATE TYPE public.leave_request_type AS ENUM ('vacation', 'sick', 'personal', 'other');
CREATE TYPE public.leave_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Companies: payroll emails
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS payroll_emails TEXT;

-- Main table
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  request_type public.leave_request_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  reason TEXT,
  attachment_url TEXT,
  status public.leave_request_status NOT NULL DEFAULT 'pending',
  manager_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  signed_pdf_url TEXT,
  manager_notified_at TIMESTAMPTZ,
  payroll_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_requests_company ON public.leave_requests(company_id);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_manager ON public.leave_requests(manager_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Trigger: updated_at
CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: is this employee linked to current user?
CREATE OR REPLACE FUNCTION public.is_my_employee_record(_employee_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = _employee_id AND linked_user_id = _user_id
  )
$$;

-- Helper: am I the direct manager of this employee?
CREATE OR REPLACE FUNCTION public.is_direct_manager_of(_employee_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees emp
    JOIN public.employees mgr ON mgr.id = emp.direct_manager_id
    WHERE emp.id = _employee_id AND mgr.linked_user_id = _user_id
  )
$$;

-- RLS: Employee — read own
CREATE POLICY "Employees can view their own leave requests"
ON public.leave_requests FOR SELECT
USING (public.is_my_employee_record(employee_id, auth.uid()));

-- RLS: Employee — insert own (pending)
CREATE POLICY "Employees can create their own leave requests"
ON public.leave_requests FOR INSERT
WITH CHECK (
  public.is_my_employee_record(employee_id, auth.uid())
  AND status = 'pending'
);

-- RLS: Employee — cancel own pending
CREATE POLICY "Employees can cancel their own pending requests"
ON public.leave_requests FOR UPDATE
USING (
  public.is_my_employee_record(employee_id, auth.uid())
)
WITH CHECK (
  public.is_my_employee_record(employee_id, auth.uid())
);

-- RLS: Direct manager — view subordinates' requests
CREATE POLICY "Managers can view their subordinates leave requests"
ON public.leave_requests FOR SELECT
USING (public.is_direct_manager_of(employee_id, auth.uid()));

-- RLS: Direct manager — review subordinates' requests
CREATE POLICY "Managers can review their subordinates leave requests"
ON public.leave_requests FOR UPDATE
USING (public.is_direct_manager_of(employee_id, auth.uid()))
WITH CHECK (public.is_direct_manager_of(employee_id, auth.uid()));

-- RLS: Company admin/IT — full access
CREATE POLICY "Company admins can manage all company leave requests"
ON public.leave_requests FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
  OR (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'it_manager'))
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_company_admin(auth.uid(), company_id)
  OR (
    company_id IN (SELECT public.user_company_ids(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'it_manager'))
  )
);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('leave-attachments', 'leave-attachments', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('leave-documents', 'leave-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: leave-attachments
-- Path convention: {employee_id}/{filename}
CREATE POLICY "Employees can upload their own leave attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'leave-attachments'
  AND public.is_my_employee_record((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Employees can view their own leave attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-attachments'
  AND public.is_my_employee_record((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Managers can view subordinates leave attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-attachments'
  AND public.is_direct_manager_of((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Company admins can manage all leave attachments"
ON storage.objects FOR ALL
USING (
  bucket_id = 'leave-attachments'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'it_manager')
  )
);

-- Storage policies: leave-documents (signed PDFs)
CREATE POLICY "Employees can view their own leave documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-documents'
  AND public.is_my_employee_record((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Managers can view subordinates leave documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'leave-documents'
  AND public.is_direct_manager_of((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "Company admins can manage all leave documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'leave-documents'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'it_manager')
  )
);
