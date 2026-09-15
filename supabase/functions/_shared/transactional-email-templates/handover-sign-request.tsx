/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Item { name: string; code?: string }

interface Props {
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
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{`${heading} ממתין לחתימתך`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ textAlign: 'center' }}>
            <Img src={LOGO_URL} alt={SYSTEM_NAME} width="120" style={{ margin: '0 auto 12px' }} />
          </Section>
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

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={signUrl} style={button}>כניסה לאזור האישי וחתימה</Button>
          </Section>

          <Text style={small}>
            החתימה מתבצעת לאחר כניסה לאזור האישי בפורטל. אם הכפתור אינו עובד, העתיקו את הקישור לדפדפן:<br />
            <Link href={signUrl} style={{ color: '#1e40af', direction: 'ltr', display: 'inline-block' }}>{signUrl}</Link>
          </Text>

          <Hr style={hr} />
          <Text style={small}>הודעה זו נשלחה אוטומטית ממערכת {SYSTEM_NAME}.</Text>
        </Container>
      </Body>
    </Html>
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

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto', textAlign: 'right' as const }
const h1 = { fontSize: '20px', color: '#1e40af', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#111827', lineHeight: '22px', margin: '0 0 10px' }
const itemText = { fontSize: '14px', color: '#111827', margin: '0 0 6px' }
const box = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const button = {
  backgroundColor: '#1e40af', color: '#ffffff', padding: '12px 28px',
  borderRadius: '8px', fontWeight: 600, fontSize: '15px', textDecoration: 'none',
}
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '20px 0' }
const small = { fontSize: '12px', color: '#6b7280', lineHeight: '20px', margin: '0 0 6px' }
