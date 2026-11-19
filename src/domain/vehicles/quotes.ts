// Vehicles: which tier an employee is entitled to, and comparing leasing quotes.

export interface TierRole {
  tier_id: string;
  role_name: string;
  department: string | null;
}

/** The tier for an employee: a role+department match wins over a role-only match. */
export function entitledTier(roles: TierRole[], employee: { role?: string | null; department?: string | null }): string | null {
  const role = employee.role?.trim();
  if (!role) return null;
  const exact = roles.find((r) => r.role_name === role && r.department && r.department === employee.department);
  return (exact ?? roles.find((r) => r.role_name === role && !r.department))?.tier_id ?? null;
}

export interface Quote {
  id: string;
  supplier_name?: string | null;
  model: string | null;
  monthly_price: number | null;
  km_per_year: number | null;
  period_months: number | null;
  delivery_date: string | null;
}

export interface ComparedQuote<Q extends Quote> {
  quote: Q;
  /** Within the tier's monthly cap; null when there is no cap or no price. */
  withinCap: boolean | null;
  /** The model is one the employee preferred. */
  preferredModel: boolean;
  recommended: boolean;
}

const matchesModel = (model: string | null, preferred: string[]) =>
  !!model && preferred.some((p) => p.trim() && model.toLowerCase().includes(p.trim().toLowerCase()));

/**
 * Quotes by price (unpriced last). The recommendation is the cheapest priced quote within the cap,
 * preferring the employee's models among quotes within ten percent of that price.
 */
export function compareQuotes<Q extends Quote>(quotes: Q[], cap: number | null, preferredModels: string[] = []): ComparedQuote<Q>[] {
  const rows = [...quotes]
    .sort((a, b) => (a.monthly_price ?? Infinity) - (b.monthly_price ?? Infinity))
    .map((quote) => ({
      quote,
      withinCap: cap === null || quote.monthly_price === null ? null : quote.monthly_price <= cap,
      preferredModel: matchesModel(quote.model, preferredModels),
      recommended: false,
    }));
  const eligible = rows.filter((r) => r.quote.monthly_price !== null && r.withinCap !== false);
  if (eligible.length) {
    const cheapest = eligible[0].quote.monthly_price!;
    const pick = eligible.find((r) => r.preferredModel && r.quote.monthly_price! <= cheapest * 1.1) ?? eligible[0];
    pick.recommended = true;
  }
  return rows;
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה",
  quotes_requested: "נשלחה בקשת הצעות",
  chosen: "נבחרה הצעה",
  ordered: "הוזמן",
  delivered: "נמסר",
  cancelled: "בוטל",
};
