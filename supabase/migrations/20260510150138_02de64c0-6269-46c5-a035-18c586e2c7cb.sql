-- 1) Add the new role to the enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'legal';
