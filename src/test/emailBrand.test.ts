import { describe, expect, it, vi } from 'vitest'
import { resolveEmailBrand } from '../../supabase/functions/_shared/email-brand'

describe('company-scoped outgoing email branding', () => {
  it('uses the sending company logo, not a global company logo', async () => {
    const eq = vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: { name: 'אשל הירדן', logo_url: 'https://example.test/eshel.jpg' } }) })
    const client = { from: vi.fn().mockReturnValue({ select: () => ({ eq }) }) }
    expect(await resolveEmailBrand(client, { companyId: 'eshel' })).toEqual({ companyName: 'אשל הירדן', companyLogoUrl: 'https://example.test/eshel.jpg' })
    expect(eq).toHaveBeenCalledWith('id', 'eshel')
  })

  it('does not borrow a company logo when the sender company is unknown', async () => {
    const client = { from: vi.fn() }
    expect(await resolveEmailBrand(client)).toEqual({})
    expect(client.from).not.toHaveBeenCalled()
  })

  it('keeps the company identity when its logo is missing', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'אשל הירדן', logo_url: null } }) }) }) }) }
    expect(await resolveEmailBrand(client, { companyId: 'eshel' })).toEqual({ companyName: 'אשל הירדן', companyLogoUrl: undefined })
  })
})