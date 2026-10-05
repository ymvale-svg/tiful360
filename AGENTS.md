# Project rules

- Payslip uploads (split-payslips) never bulk-delete a period: each slip is upserted per employee+period (or per detected ID+period when unmatched), so only IDs present in the new file are replaced. Why: partial re-uploads previously erased other employees' payslips.
