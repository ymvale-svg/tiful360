import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface Row { full_name: string; company_name?: string; gap_type: 'empty' | 'odd'; punches: string }
interface Props extends EmailBrand {
  recipientName?: string
  reportDate?: string
  employees?: Row[]
  companyName?: string
  downloadUrl?: string
}

const Email = ({
  companyLogoUrl,
 recipientName = 'שלום', reportDate = '', employees = [], companyName, downloadUrl }: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>דוח יומי — {employees.length} עובדים לא החתימו נוכחות היום</>}>
        <>
          
          <Heading style={h1}>דוח החתמות חסרות — {reportDate}</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            להלן רשימת העובדים{companyName ? ` ב${companyName}` : ''} שלא ביצעו החתמת נוכחות היום ({reportDate}) ולא הוגשה עבורם בקשת חופשה/מחלה מאושרת:
          </Text>
          {employees.length === 0 ? (
            <Text style={text}><strong>כל העובדים החתימו נוכחות היום 🎉</strong></Text>
          ) : (
            <Section style={tableWrap}>
              <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th style={th as any}>#</th>
                    <th style={th as any}>עובד</th>
                    {!companyName && <th style={th as any}>חברה</th>}
                    <th style={th as any}>סטטוס</th>
                    <th style={th as any}>החתמות שבוצעו</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((r, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 ? emailTheme.alternate : emailTheme.surface }}>
                      <td style={td as any}>{i + 1}</td>
                      <td style={td as any}>{r.full_name}</td>
                      {!companyName && <td style={td as any}>{r.company_name ?? '—'}</td>}
                      <td style={td as any}>{r.gap_type === 'empty' ? 'ללא החתמות' : 'החתמה אי-זוגית'}</td>
                      <td style={td as any}>{r.punches || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          {downloadUrl && employees.length > 0 && (
            <Section style={buttonSection}>
              <Button style={button} href={downloadUrl}>הורדת קובץ Excel</Button>
            </Section>
          )}
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי בכל יום בשעה 12:00.</Text>
        </>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `דוח יומי משאבי אנוש — ${d?.employees?.length ?? 0} עובדים ללא החתמה (${d?.reportDate ?? ''})`,
  displayName: 'דוח יומי — עובדים ללא החתמת נוכחות',
  previewData: {
    recipientName: 'צוות משאבי אנוש',
    reportDate: '08/07/2026',
    companyName: 'חברת דוגמה',
    employees: [
      { full_name: 'יוסי כהן', gap_type: 'empty', punches: '' },
      { full_name: 'שרה לוי', gap_type: 'odd', punches: '08:12 כניסה' },
    ],
  },
} satisfies TemplateEntry

const divider = emailStyles.divider
const h1 = emailStyles.heading
const text = emailStyles.text
const tableWrap = { margin: '16px 0' }
const tableStyle = emailStyles.table
const th = emailStyles.th
const td = emailStyles.td
const footer = emailStyles.footer
const bottomFooter = emailStyles.footer
const buttonSection = { textAlign: 'right' as const, margin: '18px 0 8px' }
const button = emailStyles.button
