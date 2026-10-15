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

interface MagicLinkEmailProps extends EmailBrand {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  companyLogoUrl,
  companyName,

  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>קישור כניסה ל{siteName}</>}>
        <Heading style={h1}>קישור הכניסה שלך</Heading>
        <Text style={text}>
          לחצו על הכפתור למטה כדי להיכנס למערכת {siteName}. הקישור יפוג בקרוב.
        </Text>
        <Button style={button} href={confirmationUrl}>
          כניסה למערכת
        </Button>
        <Text style={footer}>
          אם לא ביקשתם קישור זה, ניתן להתעלם מהודעה זו.
        </Text>
      </EmailLayout>
)

export default MagicLinkEmail

const h1 = emailStyles.heading
const text = emailStyles.text
const button = emailStyles.button
const footer = emailStyles.footer
