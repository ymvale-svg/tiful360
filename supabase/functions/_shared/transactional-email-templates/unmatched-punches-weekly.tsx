import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface Row { employee_code: string; punch_count: number; first_seen: string; last_seen: string }
interface Props extends EmailBrand {
  recipientName?: string
  companyName?: string
  fromDate?: string
  toDate?: string
  rows?: Row[]
}

const Email = ({
  companyLogoUrl,
 recipientName = 'שלום', companyName, fromDate = '', toDate = '', rows = [] }: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>{rows.length} קודי עובד ללא שיוך לכרטיס עובד — נדרש טיפול</>}>
        <>
          
          <Heading style={h1}>החתמות ללא שיוך לכרטיס עובד</Heading>
          <Text style={text}>{recipientName},</Text>
          <Text style={text}>
            במהלך השבוע האחרון ({fromDate} — {toDate}) התקבלו החתמות נוכחות{companyName ? ` ב${companyName}` : ''} עם קודי עובד שלא קיימים במערכת.
            יש לפתוח כרטיס עובד עבור כל קוד ברשימה כדי שההחתמות ישויכו אוטומטית:
          </Text>
          <Section style={tableWrap}>
            <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th as any}>#</th>
                  <th style={th as any}>קוד עובד</th>
                  <th style={th as any}>מס' החתמות</th>
                  <th style={th as any}>החתמה ראשונה</th>
                  <th style={th as any}>החתמה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? emailTheme.alternate : emailTheme.surface }}>
                    <td style={td as any}>{i + 1}</td>
                    <td style={td as any}><strong>{r.employee_code}</strong></td>
                    <td style={td as any}>{r.punch_count}</td>
                    <td style={td as any}>{r.first_seen}</td>
                    <td style={td as any}>{r.last_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>דוח זה נשלח באופן אוטומטי מדי יום חמישי בשעה 14:00.</Text>
        </>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `החתמות ללא שיוך — ${d?.rows?.length ?? 0} קודי עובד (${d?.fromDate ?? ''} — ${d?.toDate ?? ''})`,
  displayName: 'דוח שבועי — החתמות ללא שיוך לכרטיס עובד',
  previewData: {
    recipientName: 'צוות חשבות שכר',
    companyName: 'חברת דוגמה',
    fromDate: '02/07/2026',
    toDate: '08/07/2026',
    rows: [
      { employee_code: '12345', punch_count: 8, first_seen: '02/07/2026 07:02', last_seen: '08/07/2026 16:31' },
      { employee_code: '77812', punch_count: 3, first_seen: '05/07/2026 09:11', last_seen: '07/07/2026 17:04' },
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
