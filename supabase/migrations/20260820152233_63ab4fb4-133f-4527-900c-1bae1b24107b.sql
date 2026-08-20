ALTER TABLE public.asset_handover_forms
  ADD CONSTRAINT asset_handover_forms_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  ADD CONSTRAINT asset_handover_forms_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;