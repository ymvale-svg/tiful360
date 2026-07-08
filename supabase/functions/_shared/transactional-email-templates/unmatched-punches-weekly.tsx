/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Row { employee_code: string; punch_count: number; first_seen: string; last_seen: string }
interface Props {
  recipientName?: string
  companyName?: string
  fromDate?: string
  toDate?: string
  rows?: Row[]
}

const Email = ({ recipientName = 'שלום', companyName, fromDate = '', toDate = '', rows = [] }: Props) => (
  <Html lang="he" dir="rtl">
    <Head><meta charSet="utf-8" /></Head>
    <Preview>{rows.length} קודי עובד ללא שיוך לכרטיס עובד — נדרש טיפול</Preview>
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
          <Heading style={h1}>החתמות ללא שיוך לכרטיס עובד</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            במהלך השבוע האחרון ({fromDate} — {toDate}) התקבלו החתמות נוכחות{companyName ? ` ב${companyName}` : ''} עם קודי עובד שלא קיימים במערכת.
            יש לפתוח כרטיס עובד עבור כל קוד ברשימה כדי שההחתמות ישויכו אוטומטית:
          </Text>
          <Section style={tableWrap}>
            <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th as any}>#</th>
                  <th style={th as any}>קוד עובד</th>
                  <th style={th as any}>מס' החתמות</th>
                  <th style={th as any}>החתמה ראשונה</th>
                  <th style={th as any}>החתמה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? '#fafbfc' : '#ffffff' }}>
                    <td style={td as any}>{i + 1}</td>
                    <td style={td as any}><strong>{r.employee_code}</strong></td>
                    <td style={td as any}>{r.punch_count}</td>
                    <td style={td as any}>{r.first_seen}</td>
                    <td style={td as any}>{r.last_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי מדי יום חמישי בשעה 14:00.</Text>
        </Section>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `החתמות ללא שיוך — ${d?.rows?.length ?? 0} קודי עובד (${d?.fromDate ?? ''} — ${d?.toDate ?? ''})`,
  displayName: 'דוח שבועי — החתמות ללא שיוך לכרטיס עובד',
  previewData: {
    recipientName: 'צוות חשבות שכר',
    companyName: 'חברת דוגמה',
    fromDate: '02/07/2026',
    toDate: '08/07/2026',
    rows: [
      { employee_code: '12345', punch_count: 8, first_seen: '02/07/2026 07:02', last_seen: '08/07/2026 16:31' },
      { employee_code: '77812', punch_count: 3, first_seen: '05/07/2026 09:11', last_seen: '07/07/2026 17:04' },
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
