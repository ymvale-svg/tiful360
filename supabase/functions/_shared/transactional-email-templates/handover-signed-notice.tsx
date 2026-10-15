import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

interface Item { name: string; code?: string }

interface Props extends EmailBrand {
  recipientName?: string
  employeeName?: string
  title?: string
  direction?: 'handover' | 'return'
  signedAt?: string
  items?: Item[]
  formUrl?: string
}

const Email = ({
  companyLogoUrl,
  companyName,

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
    <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>{`${employeeName} חתם/ה על ${heading}`}</>}>
          
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

          <Section style={{ textAlign: 'right', margin: '28px 0' }}>
            <Button href={formUrl} style={button}>צפייה בטופס החתום</Button>
          </Section>

          <Hr style={hr} />
          <Text style={small}>הודעה זו נשלחה אוטומטית ממערכת {SYSTEM_NAME}.</Text>
        </EmailLayout>
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

const main = emailStyles.main
const container = emailStyles.container
const h1 = emailStyles.heading
const text = emailStyles.text
const itemText = emailStyles.text
const box = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '12px 16px', margin: '16px 0' }
const button = emailStyles.button
const hr = emailStyles.divider
const small = emailStyles.footer
