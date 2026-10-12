# Project rules

- Payslip uploads (split-payslips) never bulk-delete a period: each slip is upserted per employee+period (or per detected ID+period when unmatched), so only IDs present in the new file are replaced. Why: partial re-uploads previously erased other employees' payslips.
- Portal learning content is split into department-based procedures and topic-based guides, with private files stored under a company-scoped path. Why: procedures and practical guides have different navigation and access needs.

- category_fields.company_id is always set by a DB trigger from its category (never by the client). Why: fields saved without a company were visible only to super admins.
- CategoryManager keeps category-level and sub-category-level editing in separate selected contexts. Why: mixing both scopes made it unclear which records a change affected.
