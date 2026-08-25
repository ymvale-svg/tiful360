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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head />
    <Preview>קישור כניסה ל{siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
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
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  direction: 'rtl' as const,
}
const container = { padding: '20px 25px', textAlign: 'right' as const }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
