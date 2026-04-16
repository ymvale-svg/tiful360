/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SYSTEM_NAME = 'Tiful360'

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
    <Preview>קישור כניסה ל-{SYSTEM_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Section style={logoSection}>
            <Link href={`https://tiful360.com`} style={logoLink}>
              <Img src={LOGO_URL} width="48" height="48" alt={SYSTEM_NAME} style={logo} />
              <Text style={brandName}>{SYSTEM_NAME}</Text>
            </Link>
          </Section>
          <Hr style={divider} />
          <Heading style={h1}>קישור כניסה ✨</Heading>
          <Text style={text}>
            לחץ על הכפתור למטה כדי להתחבר ל-{SYSTEM_NAME}. שים לב שקישור זה תקף לזמן מוגבל.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={confirmationUrl}>
              התחבר למערכת
            </Button>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>
            אם לא ביקשת קישור כניסה, ניתן להתעלם מהודעה זו.
          </Text>
        </Section>
        <Text style={bottomFooter}>
          © {new Date().getFullYear()} {SYSTEM_NAME}. כל הזכויות שמורות.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#f4f6f9', fontFamily: "'Heebo', Arial, sans-serif", padding: '20px 0' }
const container = { maxWidth: '560px', margin: '0 auto' }
const card = { backgroundColor: '#ffffff', borderRadius: '16px', padding: '40px 32px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e8ecf1' }
const logoSection = { textAlign: 'center' as const, marginBottom: '8px' }
const logo = { margin: '0 auto', borderRadius: '12px' }
const brandName = { fontSize: '18px', fontWeight: '700' as const, color: 'hsl(220, 25%, 10%)', margin: '12px 0 0', textAlign: 'center' as const }
const divider = { borderColor: '#e8ecf1', margin: '24px 0' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(220, 25%, 10%)', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: 'hsl(215, 15%, 47%)', lineHeight: '1.7', margin: '0 0 16px' }
const buttonSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: 'hsl(215, 90%, 42%)', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '13px', color: '#999999', margin: '0', textAlign: 'center' as const }
const bottomFooter = { fontSize: '12px', color: '#b0b0b0', textAlign: 'center' as const, margin: '16px 0 0' }
