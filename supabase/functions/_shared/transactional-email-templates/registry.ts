import type { ComponentType } from 'npm:react@18.3.1'
import { template as attendanceGaps } from './attendance-gaps.tsx'
import { template as hrDailyMissing } from './hr-daily-missing.tsx'
import { template as hrWeeklyGaps } from './hr-weekly-gaps.tsx'
import { template as unmatchedPunches } from './unmatched-punches.tsx'
import { template as unmatchedPunchesWeekly } from './unmatched-punches-weekly.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string | ((data: any) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'attendance-gaps': attendanceGaps,
  'hr-daily-missing': hrDailyMissing,
  'hr-weekly-gaps': hrWeeklyGaps,
  'unmatched-punches': unmatchedPunches,
}

