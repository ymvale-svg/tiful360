
-- 1. signed_documents
CREATE TABLE public.signed_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  protocol_type text NOT NULL CHECK (protocol_type IN ('physical','virtual','vehicle','training','return_physical','return_virtual')),
  employee_id uuid,
  asset_id uuid,
  training_id uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  method text NOT NULL DEFAULT 'digital' CHECK (method IN ('digital','scan')),
  form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  employee_signature text,
  issuer_signature text,
  pdf_url text,
  attached_doc_url text,
  signed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signed_documents_company ON public.signed_documents(company_id);
CREATE INDEX idx_signed_documents_employee ON public.signed_documents(employee_id);
CREATE INDEX idx_signed_documents_asset ON public.signed_documents(asset_id);

ALTER TABLE public.signed_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company signed documents"
ON public.signed_documents FOR ALL TO authenticated
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Employees view own signed documents"
ON public.signed_documents FOR SELECT TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE linked_user_id = auth.uid())
);

-- 2. offboarding_processes
CREATE TABLE public.offboarding_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  last_working_day date NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  completed_at timestamptz,
  pdf_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offboarding_processes_company ON public.offboarding_processes(company_id);
CREATE INDEX idx_offboarding_processes_employee ON public.offboarding_processes(employee_id);

ALTER TABLE public.offboarding_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company offboarding processes"
ON public.offboarding_processes FOR ALL TO authenticated
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
)
WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
  AND (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))
);

CREATE POLICY "Employees view own offboarding"
ON public.offboarding_processes FOR SELECT TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE linked_user_id = auth.uid())
);

CREATE TRIGGER set_offboarding_processes_updated_at
BEFORE UPDATE ON public.offboarding_processes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. offboarding_items
CREATE TABLE public.offboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.offboarding_processes(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('asset','access','license','document')),
  ref_id uuid,
  title text NOT NULL,
  owner_role text NOT NULL CHECK (owner_role IN ('it','ops','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','not_applicable')),
  completed_at timestamptz,
  completed_by uuid,
  notes text,
  signed_document_id uuid REFERENCES public.signed_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offboarding_items_process ON public.offboarding_items(process_id);

ALTER TABLE public.offboarding_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage company offboarding items"
ON public.offboarding_items FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.offboarding_processes p
    WHERE p.id = offboarding_items.process_id
      AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
      AND (is_super_admin(auth.uid()) OR p.company_id IN (SELECT user_company_ids(auth.uid())))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.offboarding_processes p
    WHERE p.id = offboarding_items.process_id
      AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
      AND (is_super_admin(auth.uid()) OR p.company_id IN (SELECT user_company_ids(auth.uid())))
  )
);

CREATE POLICY "Employees view own offboarding items"
ON public.offboarding_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.offboarding_processes p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.id = offboarding_items.process_id AND e.linked_user_id = auth.uid()
  )
);

-- 4. document_protocols
CREATE TABLE public.document_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  protocol_type text NOT NULL,
  display_name text NOT NULL,
  body_template text NOT NULL,
  requires_employee_sig boolean NOT NULL DEFAULT true,
  requires_issuer_sig boolean NOT NULL DEFAULT false,
  validity_days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, protocol_type)
);

ALTER TABLE public.document_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads protocols"
ON public.document_protocols FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Super admin manages protocols"
ON public.document_protocols FOR ALL TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER set_document_protocols_updated_at
BEFORE UPDATE ON public.document_protocols
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 5 global protocol templates
INSERT INTO public.document_protocols (protocol_type, display_name, body_template, requires_employee_sig, requires_issuer_sig, validity_days) VALUES
('physical','מסירת ציוד פיזי','קיבלתי את הציוד המפורט לעיל, אני מאשר את מצבו, אחראי לשמירתו ולהחזירו בסיום עבודתי או לפי דרישה.',true,false,NULL),
('virtual','מסירת גישה דיגיטלית והסכם סודיות','המידע אליו ניתנת לי גישה במסגרת תפקידי הוא סודי וקנייני. אני מתחייב לא להעביר, לשתף, להדליף או לעשות כל שימוש חיצוני במידע זה. ידוע לי כי הפרת התחייבות זו מהווה עילה לסיום העסקה מיידי ולנקיטת הליכים משפטיים.',true,false,NULL),
('vehicle','מסירת רכב חברה','קיבלתי את הרכב, מתחייב לשמור עליו, לבצע טיפולים שוטפים, להטעין/לתדלק לפי נוהל, לדווח על נזק תוך 24 שעות, לא להשתמש לצרכים פרטיים ללא אישור, ולשאת באחריות לדוחות חניה ועבירות תנועה שיצטברו בתקופת השימוש.',true,false,NULL),
('training','אישור ביצוע הדרכה','השתתפתי בהדרכת "{training_name}" ביום {date}, הבנתי את תוכנה ואני מתחייב לנהוג לפיה.',true,false,NULL),
('return_physical','החזרת ציוד פיזי','אני מאשר את החזרת הציוד המפורט לעיל במצב המתואר.',true,true,NULL),
('return_virtual','ניתוק גישה דיגיטלית','גישות העובד למערכות המפורטות נותקו במלואן בתאריך הנקוב.',true,true,NULL);

-- 5. asset_categories.signing_protocol
ALTER TABLE public.asset_categories
  ADD COLUMN signing_protocol text
  CHECK (signing_protocol IS NULL OR signing_protocol IN ('physical','virtual','vehicle','training'));

UPDATE public.asset_categories SET signing_protocol = CASE
  WHEN protocol_type::text = 'vehicle' THEN 'vehicle'
  WHEN protocol_type::text = 'digital' THEN 'virtual'
  WHEN protocol_type::text = 'training' THEN 'training'
  WHEN protocol_type::text IN ('insurance','real_estate') THEN NULL
  ELSE 'physical'
END;

-- 6. Migrate asset_handover_forms -> signed_documents
INSERT INTO public.signed_documents
  (id, company_id, protocol_type, employee_id, asset_id, issued_at, returned_at, method, form_snapshot, employee_signature, pdf_url, attached_doc_url, signed_by, created_at)
SELECT
  f.id, f.company_id,
  CASE
    WHEN f.protocol_type = 'handover' THEN 'physical'
    WHEN f.protocol_type = 'return' THEN 'return_physical'
    ELSE COALESCE(f.protocol_type, 'physical')
  END,
  f.employee_id, f.asset_id, COALESCE(f.signed_at, f.created_at),
  CASE WHEN f.protocol_type = 'return' THEN f.signed_at ELSE NULL END,
  CASE WHEN f.delivery_method = 'upload' THEN 'scan' ELSE 'digital' END,
  COALESCE(f.form_snapshot, '{}'::jsonb),
  f.signature_data, f.pdf_url, f.attached_document_url, f.created_by, f.created_at
FROM public.asset_handover_forms f
ON CONFLICT (id) DO NOTHING;

-- 7. DB functions
CREATE OR REPLACE FUNCTION public.create_offboarding_checklist(_process_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proc public.offboarding_processes;
  v_count integer := 0;
  rec record;
BEGIN
  SELECT * INTO v_proc FROM public.offboarding_processes WHERE id = _process_id;
  IF v_proc.id IS NULL THEN RAISE EXCEPTION 'offboarding process not found'; END IF;

  IF NOT (is_super_admin(auth.uid())
          OR ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
              AND v_proc.company_id IN (SELECT user_company_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Physical assets in use
  FOR rec IN
    SELECT a.id, a.asset_name, a.asset_code, c.signing_protocol
    FROM public.assets a JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.current_owner_id = v_proc.employee_id AND a.status = 'in_use'
  LOOP
    INSERT INTO public.offboarding_items (process_id, item_type, ref_id, title, owner_role)
    VALUES (_process_id, 'asset', rec.id,
      COALESCE(rec.asset_name,'') || ' (' || COALESCE(rec.asset_code,'') || ')',
      CASE WHEN rec.signing_protocol = 'virtual' THEN 'it' ELSE 'ops' END);
    v_count := v_count + 1;
  END LOOP;

  -- Digital access
  FOR rec IN
    SELECT da.id, da.access_type, da.resource_path
    FROM public.digital_access da
    WHERE da.employee_id = v_proc.employee_id AND da.status = 'active'
  LOOP
    INSERT INTO public.offboarding_items (process_id, item_type, ref_id, title, owner_role)
    VALUES (_process_id, 'access', rec.id,
      COALESCE(rec.access_type,'') || ' — ' || COALESCE(rec.resource_path,''), 'it');
    v_count := v_count + 1;
  END LOOP;

  -- Mandatory wrap-up docs
  INSERT INTO public.offboarding_items (process_id, item_type, title, owner_role)
  VALUES
    (_process_id, 'document', 'טופס ניתוק גישות (IT sign-off)', 'it'),
    (_process_id, 'document', 'אישור סיום העסקה (HR)', 'admin');
  v_count := v_count + 2;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_offboarding_item(_item_id uuid, _notes text DEFAULT NULL, _signed_document_id uuid DEFAULT NULL)
RETURNS public.offboarding_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item public.offboarding_items;
  v_proc public.offboarding_processes;
BEGIN
  SELECT * INTO v_item FROM public.offboarding_items WHERE id = _item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'item not found'; END IF;
  SELECT * INTO v_proc FROM public.offboarding_processes WHERE id = v_item.process_id;

  IF NOT (is_super_admin(auth.uid())
          OR ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it_manager'::app_role) OR is_operations(auth.uid()))
              AND v_proc.company_id IN (SELECT user_company_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.offboarding_items
  SET status = 'done',
      completed_at = now(),
      completed_by = auth.uid(),
      notes = COALESCE(_notes, notes),
      signed_document_id = COALESCE(_signed_document_id, signed_document_id)
  WHERE id = _item_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;
