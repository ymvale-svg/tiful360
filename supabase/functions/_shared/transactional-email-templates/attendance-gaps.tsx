/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link,
  Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Gap {
  date: string       // 'YYYY-MM-DD'
  weekday: string    // 'ראשון' etc
  type: 'empty' | 'odd'
  punches: string    // formatted existing punches
}

interface Props {
  employeeName?: string
  companyName?: string
  fromDate?: string
  toDate?: string
  gaps?: Gap[]
  correctionUrl?: string
}

const TYPE_LABEL: Record<string, string> = {
  empty: 'יום ללא החתמות',
  odd: 'מספר החתמות אי-זוגי',
}

const Email = ({
  employeeName = 'עובד/ת',
  companyName,
  fromDate = '',
  toDate = '',
  gaps = [],
  correctionUrl = 'https://tiful360.com/portal',
}: Props) => (
  <Html lang="he" dir="rtl">
    <Head><meta charSet="utf-8" /></Head>
    <Preview>נמצאו {gaps.length} פערי החתמה בנוכחות שלך — נדרשת התייחסות</Preview>
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
          <Heading style={h1}>נמצאו פערי החתמה בנוכחות שלך</Heading>
          <Text style={text}>שלום {employeeName},</Text>
          <Text style={text}>
            במהלך הבדיקה החודשית של דוחות הנוכחות{companyName ? ` ב${companyName}` : ''} בטווח{' '}
            <strong>{fromDate}</strong> עד <strong>{toDate}</strong>, נמצאו{' '}
            <strong>{gaps.length}</strong> ימים שדורשים התייחסות:
          </Text>

          <Section style={tableWrap}>
            <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th as any}>תאריך</th>
                  <th style={th as any}>יום</th>
                  <th style={th as any}>סוג פער</th>
                  <th style={th as any}>החתמות קיימות</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? '#fafbfc' : '#ffffff' }}>
                    <td style={td as any}>{g.date}</td>
                    <td style={td as any}>{g.weekday}</td>
                    <td style={td as any}>{TYPE_LABEL[g.type] ?? g.type}</td>
                    <td style={td as any}>{g.punches || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href={correctionUrl}>בקשת תיקון החתמה</Button>
          </Section>
          <Text style={footer}>
            לחיצה על הכפתור תפתח את האזור האישי עם טופס תיקון מוכן לשליחה.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>
            אם כל ההחתמות נכונות מבחינתך, ניתן להתעלם מהודעה זו.
          </Text>
        </Section>
        <Text style={bottomFooter}>
          © {new Date().getFullYear()} {SYSTEM_NAME}. כל הזכויות שמורות.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `פערי החתמה בנוכחות${d?.gaps?.length ? ` (${d.gaps.length})` : ''} — נדרשת התייחסות`,
  displayName: 'דוח פערי החתמה לעובד',
  previewData: {
    employeeName: 'יוסי כהן',
    companyName: 'חברת דוגמה',
    fromDate: '01/05/2026',
    toDate: '31/05/2026',
    correctionUrl: 'https://tiful360.com/portal?tab=attendance&correction=open&date=2026-05-12',
    gaps: [
      { date: '12/05/2026', weekday: 'שלישי', type: 'empty', punches: '' },
      { date: '14/05/2026', weekday: 'חמישי', type: 'odd', punches: '08:12 כניסה' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Heebo', Arial, sans-serif", padding: '20px 0' }
const container = { maxWidth: '640px', margin: '0 auto' }
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
const buttonSection = { textAlign: 'center' as const, margin: '24px 0 8px' }
const button = { backgroundColor: 'hsl(215, 90%, 42%)', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#888', margin: '0', textAlign: 'center' as const }
const bottomFooter = { fontSize: '12px', color: '#b0b0b0', textAlign: 'center' as const, margin: '16px 0 0' }
