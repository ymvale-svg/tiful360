/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Row { full_name: string; company_name?: string; gap_type: 'empty' | 'odd'; punches: string }
interface Props {
  recipientName?: string
  reportDate?: string
  employees?: Row[]
  companyName?: string
  downloadUrl?: string
}

const Email = ({ recipientName = 'שלום', reportDate = '', employees = [], companyName, downloadUrl }: Props) => (
  <Html lang="he" dir="rtl">
    <Head><meta charSet="utf-8" /></Head>
    <Preview>דוח יומי — {employees.length} עובדים לא החתימו נוכחות היום</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Section style={logoSection}>
            <Link href="https://tiful360.com" style={logoLink}>
              <Img src={LOGO_URL} width="48" height="48" alt={SYSTEM_NAME} style={logo} />
              <Text style={brandName}>{SYSTEM_NAME}</Text>
            </Link>
          </Section>
          <Hr style={divider} />
          <Heading style={h1}>דוח החתמות חסרות — {reportDate}</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            להלן רשימת העובדים{companyName ? ` ב${companyName}` : ''} שלא ביצעו החתמת נוכחות היום ({reportDate}) ולא הוגשה עבורם בקשת חופשה/מחלה מאושרת:
          </Text>
          {employees.length === 0 ? (
            <Text style={text}><strong>כל העובדים החתימו נוכחות היום 🎉</strong></Text>
          ) : (
            <Section style={tableWrap}>
              <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th style={th as any}>#</th>
                    <th style={th as any}>עובד</th>
                    {!companyName && <th style={th as any}>חברה</th>}
                    <th style={th as any}>סטטוס</th>
                    <th style={th as any}>החתמות שבוצעו</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((r, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 ? '#fafbfc' : '#ffffff' }}>
                      <td style={td as any}>{i + 1}</td>
                      <td style={td as any}>{r.full_name}</td>
                      {!companyName && <td style={td as any}>{r.company_name ?? '—'}</td>}
                      <td style={td as any}>{r.gap_type === 'empty' ? 'ללא החתמות' : 'החתמה אי-זוגית'}</td>
                      <td style={td as any}>{r.punches || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          {downloadUrl && employees.length > 0 && (
            <Section style={buttonSection}>
              <Button style={button} href={downloadUrl}>הורדת קובץ Excel</Button>
            </Section>
          )}
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי בכל יום בשעה 12:00.</Text>
        </Section>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `דוח יומי משאבי אנוש — ${d?.employees?.length ?? 0} עובדים ללא החתמה (${d?.reportDate ?? ''})`,
  displayName: 'דוח יומי — עובדים ללא החתמת נוכחות',
  previewData: {
    recipientName: 'צוות משאבי אנוש',
    reportDate: '08/07/2026',
    companyName: 'חברת דוגמה',
    employees: [
      { full_name: 'יוסי כהן', gap_type: 'empty', punches: '' },
      { full_name: 'שרה לוי', gap_type: 'odd', punches: '08:12 כניסה' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Heebo', Arial, sans-serif", padding: '20px 0' }
const container = { maxWidth: '720px', margin: '0 auto' }
const card = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '40px 32px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e8ecf1' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoLink = { textDecoration: 'none', display: 'inline-block' }
const logo = { margin: '0 auto', borderRadius: '12px' }
const brandName = { fontSize: '18px', fontWeight: '700' as const, color: 'hsl(220, 25%, 10%)', margin: '12px 0 0', textAlign: 'center' as const }
const divider = { borderColor: '#e8ecf1', margin: '24px 0' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(220, 25%, 10%)', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: 'hsl(215, 15%, 30%)', lineHeight: '1.7', margin: '0 0 12px' }
const tableWrap = { margin: '16px 0' }
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '14px', border: '1px solid #e8ecf1', borderRadius: '8px', overflow: 'hidden' }
const th = { textAlign: 'right' as const, padding: '10px 12px', backgroundColor: '#f4f6f9', color: 'hsl(220, 25%, 10%)', fontWeight: '600' as const, borderBottom: '1px solid #e8ecf1' }
const td = { textAlign: 'right' as const, padding: '10px 12px', color: 'hsl(215, 15%, 30%)', borderBottom: '1px solid #f0f2f5' }
const footer = { fontSize: '13px', color: '#888', margin: '0', textAlign: 'center' as const }
const bottomFooter = { fontSize: '12px', color: '#b0b0b0', textAlign: 'center' as const, margin: '16px 0 0' }
