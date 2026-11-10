-- Onboarding checklist integrity.
--
-- Ticking an item used to run as separate client writes: the item was marked done first and
-- the asset assigned afterwards, so a failed assignment left a "done" item with nothing
-- handed over. Unticking always returned the asset to stock, even when the employee had
-- owned it before onboarding, and the stock picker offered assets in repair, lost or already
-- reserved by another onboarding item. Items that need no asset (tasks, access) could not be
-- ticked at all, and done items could be deleted while their asset stayed assigned.
--
-- complete_onboarding_item does the tick or untick in one transaction, validates the asset,
-- and remembers the asset's previous owner so an untick restores exactly that. Done items
-- cannot be deleted, and finishing a process makes an onboarding employee active.

ALTER TABLE public.onboarding_items
  ADD COLUMN IF NOT EXISTS asset_prior_owner_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_note text;

-- Item types whose completion hands over a physical or licensed asset.
CREATE OR REPLACE FUNCTION public.onboarding_item_needs_asset(_item_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT _item_type IN ('asset', 'license', 'vehicle') $$;

CREATE OR REPLACE FUNCTION public.complete_onboarding_item(_item_id uuid, _done boolean, _note text DEFAULT NULL)
RETURNS public.onboarding_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item public.onboarding_items;
  _proc public.onboarding_processes;
  _asset public.assets;
  _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _item FROM public.onboarding_items WHERE id = _item_id FOR UPDATE;
  IF _item.id IS NULL THEN
    RAISE EXCEPTION 'onboarding item not found';
  END IF;
  SELECT * INTO _proc FROM public.onboarding_processes WHERE id = _item.process_id FOR UPDATE;

  IF NOT (
    (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'it_manager'::app_role)
     OR public.is_operations(_uid) OR public.has_role(_uid, 'hr'::app_role))
    AND (public.is_super_admin(_uid) OR _proc.company_id IN (SELECT public.user_company_ids(_uid)))
  ) THEN
    RAISE EXCEPTION 'not authorized to update this onboarding item';
  END IF;

  IF _done THEN
    IF _item.status = 'done' THEN
      RETURN _item;
    END IF;

    IF _item.asset_id IS NULL AND public.onboarding_item_needs_asset(_item.item_type) THEN
      RAISE EXCEPTION 'asset required: pick or create the item before marking it done';
    END IF;

    IF _item.asset_id IS NOT NULL THEN
      SELECT * INTO _asset FROM public.assets WHERE id = _item.asset_id FOR UPDATE;
      IF _asset.id IS NULL OR _asset.company_id IS DISTINCT FROM _proc.company_id THEN
        RAISE EXCEPTION 'asset not found in this company';
      END IF;
      IF _asset.current_owner_id IS NOT NULL AND _asset.current_owner_id <> _proc.employee_id THEN
        RAISE EXCEPTION 'asset is assigned to another employee';
      END IF;
      IF _asset.current_owner_id IS NULL AND _asset.status <> 'in_stock' THEN
        RAISE EXCEPTION 'asset is not in stock';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.onboarding_items o
        WHERE o.asset_id = _asset.id AND o.id <> _item.id AND o.status = 'done'
      ) AND _asset.current_owner_id IS DISTINCT FROM _proc.employee_id THEN
        RAISE EXCEPTION 'asset already handed over in another onboarding item';
      END IF;

      UPDATE public.onboarding_items SET asset_prior_owner_id = _asset.current_owner_id WHERE id = _item.id;
      UPDATE public.assets
         SET current_owner_id = _proc.employee_id, status = 'in_use'
       WHERE id = _asset.id;

      INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
      VALUES (_proc.employee_id, _proc.company_id,
              'הצמדת פריט בקליטת עובד: ' || COALESCE(_asset.asset_name, _item.title),
              CASE WHEN _asset.asset_code IS NOT NULL THEN 'מזהה פריט: ' || _asset.asset_code END,
              'asset', _asset.id, _uid);
    END IF;

    UPDATE public.onboarding_items
       SET status = 'done',
           assigned_at = CASE WHEN asset_id IS NOT NULL THEN now() ELSE assigned_at END,
           completed_at = now(),
           completed_by = _uid,
           completion_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _item.id
     RETURNING * INTO _item;

    IF _proc.status = 'sent' THEN
      UPDATE public.onboarding_processes SET status = 'in_progress' WHERE id = _proc.id;
    END IF;
  ELSE
    IF _item.status <> 'done' THEN
      RETURN _item;
    END IF;

    IF _item.asset_id IS NOT NULL THEN
      SELECT * INTO _asset FROM public.assets WHERE id = _item.asset_id FOR UPDATE;
      -- Return the asset only if onboarding gave it and the employee still holds it.
      IF _asset.id IS NOT NULL
         AND _asset.current_owner_id = _proc.employee_id
         AND _item.asset_prior_owner_id IS DISTINCT FROM _proc.employee_id THEN
        UPDATE public.assets
           SET current_owner_id = _item.asset_prior_owner_id,
               status = CASE WHEN _item.asset_prior_owner_id IS NULL THEN 'in_stock'::asset_status ELSE status END
         WHERE id = _asset.id;

        INSERT INTO public.activity_log(employee_id, company_id, action, details, entity_type, entity_id, performed_by)
        VALUES (NULL, _proc.company_id,
                'ביטול הצמדה בקליטת עובד: ' || COALESCE(_asset.asset_name, _item.title),
                CASE WHEN _asset.asset_code IS NOT NULL THEN 'מזהה פריט: ' || _asset.asset_code END,
                'asset', _asset.id, _uid);
      END IF;
    END IF;

    UPDATE public.onboarding_items
       SET status = 'pending', assigned_at = NULL, completed_at = NULL, completed_by = NULL,
           completion_note = NULL, asset_prior_owner_id = NULL
     WHERE id = _item.id
     RETURNING * INTO _item;
  END IF;

  RETURN _item;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_item(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_item(uuid, boolean, text) TO authenticated;

-- A done item records a hand-over; it is undone by unticking, never by deleting.
CREATE OR REPLACE FUNCTION public.prevent_done_onboarding_item_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deleting the whole process (cascade) is still allowed.
  IF OLD.status = 'done' AND EXISTS (SELECT 1 FROM public.onboarding_processes WHERE id = OLD.process_id) THEN
    RAISE EXCEPTION 'a completed onboarding item cannot be deleted; untick it first';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_items_prevent_done_delete ON public.onboarding_items;
CREATE TRIGGER onboarding_items_prevent_done_delete
BEFORE DELETE ON public.onboarding_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_done_onboarding_item_delete();

-- Finishing onboarding makes the employee active.
CREATE OR REPLACE FUNCTION public.activate_employee_on_onboarding_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    UPDATE public.employees
       SET status = 'active', updated_at = now()
     WHERE id = NEW.employee_id AND company_id = NEW.company_id AND status = 'onboarding';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS onboarding_processes_activate_employee ON public.onboarding_processes;
CREATE TRIGGER onboarding_processes_activate_employee
AFTER UPDATE OF status ON public.onboarding_processes
FOR EACH ROW EXECUTE FUNCTION public.activate_employee_on_onboarding_done();
