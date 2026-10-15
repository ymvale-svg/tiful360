import { EmailLayout } from '../email-layout.tsx'
import { emailStyles, emailTheme, type EmailBrand } from '../email-theme.ts'
/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link,
  Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SYSTEM_NAME = 'Tiful360'

interface Gap {
  date: string       // 'YYYY-MM-DD'
  weekday: string    // 'ראשון' etc
  type: 'empty' | 'odd'
  punches: string    // formatted existing punches
}

interface Props extends EmailBrand {
  employeeName?: string
  companyName?: string
  fromDate?: string
  toDate?: string
  gaps?: Gap[]
  correctionUrl?: string
}

const TYPE_LABEL: Record<string, string> = {
  empty: 'יום ללא החתמות',
  odd: 'מספר החתמות אי-זוגי',
}

const Email = ({
  companyLogoUrl,

  employeeName = 'עובד/ת',
  companyName,
  fromDate = '',
  toDate = '',
  gaps = [],
  correctionUrl = 'https://tiful360.com/portal',
}: Props) => (
  <EmailLayout companyName={companyName} companyLogoUrl={companyLogoUrl} preview={<>נמצאו {gaps.length} פערי החתמה בנוכחות שלך — נדרשת התייחסות</>}>
        <>
          
          <Heading style={h1}>נמצאו פערי החתמה בנוכחות שלך</Heading>
          <Text style={text}>שלום {employeeName},</Text>
          <Text style={text}>
            במהלך הבדיקה החודשית של דוחות הנוכחות{companyName ? ` ב${companyName}` : ''} בטווח{' '}
            <strong>{fromDate}</strong> עד <strong>{toDate}</strong>, נמצאו{' '}
            <strong>{gaps.length}</strong> ימים שדורשים התייחסות:
          </Text>

          <Section style={tableWrap}>
            <table style={tableStyle as any} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th as any}>תאריך</th>
                  <th style={th as any}>יום</th>
                  <th style={th as any}>סוג פער</th>
                  <th style={th as any}>החתמות קיימות</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? emailTheme.alternate : emailTheme.surface }}>
                    <td style={td as any}>{g.date}</td>
                    <td style={td as any}>{g.weekday}</td>
                    <td style={td as any}>{TYPE_LABEL[g.type] ?? g.type}</td>
                    <td style={td as any}>{g.punches || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section style={buttonSection}>
            <Button style={button} href={correctionUrl}>בקשת תיקון החתמה</Button>
          </Section>
          <Text style={footer}>
            לחיצה על הכפתור תפתח את האזור האישי עם טופס תיקון מוכן לשליחה.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>
            אם כל ההחתמות נכונות מבחינתך, ניתן להתעלם מהודעה זו.
          </Text>
        </>
        <Text style={bottomFooter}>
          © {new Date().getFullYear()} {SYSTEM_NAME}. כל הזכויות שמורות.
        </Text>
      </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `פערי החתמה בנוכחות${d?.gaps?.length ? ` (${d.gaps.length})` : ''} — נדרשת התייחסות`,
  displayName: 'דוח פערי החתמה לעובד',
  previewData: {
    employeeName: 'יוסי כהן',
    companyName: 'חברת דוגמה',
    fromDate: '01/05/2026',
    toDate: '31/05/2026',
    correctionUrl: 'https://tiful360.com/portal?tab=attendance&correction=open&date=2026-05-12',
    gaps: [
      { date: '12/05/2026', weekday: 'שלישי', type: 'empty', punches: '' },
      { date: '14/05/2026', weekday: 'חמישי', type: 'odd', punches: '08:12 כניסה' },
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
const buttonSection = { textAlign: 'right' as const, margin: '24px 0 8px' }
const button = emailStyles.button
const footer = emailStyles.footer
const bottomFooter = emailStyles.footer
