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

interface EmailChangeEmailProps extends EmailBrand {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  companyLogoUrl,
  companyName,

  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>אישור שינוי כתובת האימייל ב{siteName}</>}>
        <Heading style={h1}>אישור שינוי כתובת אימייל</Heading>
        <Text style={text}>
          ביקשתם לשנות את כתובת האימייל שלכם במערכת {siteName} מהכתובת{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>
            {oldEmail}
          </Link>{' '}
          לכתובת{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>לחצו על הכפתור למטה כדי לאשר את השינוי:</Text>
        <Button style={button} href={confirmationUrl}>
          אישור שינוי הכתובת
        </Button>
        <Text style={footer}>
          אם לא ביקשתם את השינוי, יש לאבטח את החשבון שלכם באופן מיידי.
        </Text>
      </EmailLayout>
)

export default EmailChangeEmail

const main = emailStyles.main
const container = emailStyles.container
const h1 = emailStyles.heading
const text = emailStyles.text
const link = { color: 'inherit', textDecoration: 'underline' }
const button = emailStyles.button
const footer = emailStyles.footer
