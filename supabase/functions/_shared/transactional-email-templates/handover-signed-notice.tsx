/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Item { name: string; code?: string }

interface Props {
  recipientName?: string
  employeeName?: string
  title?: string
  direction?: 'handover' | 'return'
  signedAt?: string
  items?: Item[]
  formUrl?: string
}

const Email = ({
  recipientName = '',
  employeeName = '',
  title,
  direction = 'handover',
  signedAt = '',
  items = [],
  formUrl = 'https://tiful360.com',
}: Props) => {
  const heading = title || (direction === 'return' ? 'טופס הזדכות על ציוד' : 'טופס מסירת ציוד')
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{`${employeeName} חתם/ה על ${heading}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ textAlign: 'center' }}>
            <Img src={LOGO_URL} alt={SYSTEM_NAME} width="120" style={{ margin: '0 auto 12px' }} />
          </Section>
          <Heading style={h1}>הטופס נחתם</Heading>
          <Text style={text}>שלום {recipientName},</Text>
          <Text style={text}>
            {employeeName} חתם/ה על {heading}
            {signedAt ? ` בתאריך ${signedAt}` : ''}.
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
            <Button href={formUrl} style={button}>צפייה בטופס החתום</Button>
          </Section>

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
    `${d?.employeeName || 'העובד'} חתם/ה על ${d?.title || (d?.direction === 'return' ? 'טופס הזדכות על ציוד' : 'טופס מסירת ציוד')}`,
  displayName: 'הודעה על חתימת טופס',
  previewData: {
    recipientName: 'מנהל תפעול',
    employeeName: 'ישראל ישראלי',
    signedAt: '16/09/2026 11:20',
    items: [{ name: 'מחשב נייד', code: 'PC-0926-001' }],
    formUrl: 'https://tiful360.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto', textAlign: 'right' as const }
const h1 = { fontSize: '20px', color: '#166534', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#111827', lineHeight: '22px', margin: '0 0 10px' }
const itemText = { fontSize: '14px', color: '#111827', margin: '0 0 6px' }
const box = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const button = {
  backgroundColor: '#166534', color: '#ffffff', padding: '12px 28px',
  borderRadius: '8px', fontWeight: 600, fontSize: '15px', textDecoration: 'none',
}
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '20px 0' }
const small = { fontSize: '12px', color: '#6b7280', lineHeight: '20px', margin: '0 0 6px' }
