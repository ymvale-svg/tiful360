ALTER TABLE public.asset_handover_forms REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_handover_forms;