/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Props {
  recipientName?: string
  companyName?: string
  monthLabel?: string
  fromDate?: string
  toDate?: string
  gapCount?: number
  employeeCount?: number
  downloadUrl?: string
}

const Email = ({
  recipientName = 'שלום',
  companyName = '',
  monthLabel = '',
  fromDate = '',
  toDate = '',
  gapCount = 0,
  employeeCount = 0,
  downloadUrl = '#',
}: Props) => (
  <Html lang="he" dir="rtl">
    <Head><meta charSet="utf-8" /></Head>
    <Preview>דוח אקסל חודשי — כל חוסרי ההחתמה של החודש הקודם</Preview>
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
          <Heading style={h1}>דוח חודשי — חוסרי החתמה</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            מצורף דוח אקסל של כלל חוסרי ההחתמה{companyName ? ` ב${companyName}` : ''} עבור <strong>{monthLabel}</strong>
            {` (${fromDate} – ${toDate})`}.
          </Text>
          <Section style={statsBox}>
            <Text style={statLine}><strong>{employeeCount}</strong> עובדים · <strong>{gapCount}</strong> ימי חוסר</Text>
          </Section>
          <Section style={buttonSection}>
            <Button style={button} href={downloadUrl}>הורדת קובץ האקסל</Button>
          </Section>
          <Text style={footer}>קישור ההורדה בתוקף למספר ימים.</Text>
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי ביום הראשון של כל חודש, ומרכז את חוסרי החודש הקודם.</Text>
        </Section>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `דוח אקסל חודשי — חוסרי החתמה (${d?.monthLabel ?? ''})`,
  displayName: 'דוח אקסל חודשי — חשבות שכר',
  previewData: {
    recipientName: 'צוות חשבות שכר',
    companyName: 'חברת דוגמה',
    monthLabel: '06/2026',
    fromDate: '01/06/2026',
    toDate: '30/06/2026',
    gapCount: 96,
    employeeCount: 14,
    downloadUrl: 'https://example.com/file.xlsx',
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
const statsBox = { backgroundColor: '#f4f6f9', border: '1px solid #e8ecf1', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const statLine = { fontSize: '15px', color: 'hsl(220, 25%, 10%)', margin: 0, textAlign: 'center' as const }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0 8px' }
const button = { backgroundColor: 'hsl(215, 90%, 42%)', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#888', margin: '0', textAlign: 'center' as const }
const bottomFooter = { fontSize: '12px', color: '#b0b0b0', textAlign: 'center' as const, margin: '16px 0 0' }
