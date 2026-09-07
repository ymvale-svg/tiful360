CREATE TABLE public.user_dashboard_prefs (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden TEXT[] NOT NULL DEFAULT '{}',
  wide TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_prefs TO authenticated;
GRANT ALL ON public.user_dashboard_prefs TO service_role;
ALTER TABLE public.user_dashboard_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own dashboard prefs"
  ON public.user_dashboard_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);