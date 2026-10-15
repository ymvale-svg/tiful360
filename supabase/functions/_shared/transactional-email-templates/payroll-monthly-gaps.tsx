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

interface Props extends EmailBrand {
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
  companyLogoUrl,

  recipientName = 'שלום',
  companyName = '',
  monthLabel = '',
  fromDate = '',
  toDate = '',
  gapCount = 0,
  employeeCount = 0,
  downloadUrl = '#',
}: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>דוח אקסל חודשי — כל חוסרי ההחתמה של החודש הקודם</>}>
        <>
          
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
        </>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </EmailLayout>
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

const main = emailStyles.main
const container = emailStyles.container
const card = emailStyles.card
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logoLink = { textDecoration: 'none', display: 'inline-block' }
const logo = { margin: '0 auto', borderRadius: '12px' }
const brandName = { fontSize: '18px', fontWeight: '700' as const, color: 'hsl(220, 25%, 10%)', margin: '12px 0 0', textAlign: 'center' as const }
const divider = emailStyles.divider
const h1 = emailStyles.heading
const text = emailStyles.text
const statsBox = { backgroundColor: '#f4f6f9', border: '1px solid #e8ecf1', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const statLine = { fontSize: '15px', color: 'hsl(220, 25%, 10%)', margin: 0, textAlign: 'center' as const }
const buttonSection = { textAlign: 'right' as const, margin: '24px 0 8px' }
const button = emailStyles.button
const footer = emailStyles.footer
const bottomFooter = emailStyles.footer
