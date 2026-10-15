import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface Props extends EmailBrand {
  recipientName?: string
  companyName?: string
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
  fromDate = '',
  toDate = '',
  gapCount = 0,
  employeeCount = 0,
  downloadUrl = '#',
}: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>דוח אקסל שבועי — כל החוסרים בהחתמת נוכחות</>}>
        <>
          
          <Heading style={h1}>דוח שבועי — חוסרי החתמה</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            מצורף דוח אקסל של כלל חוסרי ההחתמה{companyName ? ` ב${companyName}` : ''} בטווח <strong>{fromDate}</strong> עד <strong>{toDate}</strong>.
          </Text>
          <Section style={statsBox}>
            <Text style={statLine}><strong>{employeeCount}</strong> עובדים · <strong>{gapCount}</strong> ימי חוסר</Text>
          </Section>
          <Section style={buttonSection}>
            <Button style={button} href={downloadUrl}>הורדת קובץ האקסל</Button>
          </Section>
          <Text style={footer}>קישור ההורדה בתוקף למספר ימים.</Text>
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי בכל יום חמישי בשעה 14:00.</Text>
        </>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `דוח אקסל שבועי — חוסרי החתמה (${d?.fromDate ?? ''}–${d?.toDate ?? ''})`,
  displayName: 'דוח אקסל שבועי — משאבי אנוש',
  previewData: {
    recipientName: 'צוות משאבי אנוש',
    companyName: 'חברת דוגמה',
    fromDate: '01/07/2026',
    toDate: '07/07/2026',
    gapCount: 24,
    employeeCount: 8,
    downloadUrl: 'https://example.com/file.xlsx',
  },
} satisfies TemplateEntry

const divider = emailStyles.divider
const h1 = emailStyles.heading
const text = emailStyles.text
const statsBox = { backgroundColor: '#f4f6f9', border: '1px solid #e8ecf1', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const statLine = { fontSize: '15px', color: 'hsl(220, 25%, 10%)', margin: 0, textAlign: 'center' as const }
const buttonSection = { textAlign: 'right' as const, margin: '24px 0 8px' }
const button = emailStyles.button
const footer = emailStyles.footer
const bottomFooter = emailStyles.footer
