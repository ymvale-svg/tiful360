import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface UnmatchedEntry {
  employee_code: string
  first_punch_at: string
  punch_count: number
}

interface Props extends EmailBrand {
  companyName?: string
  entries?: UnmatchedEntry[]
}

const Email = ({
  companyLogoUrl,
 companyName = '', entries = [] }: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>נמצאו החתמות נוכחות ללא כרטיס עובד תואם — נדרשת פתיחת עובד במערכת</>}>
        <>
          
          <Heading style={h1}>החתמות נוכחות ללא שיוך לעובד</Heading>
          <Text style={text}>שלום,</Text>
          <Text style={text}>
            במערכת התקבלו החתמות נוכחות{companyName ? ` ב${companyName}` : ''} עבור <strong>קודי עובד שלא קיימים במערכת תפעול 360</strong>.
            סימן שקיים עובד המחתים בשעון הנוכחות ללא כרטיס עובד פתוח במערכת.
          </Text>
          <Text style={text}>
            נא לפתוח כרטיס עובד עם קוד העובד המתאים כדי שההחתמות יזוהו וישויכו אוטומטית.
          </Text>
          <Section style={tableWrap}>
            <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th as any}>קוד עובד בשעון</th>
                  <th style={th as any}>מס' החתמות</th>
                  <th style={th as any}>החתמה ראשונה</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? emailTheme.alternate : emailTheme.surface }}>
                    <td style={td as any}><strong>{e.employee_code}</strong></td>
                    <td style={td as any}>{e.punch_count}</td>
                    <td style={td as any}>{e.first_punch_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Hr style={divider} />
          <Text style={footer}>מייל זה נשלח פעם אחת ביום לכל קוד עובד לא מוכר.</Text>
        </>
        <Text style={bottomFooter}>© {new Date().getFullYear()} {SYSTEM_NAME}.</Text>
      </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `החתמות ללא שיוך לעובד${d?.entries?.length ? ` (${d.entries.length} קודים)` : ''} — נדרשת התייחסות`,
  displayName: 'התראה — החתמות ללא כרטיס עובד',
  previewData: {
    companyName: 'חברת דוגמה',
    entries: [
      { employee_code: '1042', punch_count: 2, first_punch_at: '08/07/2026 08:12' },
      { employee_code: '9910', punch_count: 1, first_punch_at: '08/07/2026 09:03' },
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
