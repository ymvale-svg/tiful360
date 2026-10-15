import { parseHTML } from 'npm:linkedom@0.18.12'
import { emailTheme, type EmailBrand } from './email-theme.ts'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function mergeStyle(element: any, styles: Record<string, string>) {
  // Appending overrides keeps functional properties (including hidden previews).
  const extra = Object.entries(styles).map(([key, value]) => `${key}:${value}`).join(';')
  element.setAttribute('style', `${element.getAttribute('style') || ''};${extra}`)
}

/** Format legacy authored HTML without changing its text, links or data cells. */
export function formatEmailHtml(html: string, brand: EmailBrand = {}): string {
  if (html.includes('data-tiful-email="v1"')) return html
  const source = /<body[\s>]/i.test(html) ? html : `<html><head></head><body>${html}</body></html>`
  const { document } = parseHTML(source)
  const body = document.body

  // Legacy full-width layout tables have one cell per row. Flatten only those;
  // data tables and multi-column layouts retain their original ordering.
  for (const table of Array.from(body.querySelectorAll('table')).reverse()) {
    if (table.getAttribute('role') !== 'presentation') continue
    const rows = Array.from(table.querySelectorAll(':scope > tr, :scope > tbody > tr'))
    if (!rows.length || rows.some((row) => row.children.length !== 1)) continue
    const replacement = document.createElement('div')
    for (const row of rows) {
      const cell = row.firstElementChild
      if (!cell) continue
      const label = (cell.textContent || '').trim()
      if (/^(?:תפעול\s*360|Tiful\s*360)\s*[—–-]/i.test(label) && !cell.querySelector('p, table, a, h1, h2, h3')) continue
      while (cell.firstChild) replacement.appendChild(cell.firstChild)
    }
    table.replaceWith(replacement)
  }

  // Existing company-logo blocks are replaced by exactly one shared header.
  for (const image of Array.from(body.querySelectorAll('img'))) {
    const src = image.getAttribute('src') || ''
    if (src.includes('/company-logos/') || src.includes('/email-assets/logo.') || src === brand.companyLogoUrl) {
      image.remove()
    }
  }
  for (const el of Array.from(body.querySelectorAll('div, table, td, section'))) {
    if (el.tagName === 'TD') continue
    mergeStyle(el, { background: emailTheme.surface, 'box-shadow': 'none', 'max-width': '100%', 'box-sizing': 'border-box', direction: 'rtl', 'text-align': 'right' })
  }
  for (const el of Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    mergeStyle(el, { color: emailTheme.primary, 'text-align': 'center', direction: 'rtl', 'font-weight': '700', 'font-size': el.tagName === 'H1' || el.tagName === 'H2' ? '24px' : '19px', 'line-height': '1.4', margin: '22px 0 18px' })
    el.setAttribute('align', 'center')
  }
  for (const el of Array.from(body.querySelectorAll('p,li'))) {
    mergeStyle(el, { 'text-align': 'right', direction: 'rtl', color: emailTheme.foreground, 'line-height': '1.8' })
    el.setAttribute('align', 'right')
  }
  for (const table of Array.from(body.querySelectorAll('table'))) {
    table.setAttribute('dir', 'rtl')
    table.removeAttribute('width')
    mergeStyle(table, { direction: 'rtl', width: '100%', 'border-collapse': 'collapse', 'font-size': '14px', margin: '16px 0' })
    const rows = Array.from(table.querySelectorAll('tr'))
    rows.forEach((row, index) => mergeStyle(row, { background: index % 2 ? emailTheme.alternate : emailTheme.surface }))
  }
  for (const cell of Array.from(body.querySelectorAll('td,th'))) {
    cell.setAttribute('align', 'right')
    cell.setAttribute('dir', 'rtl')
    mergeStyle(cell, { 'text-align': 'right', direction: 'rtl', padding: '10px 12px', color: emailTheme.foreground, border: `1px solid ${emailTheme.border}`, ...(cell.tagName === 'TH' ? { background: emailTheme.accent, 'font-weight': '700' } : {}) })
  }
  for (const anchor of Array.from(body.querySelectorAll('a'))) {
    if (/background(?:-color)?\s*:/i.test(anchor.getAttribute('style') || '')) {
      mergeStyle(anchor, { background: emailTheme.primary, color: emailTheme.surface, 'border-radius': '6px', padding: '12px 24px', 'font-weight': '700', 'text-decoration': 'none', display: 'inline-block' })
    }
  }
  const header = brand.companyLogoUrl
    ? `<img src="${escapeAttribute(brand.companyLogoUrl)}" alt="${escapeAttribute(brand.companyName || 'לוגו החברה')}" width="160" style="display:block;width:160px;max-width:100%;height:auto;margin:0 auto;"/>`
    : brand.companyName ? `<span style="font-size:20px;font-weight:700;color:${emailTheme.primary};">${escapeAttribute(brand.companyName)}</span>` : ''
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body data-tiful-email="v1" style="margin:0;padding:20px 12px;background:${emailTheme.surface};font-family:Arial,Helvetica,sans-serif;color:${emailTheme.foreground};direction:rtl;text-align:right;"><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border:1px solid ${emailTheme.border};border-radius:8px;overflow:hidden;background:${emailTheme.surface};"><tr><td align="center" style="padding:20px 24px;background:${emailTheme.accent};border-top:4px solid ${emailTheme.primary};text-align:center;">${header}</td></tr><tr><td dir="rtl" align="right" style="padding:24px;direction:rtl;text-align:right;font-size:15px;line-height:1.8;">${body.innerHTML}</td></tr></table></td></tr></table></body></html>`
}