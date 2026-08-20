/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Field { label: string; value: string }

interface Props {
  employeeName?: string
  companyName?: string
  itemName?: string
  itemCode?: string
  direction?: 'handover' | 'return'
  title?: string
  issuerName?: string
  issuedAt?: string
  fields?: Field[]
  notes?: string
  pdfUrl?: string
  portalUrl?: string
}

const Email = ({
  employeeName = '',
  companyName = '',
  itemName = '',
  itemCode = '',
  direction = 'handover',
  title,
  issuerName = '',
  issuedAt = '',
  fields = [],
  notes,
  pdfUrl,
  portalUrl = 'https://tiful360.com/portal',
}: Props) => {
  const isReturn = direction === 'return'
  const heading = title || (isReturn ? 'פרוטוקול הזדכות' : 'פרוטוקול משיכה')
  return (
    <Html lang="he" dir="rtl">
      <Head><meta charSet="utf-8" /></Head>
      <Preview>{heading} — {itemName}</Preview>
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

            <Heading style={h1}>{heading}</Heading>
            <Text style={text}>שלום {employeeName},</Text>
            <Text style={text}>
              {isReturn
                ? `בתאריך ${issuedAt} הוזדכית על ${itemName}${itemCode ? ` (${itemCode})` : ''}${companyName ? ` ב${companyName}` : ''}.`
                : `בתאריך ${issuedAt} נמסר לך ${itemName}${itemCode ? ` (${itemCode})` : ''}${companyName ? ` מטעם ${companyName}` : ''}.`}
              {issuerName ? ` המסירה בוצעה על ידי ${issuerName}.` : ''}
            </Text>

            {fields.length > 0 && (
              <Section style={tableWrap}>
                <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
                  <tbody>
                    {fields.map((f, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 ? '#fafbfc' : '#ffffff' }}>
                        <td style={thCell as any}>{f.label}</td>
                        <td style={td as any}>{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {notes ? <Text style={notesStyle}>{notes}</Text> : null}

            {pdfUrl ? (
              <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
                <Button href={pdfUrl} style={button}>הורדת הפרוטוקול החתום (PDF)</Button>
              </Section>
            ) : null}

            <Text style={muted}>
              הטופס זמין גם באזור האישי שלך: <Link href={portalUrl} style={linkStyle}>{portalUrl}</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    `${d?.direction === 'return' ? 'פרוטוקול הזדכות' : 'פרוטוקול מסירה'} — ${d?.itemName ?? ''}`,
  displayName: 'פרוטוקול מסירה / הזדכות',
  previewData: {
    employeeName: 'אדי ידלין',
    companyName: 'תפעול 360',
    itemName: 'רכב מאזדה 3',
    itemCode: 'VEH-014',
    direction: 'handover',
    issuerName: 'ישראל וייל',
    issuedAt: '20/08/2026 18:00',
    fields: [
      { label: 'מספר רישוי', value: '12-345-67' },
      { label: 'ק"מ במעמד המסירה', value: '54,300' },
    ],
    notes: 'הרכב נמסר נקי וללא נזקים גלויים',
    pdfUrl: 'https://example.com/protocol.pdf',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 12px' }
const card = { border: '1px solid #e6e8eb', borderRadius: '14px', padding: '24px' }
const logoSection = { textAlign: 'center' as const }
const logoLink = { textDecoration: 'none' }
const logo = { display: 'inline-block', borderRadius: '10px' }
const brandName = { fontSize: '14px', color: '#111827', fontWeight: 700, margin: '6px 0 0' }
const divider = { borderColor: '#eef0f2', margin: '16px 0' }
const h1 = { fontSize: '20px', color: '#111827', margin: '0 0 12px', textAlign: 'right' as const }
const text = { fontSize: '14px', lineHeight: '22px', color: '#374151', textAlign: 'right' as const }
const notesStyle = { ...text, backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }
const muted = { fontSize: '12px', color: '#6b7280', textAlign: 'right' as const, marginTop: '18px' }
const tableWrap = { margin: '12px 0' }
const tableStyle = { width: '100%', borderCollapse: 'collapse', direction: 'rtl' }
const thCell = { fontSize: '13px', color: '#111827', fontWeight: 700, padding: '8px 10px', border: '1px solid #eef0f2', textAlign: 'right' }
const td = { fontSize: '13px', color: '#374151', padding: '8px 10px', border: '1px solid #eef0f2', textAlign: 'right' }
const button = { backgroundColor: '#2563eb', color: '#ffffff', fontSize: '14px', fontWeight: 700, padding: '12px 20px', borderRadius: '10px', textDecoration: 'none' }
const linkStyle = { color: '#2563eb' }
