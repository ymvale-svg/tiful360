// Inline equivalents of the app's light semantic palette for mail clients,
// which do not support CSS variables or external stylesheets.
export const emailTheme = {
  surface: '#ffffff',
  primary: '#0b63cc',
  accent: '#eaf4ff',
  foreground: '#202c3d',
  muted: '#64748b',
  border: '#dce7f2',
  alternate: '#f7fafc',
  success: '#dcf5df',
  warning: '#fff0cc',
}

export const emailStyles = {
  main: { backgroundColor: emailTheme.surface, fontFamily: 'Arial, Helvetica, sans-serif', direction: 'rtl' as const, margin: '0', padding: '20px 0', color: emailTheme.foreground },
  container: { maxWidth: '640px', width: '100%', margin: '0 auto' },
  card: { backgroundColor: emailTheme.surface, border: `1px solid ${emailTheme.border}`, borderRadius: '8px', overflow: 'hidden' as const },
  header: { backgroundColor: emailTheme.accent, borderTop: `4px solid ${emailTheme.primary}`, padding: '20px 24px', textAlign: 'center' as const },
  content: { padding: '24px', direction: 'rtl' as const, textAlign: 'right' as const },
  heading: { fontSize: '24px', fontWeight: '700' as const, lineHeight: '1.4', color: emailTheme.primary, textAlign: 'center' as const, margin: '0 0 20px' },
  text: { fontSize: '15px', lineHeight: '1.8', color: emailTheme.foreground, textAlign: 'right' as const, direction: 'rtl' as const, margin: '0 0 14px' },
  footer: { fontSize: '12px', lineHeight: '1.7', color: emailTheme.muted, textAlign: 'right' as const, direction: 'rtl' as const, margin: '16px 0 0' },
  button: { backgroundColor: emailTheme.primary, color: emailTheme.surface, fontSize: '15px', fontWeight: '700' as const, borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', display: 'inline-block' },
  table: { width: '100%', borderCollapse: 'collapse' as const, direction: 'rtl' as const, fontSize: '14px', border: `1px solid ${emailTheme.border}` },
  th: { textAlign: 'right' as const, direction: 'rtl' as const, padding: '10px 12px', backgroundColor: emailTheme.accent, color: emailTheme.foreground, fontWeight: '700' as const, border: `1px solid ${emailTheme.border}` },
  td: { textAlign: 'right' as const, direction: 'rtl' as const, padding: '10px 12px', color: emailTheme.foreground, border: `1px solid ${emailTheme.border}` },
  divider: { borderColor: emailTheme.border, margin: '20px 0' },
}

export interface EmailBrand {
  companyName?: string
  companyLogoUrl?: string
}