CREATE TABLE public.procedure_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_departments TO authenticated;
GRANT ALL ON public.procedure_departments TO service_role;
ALTER TABLE public.procedure_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view company procedure departments" ON public.procedure_departments FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins manage company procedure departments" ON public.procedure_departments FOR ALL TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));
CREATE TRIGGER update_procedure_departments_updated_at BEFORE UPDATE ON public.procedure_departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_base ADD COLUMN department_id UUID REFERENCES public.procedure_departments(id) ON DELETE SET NULL;
ALTER TABLE public.knowledge_base ADD COLUMN description TEXT;
ALTER TABLE public.knowledge_base ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.knowledge_base ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE public.guide_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic_type TEXT NOT NULL DEFAULT 'general' CHECK (topic_type IN ('software', 'operations', 'safety', 'general')),
  logo_url TEXT,
  color_key TEXT NOT NULL DEFAULT 'primary',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_topics TO authenticated;
GRANT ALL ON public.guide_topics TO service_role;
ALTER TABLE public.guide_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view company guide topics" ON public.guide_topics FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins manage company guide topics" ON public.guide_topics FOR ALL TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));
CREATE TRIGGER update_guide_topics_updated_at BEFORE UPDATE ON public.guide_topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.guide_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('pdf', 'video', 'link')),
  resource_url TEXT NOT NULL,
  file_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guides TO authenticated;
GRANT ALL ON public.guides TO service_role;
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view company guides" ON public.guides FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())));
CREATE POLICY "Admins manage company guides" ON public.guides FOR ALL TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid())))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_super_admin(auth.uid())) AND (public.is_super_admin(auth.uid()) OR company_id IN (SELECT public.user_company_ids(auth.uid()))));
CREATE TRIGGER update_guides_updated_at BEFORE UPDATE ON public.guides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Company users view portal learning files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'portal-learning' AND (public.is_super_admin(auth.uid()) OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_company_ids(auth.uid()))));
CREATE POLICY "Admins upload portal learning files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'portal-learning' AND (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ((storage.foldername(name))[1])::uuid IN (SELECT public.user_company_ids(auth.uid())))));
CREATE POLICY "Admins update portal learning files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'portal-learning' AND (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ((storage.foldername(name))[1])::uuid IN (SELECT public.user_company_ids(auth.uid()))))) WITH CHECK (bucket_id = 'portal-learning' AND (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ((storage.foldername(name))[1])::uuid IN (SELECT public.user_company_ids(auth.uid())))));
CREATE POLICY "Admins delete portal learning files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'portal-learning' AND (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND ((storage.foldername(name))[1])::uuid IN (SELECT public.user_company_ids(auth.uid())))));

CREATE INDEX procedure_departments_company_order_idx ON public.procedure_departments(company_id, sort_order);
CREATE INDEX knowledge_base_department_idx ON public.knowledge_base(department_id, sort_order);
CREATE INDEX guide_topics_company_order_idx ON public.guide_topics(company_id, sort_order);
CREATE INDEX guides_topic_order_idx ON public.guides(topic_id, sort_order);