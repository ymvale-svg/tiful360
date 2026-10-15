import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Field { label: string; value: string }

interface Props extends EmailBrand {
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
  companyLogoUrl,

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
    <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>{heading} — {itemName}</>}>
          <>
            

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
                      <tr key={i} style={{ backgroundColor: i % 2 ? emailTheme.alternate : emailTheme.surface }}>
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
              <Section style={{ textAlign: 'right', margin: '24px 0 8px' }}>
                <Button href={pdfUrl} style={button}>הורדת הפרוטוקול החתום (PDF)</Button>
              </Section>
            ) : null}

            <Text style={muted}>
              הטופס זמין גם באזור האישי שלך: <Link href={portalUrl} style={linkStyle}>{portalUrl}</Link>
            </Text>
          </>
        </EmailLayout>
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

const main = emailStyles.main
const container = emailStyles.container
const card = emailStyles.card
const logoSection = { textAlign: 'center' as const }
const logoLink = { textDecoration: 'none' }
const logo = { display: 'inline-block', borderRadius: '10px' }
const brandName = { fontSize: '14px', color: '#111827', fontWeight: 700, margin: '6px 0 0' }
const divider = emailStyles.divider
const h1 = emailStyles.heading
const text = emailStyles.text
const notesStyle = { ...text, backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }
const muted = { fontSize: '12px', color: '#6b7280', textAlign: 'right' as const, marginTop: '18px' }
const tableWrap = { margin: '12px 0' }
const tableStyle = emailStyles.table
const thCell = emailStyles.th
const td = emailStyles.td
const button = emailStyles.button
const linkStyle = { color: '#2563eb' }
