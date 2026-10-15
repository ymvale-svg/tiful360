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
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps extends EmailBrand {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  companyLogoUrl,
  companyName,

  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>איפוס סיסמה ל{siteName}</>}>
        <Heading style={h1}>איפוס סיסמה</Heading>
        <Text style={text}>
          קיבלנו בקשה לאיפוס הסיסמה שלך במערכת {siteName}. לחצו על הכפתור למטה
          כדי לבחור סיסמה חדשה.
        </Text>
        <Button style={button} href={confirmationUrl}>
          איפוס סיסמה
        </Button>
        <Text style={footer}>
          אם לא ביקשתם איפוס סיסמה, ניתן להתעלם מהודעה זו. הסיסמה שלכם לא תשתנה.
        </Text>
      </EmailLayout>
)

export default RecoveryEmail

const main = emailStyles.main
const container = emailStyles.container
const h1 = emailStyles.heading
const text = emailStyles.text
const button = emailStyles.button
const footer = emailStyles.footer
