import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface Item { name: string; code?: string }

interface Props extends EmailBrand {
  employeeName?: string
  companyName?: string
  title?: string
  direction?: 'handover' | 'return'
  issuerName?: string
  issuedAt?: string
  items?: Item[]
  signUrl?: string
}

const Email = ({
  companyLogoUrl,

  employeeName = '',
  companyName = '',
  title,
  direction = 'handover',
  issuerName = '',
  issuedAt = '',
  items = [],
  signUrl = 'https://tiful360.com/portal',
}: Props) => {
  const heading = title || (direction === 'return' ? 'טופס הזדכות על ציוד' : 'טופס מסירת ציוד')
  return (
    <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>{`${heading} ממתין לחתימתך`}</>}>
          
          <Heading style={h1}>{heading} ממתין לחתימתך</Heading>
          <Text style={text}>שלום {employeeName},</Text>
          <Text style={text}>
            {companyName ? `${companyName} ` : ''}הכינה עבורך טופס דיגיטלי לחתימה
            {issuerName ? ` (נערך על ידי ${issuerName})` : ''}
            {issuedAt ? ` בתאריך ${issuedAt}` : ''}.
          </Text>

          {items.length > 0 && (
            <Section style={box}>
              {items.map((it, i) => (
                <Text key={i} style={itemText}>
                  • {it.name}{it.code ? ` (${it.code})` : ''}
                </Text>
              ))}
            </Section>
          )}

          <Section style={{ textAlign: 'right', margin: '28px 0' }}>
            <Button href={signUrl} style={button}>כניסה לאזור האישי וחתימה</Button>
          </Section>

          <Text style={small}>
            החתימה מתבצעת לאחר כניסה לאזור האישי בפורטל. אם הכפתור אינו עובד, העתיקו את הקישור לדפדפן:<br />
            <Link href={signUrl} style={{ color: '#1e40af', direction: 'ltr', display: 'inline-block' }}>{signUrl}</Link>
          </Text>

          <Hr style={hr} />
          <Text style={small}>הודעה זו נשלחה אוטומטית ממערכת {SYSTEM_NAME}.</Text>
        </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    `${d?.title || (d?.direction === 'return' ? 'טופס הזדכות על ציוד' : 'טופס מסירת ציוד')} ממתין לחתימתך`,
  displayName: 'בקשת חתימה על טופס מסירה',
  previewData: {
    employeeName: 'ישראל ישראלי',
    companyName: 'אשל',
    issuerName: 'מנהל תפעול',
    issuedAt: '15/09/2026',
    items: [{ name: 'מחשב נייד', code: 'PC-0926-001' }],
    signUrl: 'https://tiful360.com/handover/abc123',
  },
} satisfies TemplateEntry

const h1 = emailStyles.heading
const text = emailStyles.text
const itemText = emailStyles.text
const box = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const button = emailStyles.button
const hr = emailStyles.divider
const small = emailStyles.footer
