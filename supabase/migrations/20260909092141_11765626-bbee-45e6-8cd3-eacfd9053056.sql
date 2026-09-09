INSERT INTO public.document_protocols
  (company_id, category_id, group_id, protocol_type, display_name, body_template, requires_employee_sig, requires_issuer_sig, field_defaults)
SELECT 'f2b4f004-4618-4b30-affb-f199edc54a10'::uuid,
       '83606c84-f7b2-43a4-82d0-a46eda1d7988'::uuid,
       'fc71a3ec-21e5-465d-9c7a-45ceb0c61f16'::uuid,
       'return_physical',
       'הזדכות כרטיס תדלוק',
       E'החזרתי את כרטיס התדלוק שברשותי, לרבות הקוד הסודי.\nאני מאשר כי מרגע החתימה לא אעשה שימוש כלשהו בכרטיס, וכי כל חיוב שייווצר לאחר מועד זה באחריותי.',
       true, true, '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_protocols
  WHERE group_id = 'fc71a3ec-21e5-465d-9c7a-45ceb0c61f16'::uuid
    AND protocol_type = 'return_physical'
);