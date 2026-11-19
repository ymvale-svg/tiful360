-- Fulfilment tracks for the onboarding form.
--
-- Every category the company had was listed in the onboarding form, insurance and real
-- estate included, and every item was worked the same way. A category now carries its
-- fulfilment track (how an onboarding item of it is fulfilled) and whether HR sees it in the
-- onboarding form. NULL keeps the default derived from the category's domain in
-- src/domain/onboarding/tracks.ts, so existing categories need no backfill.

ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS fulfillment_track text
    CHECK (fulfillment_track IN ('equipment', 'access', 'vehicle', 'license', 'task', 'none')),
  ADD COLUMN IF NOT EXISTS show_in_onboarding boolean;

COMMENT ON COLUMN public.asset_categories.fulfillment_track IS
  'How an onboarding item of this category is fulfilled; NULL = derived from the domain.';
COMMENT ON COLUMN public.asset_categories.show_in_onboarding IS
  'Whether HR sees this category in the onboarding form; NULL = shown unless the track is none.';
