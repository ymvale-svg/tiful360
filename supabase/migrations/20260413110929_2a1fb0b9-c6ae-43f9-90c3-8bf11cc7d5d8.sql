
ALTER TABLE public.asset_categories DROP CONSTRAINT asset_categories_prefix_key;
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_prefix_company_id_key UNIQUE (prefix, company_id);
