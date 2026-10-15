CREATE TABLE public.allowed_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL UNIQUE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_ips TO authenticated;
GRANT ALL ON public.allowed_ips TO service_role;

ALTER TABLE public.allowed_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage allowed IPs"
ON public.allowed_ips
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.allowed_ips (ip, label) VALUES ('82.166.36.157', 'כתובת מאושרת — נוספה 15/10/2026');