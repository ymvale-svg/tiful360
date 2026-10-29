-- Employee app launcher: portal_links becomes the company's system catalogue.
-- A link is shown to everyone in the company, or only to employees who hold a digital/licence
-- asset of the linked category (optionally a specific sub-category). The launcher only links out;
-- access itself is still granted and enforced inside each system.
ALTER TABLE public.portal_links
  ADD COLUMN category text,
  ADD COLUMN description text,
  ADD COLUMN access_mode text NOT NULL DEFAULT 'everyone',
  ADD COLUMN asset_category_id uuid REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  ADD COLUMN asset_group_id uuid REFERENCES public.asset_groups(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.portal_links
  ADD CONSTRAINT portal_links_access_mode_check CHECK (access_mode IN ('everyone', 'assigned'));
-- No javascript:/data: links. NOT VALID keeps older rows loadable; new and edited rows are checked.
ALTER TABLE public.portal_links
  ADD CONSTRAINT portal_links_url_scheme_check CHECK (url ~* '^https?://') NOT VALID;

COMMENT ON COLUMN public.portal_links.access_mode IS 'everyone: every company user sees it; assigned: only employees holding an asset of asset_category_id / asset_group_id.';

-- Per-user launcher favourites. item_key is "link:<portal_links.id>" or "asset:<assets.id>".
CREATE TABLE public.portal_app_favorites (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_key),
  CONSTRAINT portal_app_favorites_key_check CHECK (item_key ~ '^(link|asset):[0-9a-f-]{36}$')
);
GRANT SELECT, INSERT, DELETE ON public.portal_app_favorites TO authenticated;
ALTER TABLE public.portal_app_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own launcher favorites" ON public.portal_app_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users add own launcher favorites" ON public.portal_app_favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users remove own launcher favorites" ON public.portal_app_favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());
