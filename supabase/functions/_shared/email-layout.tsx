import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Html, Img, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import { emailStyles, type EmailBrand } from './email-theme.ts'

export function EmailLayout({ children, preview, companyName, companyLogoUrl }: EmailBrand & {
  children: React.ReactNode
  preview?: React.ReactNode
}) {
  const previewText = (node: React.ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(previewText).join('')
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) return previewText(node.props.children)
    return ''
  }
  return (
    <Html lang="he" dir="rtl">
      <Head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      {preview ? <Preview>{previewText(preview)}</Preview> : null}
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.card}>
            <Section style={emailStyles.header}>
              {companyLogoUrl ? (
                <Img src={companyLogoUrl} alt={companyName || 'לוגו החברה'} width="160" style={{ display: 'block', margin: '0 auto', width: '160px', maxWidth: '100%', height: 'auto' }} />
              ) : companyName ? (
                <Text style={{ ...emailStyles.heading, fontSize: '20px', margin: '0' }}>{companyName}</Text>
              ) : null}
            </Section>
            <Section style={emailStyles.content}>{children}</Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}