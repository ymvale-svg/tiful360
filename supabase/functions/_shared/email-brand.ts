import type { EmailBrand } from './email-theme.ts'

/** Resolve only an explicitly identified company, never another tenant's logo. */
export async function resolveEmailBrand(
  supabase: any,
  context: { companyId?: unknown; companyName?: unknown; employeeId?: unknown } = {},
): Promise<EmailBrand> {
  let companyId = typeof context.companyId === 'string' ? context.companyId : undefined
  if (!companyId && typeof context.employeeId === 'string') {
    const { data } = await supabase.from('employees').select('company_id').eq('id', context.employeeId).maybeSingle()
    companyId = data?.company_id
  }
  const companyName = typeof context.companyName === 'string' ? context.companyName : undefined
  if (!companyId && !companyName) return {}
  let query = supabase.from('companies').select('name, logo_url')
  query = companyId ? query.eq('id', companyId) : query.eq('name', companyName)
  const { data, error } = await query.maybeSingle()
  if (error || !data) return { companyName }
  return { companyName: data.name, companyLogoUrl: data.logo_url || undefined }
}