import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps extends EmailBrand {
  token: string
}

export const ReauthenticationEmail = ({ token, companyName, companyLogoUrl }: ReauthenticationEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>קוד האימות שלך</>}>
        <Heading style={h1}>אישור זהות</Heading>
        <Text style={text}>השתמשו בקוד הבא כדי לאשר את זהותכם:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          הקוד יפוג בקרוב. אם לא ביקשתם אותו, ניתן להתעלם מהודעה זו.
        </Text>
      </EmailLayout>
)

export default ReauthenticationEmail

const main = emailStyles.main
const container = emailStyles.container
const h1 = emailStyles.heading
const text = emailStyles.text
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 30px',
  direction: 'ltr' as const,
  letterSpacing: '4px',
}
const footer = emailStyles.footer
