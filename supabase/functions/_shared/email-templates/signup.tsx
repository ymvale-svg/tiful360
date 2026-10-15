import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps extends EmailBrand {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  companyLogoUrl,
  companyName,

  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>אימות כתובת האימייל שלך ב{siteName}</>}>
        <Heading style={h1}>אימות כתובת האימייל</Heading>
        <Text style={text}>
          תודה שנרשמת ל
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          נא לאשר את כתובת האימייל שלך (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) בלחיצה על הכפתור למטה:
        </Text>
        <Button style={button} href={confirmationUrl}>
          אימות כתובת האימייל
        </Button>
        <Text style={footer}>
          אם לא יצרתם חשבון, ניתן להתעלם מהודעה זו.
        </Text>
      </EmailLayout>
)

export default SignupEmail

const h1 = emailStyles.heading
const text = emailStyles.text
const link = { color: 'inherit', textDecoration: 'underline' }
const button = emailStyles.button
const footer = emailStyles.footer
