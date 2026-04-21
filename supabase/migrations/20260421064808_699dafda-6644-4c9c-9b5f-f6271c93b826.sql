-- Add new role values to app_role enum
-- Must be in its own migration because new enum values can't be used in the same transaction they're created in
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'direct_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operations';