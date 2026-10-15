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

interface InviteEmailProps extends EmailBrand {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  companyName?: string
}

export const InviteEmail = ({
  companyLogoUrl,

  siteName,
  siteUrl,
  confirmationUrl,
  companyName,
}: InviteEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>הוזמנת להצטרף ל{companyName || siteName}</>}>
        <Heading style={h1}>הוזמנת להצטרף</Heading>
        <Text style={text}>
          {companyName ? `${companyName} הזמינה אותך להצטרף ל` : 'הוזמנת להצטרף ל'}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . לחצו על הכפתור למטה כדי לאשר את ההזמנה וליצור את החשבון שלכם.
        </Text>
        <Button style={button} href={confirmationUrl}>
          אישור ההזמנה
        </Button>
        <Text style={footer}>
          אם לא ציפיתם להזמנה הזו, ניתן להתעלם מהודעה זו.
        </Text>
      </EmailLayout>
)

export default InviteEmail

const main = emailStyles.main
const container = emailStyles.container
const h1 = emailStyles.heading
const text = emailStyles.text
const link = { color: 'inherit', textDecoration: 'underline' }
const button = emailStyles.button
const footer = emailStyles.footer
