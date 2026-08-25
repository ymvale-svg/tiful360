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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  companyName?: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  companyName,
}: InviteEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head />
    <Preview>הוזמנת להצטרף ל{companyName || siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
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
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
