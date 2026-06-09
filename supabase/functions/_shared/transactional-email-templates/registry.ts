import type { ComponentType } from 'npm:react@18.3.1'
import { template as attendanceGaps } from './attendance-gaps.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string | ((data: any) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'attendance-gaps': attendanceGaps,
}
