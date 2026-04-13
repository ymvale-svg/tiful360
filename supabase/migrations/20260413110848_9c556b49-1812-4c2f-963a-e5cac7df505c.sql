
ALTER TABLE public.asset_categories DROP CONSTRAINT asset_categories_category_name_key;
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_category_name_company_id_key UNIQUE (category_name, company_id);
