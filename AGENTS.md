# Project rules

- Payslip uploads (split-payslips) never bulk-delete a period: each slip is upserted per employee+period (or per detected ID+period when unmatched), so only IDs present in the new file are replaced. Why: partial re-uploads previously erased other employees' payslips.
- Portal learning content is split into department-based procedures and topic-based guides, with private files stored under a company-scoped path. Why: procedures and practical guides have different navigation and access needs.

- category_fields.company_id is always set by a DB trigger from its category (never by the client). Why: fields saved without a company were visible only to super admins.
- CategoryManager keeps category-level and sub-category-level editing in separate selected contexts. Why: mixing both scopes made it unclear which records a change affected.
- Permission changes are recorded in the append-only permission_audit_log: DB triggers log signed-in users' direct writes; service-role code (manage-users) must insert its own audit row with the real caller. Why: information-systems audits require an unalterable record of who changed which access.
- Saving custom fields in CategoryManager deletes only fields of the edited scope (same group_id). Why: a scoped save previously erased other sub-categories' field definitions.

- Asset instance lists use semantic tables with explicit checkbox, sorting and open-item controls. Why: keyboard and assistive-technology users need identifiable actions and column relationships.
- All outgoing emails share email-theme tokens and a company-scoped header: React templates use EmailLayout and legacy HTML send paths use formatEmailHtml; resolve branding from the triggering company, never a global default company. Why: consistent mail-client-safe presentation must not change content, delivery behavior or tenant boundaries.

- Use Bun and bun.lock as the single dependency installation source; dependency security patches must be committed through Bun patchedDependencies. Why: duplicate npm locks can silently deploy different versions and omit local security patches.
- Keep spreadsheet parsing behind the lazy-loaded shared adapter and verify actual advisory version ranges before replacing it. Why: legacy XLS/CSV support and all report exports must remain compatible without unnecessary migrations.
