UPDATE public.asset_groups
SET category_id = '83606c84-f7b2-43a4-82d0-a46eda1d7988', updated_at = now()
WHERE id = 'fc71a3ec-21e5-465d-9c7a-45ceb0c61f16';

UPDATE public.assets
SET updated_at = now()
WHERE group_id = 'fc71a3ec-21e5-465d-9c7a-45ceb0c61f16';