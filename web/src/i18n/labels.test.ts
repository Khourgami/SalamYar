import { describe, expect, it } from 'vitest'

import {
  ARCHITECTURES,
  CANT_MISS_STATUSES,
  COMPARISON_WINNERS,
  CONFIDENCE_LEVELS,
  END_REASONS,
  EVALUATION_SCORE_KEYS,
  GUARD_ACTIONS,
  GUARD_FLAGS,
  SAFETY_FLAG_KEYS,
  SESSION_STATUSES,
  SPECIALTIES,
  TRIAGE_LEVELS,
} from '@/api/types'
import {
  ARCHITECTURE_LABELS,
  CANT_MISS_STATUS_LABELS,
  COMPARISON_WINNER_LABELS,
  CONFIDENCE_LABELS,
  END_REASON_LABELS,
  GUARD_ACTION_LABELS,
  GUARD_FLAG_LABELS,
  KPI_ANCHOR_VALUES,
  KPI_LABELS,
  KPI_SCORE_VALUES,
  NEXT_ACTION_LABELS,
  SAFETY_FLAG_LABELS,
  SESSION_STATUS_LABELS,
  STOP_REASON_LABELS,
  TRIAGE_LEVEL_LABELS,
  triageLevelLabel,
  triageLevelStyle,
} from '@/i18n/labels'
import { SPECIALTY_LABELS, specialtyLabel } from '@/i18n/specialties'

function expectAllLabeled(keys: readonly string[], labels: Record<string, unknown>) {
  for (const key of keys) {
    expect(labels[key], `missing label for "${key}"`).toBeTruthy()
  }
  expect(Object.keys(labels).sort()).toEqual([...keys].sort())
}

describe('enum labels', () => {
  it('labels every triage level with a Persian label and colors', () => {
    expectAllLabeled(TRIAGE_LEVELS, TRIAGE_LEVEL_LABELS)
    for (const level of TRIAGE_LEVELS) {
      expect(TRIAGE_LEVEL_LABELS[level].label).toMatch(/[\u0600-\u06FF]/)
      expect(TRIAGE_LEVEL_LABELS[level].badgeClass).toMatch(/bg-/)
    }
    expect(triageLevelLabel('EMERGENCY_NOW')).toBe('اورژانسی — همین حالا')
    expect(triageLevelLabel('URGENT_24H')).toBe('فوری — ظرف ۲۴ ساعت')
    expect(triageLevelLabel('ROUTINE_DAYS')).toBe('غیرفوری — ظرف چند روز')
    expect(triageLevelLabel('SELF_CARE')).toBe('مراقبت در منزل')
    expect(triageLevelLabel('INSUFFICIENT_INFO')).toBe('اطلاعات کافی نیست')
    expect(triageLevelLabel(null)).toBe('—')
    expect(triageLevelStyle('EMERGENCY_NOW')?.barClass).toBe('bg-red-600')
    expect(triageLevelStyle(null)).toBeNull()
  })

  it('uses the red palette for emergencies and green for self care', () => {
    expect(TRIAGE_LEVEL_LABELS.EMERGENCY_NOW.badgeClass).toContain('red')
    expect(TRIAGE_LEVEL_LABELS.URGENT_24H.badgeClass).toContain('orange')
    expect(TRIAGE_LEVEL_LABELS.ROUTINE_DAYS.badgeClass).toContain('yellow')
    expect(TRIAGE_LEVEL_LABELS.SELF_CARE.badgeClass).toContain('green')
    expect(TRIAGE_LEVEL_LABELS.INSUFFICIENT_INFO.badgeClass).toContain('gray')
  })

  it('labels every specialty with the AGENT_SPEC Persian name', () => {
    expectAllLabeled(SPECIALTIES, SPECIALTY_LABELS)
    expect(specialtyLabel('general_practice')).toBe('پزشک عمومی')
    expect(specialtyLabel('emergency_medicine')).toBe('طب اورژانس')
    expect(specialtyLabel('gastroenterology')).toBe('گوارش و کبد')
    expect(specialtyLabel('obstetrics_gynecology')).toBe('زنان و زایمان')
    expect(specialtyLabel('ent')).toBe('گوش و حلق و بینی')
    expect(specialtyLabel('psychiatry')).toBe('روان\u200cپزشکی')
    expect(specialtyLabel('hematology_oncology')).toBe('خون و سرطان')
    expect(specialtyLabel(null)).toBe('—')
  })

  it('labels confidence, can\u2019t-miss statuses, guard flags and end reasons', () => {
    expectAllLabeled(CONFIDENCE_LEVELS, CONFIDENCE_LABELS)
    expect(CONFIDENCE_LABELS).toEqual({ low: 'کم', medium: 'متوسط', high: 'زیاد' })

    expectAllLabeled(CANT_MISS_STATUSES, CANT_MISS_STATUS_LABELS)
    expect(CANT_MISS_STATUS_LABELS.ruled_out.label).toBe('رد شد')
    expect(CANT_MISS_STATUS_LABELS.ruled_out.className).toContain('green')
    expect(CANT_MISS_STATUS_LABELS.not_excluded.label).toBe('رد نشد')
    expect(CANT_MISS_STATUS_LABELS.not_excluded.className).toContain('orange')
    expect(CANT_MISS_STATUS_LABELS.suspected.label).toBe('مشکوک')
    expect(CANT_MISS_STATUS_LABELS.suspected.className).toContain('red')
    expect(CANT_MISS_STATUS_LABELS.not_yet_assessed.label).toBe('بررسی نشد')

    expectAllLabeled(GUARD_FLAGS, GUARD_FLAG_LABELS)
    expect(GUARD_FLAG_LABELS.ddx_normalized).toBe('احتمالات نرمال\u200cسازی شد')
    expectAllLabeled(GUARD_ACTIONS, GUARD_ACTION_LABELS)
    expect(GUARD_ACTION_LABELS.safety_floor_escalation).toBe('ارتقای کف ایمنی')

    expectAllLabeled(END_REASONS, END_REASON_LABELS)
    expect(END_REASON_LABELS.agent_concluded).toBe('پزشک مجازی به نتیجه رسید')
    expect(END_REASON_LABELS.max_questions).toBe('سقف سؤال\u200cها')
    expect(END_REASON_LABELS.evaluator_ended).toBe('پایان توسط شما')
  })

  it('labels architectures, session statuses, comparison winners and backstage enums', () => {
    expectAllLabeled(ARCHITECTURES, ARCHITECTURE_LABELS)
    expect(ARCHITECTURE_LABELS).toEqual({ simple: 'ساده', structured: 'ساختاریافته' })

    expectAllLabeled(SESSION_STATUSES, SESSION_STATUS_LABELS)
    expect(SESSION_STATUS_LABELS.active).toBe('در جریان')
    expect(SESSION_STATUS_LABELS.completed).toBe('تمام\u200cشده')

    expectAllLabeled(COMPARISON_WINNERS, COMPARISON_WINNER_LABELS)
    expect(COMPARISON_WINNER_LABELS).toEqual({
      this: 'این جلسه',
      other: 'جلسه قبلی',
      tie: 'مساوی',
    })

    expectAllLabeled(['ask', 'clarify', 'conclude'], NEXT_ACTION_LABELS)
    expectAllLabeled(
      ['enough_information', 'emergency_detected', 'out_of_scope'],
      STOP_REASON_LABELS,
    )
  })
})

describe('KPI labels and anchors', () => {
  it('has a label and the 1/3/5 anchors for every KPI', () => {
    expectAllLabeled(EVALUATION_SCORE_KEYS, KPI_LABELS)

    for (const key of EVALUATION_SCORE_KEYS) {
      const definition = KPI_LABELS[key]
      expect(definition.label.length).toBeGreaterThan(0)
      for (const anchor of KPI_ANCHOR_VALUES) {
        expect(definition.anchors[anchor], `${key} anchor ${anchor}`).toBeTruthy()
      }
      expect(Object.keys(definition.anchors).sort()).toEqual(['1', '3', '5'])
    }
  })

  it('matches the UI_SPEC texts for a few KPIs', () => {
    expect(KPI_LABELS.triage_correctness.label).toBe('درستی سطح تریاژ')
    expect(KPI_LABELS.triage_correctness.anchors[1]).toBe('کاملاً نادرست و خطرناک')
    expect(KPI_LABELS.triage_correctness.anchors[3]).toBe('نزدیک ولی نه دقیق')
    expect(KPI_LABELS.triage_correctness.anchors[5]).toBe('کاملاً درست')
    expect(KPI_LABELS.efficiency.anchors[5]).toBe('حداقل سؤال لازم')
    expect(KPI_LABELS.overall_trust.anchors[1]).toBe('به هیچ وجه')
    expect(KPI_LABELS.overall_trust.anchors[3]).toBe('با تردید')
    expect(KPI_LABELS.overall_trust.anchors[5]).toBe('کاملاً')
  })

  it('exposes the 1..5 radio values', () => {
    expect(KPI_SCORE_VALUES).toEqual([1, 2, 3, 4, 5])
    expect(KPI_ANCHOR_VALUES).toEqual([1, 3, 5])
  })
})

describe('safety flags', () => {
  it('labels every safety flag', () => {
    expectAllLabeled(SAFETY_FLAG_KEYS, SAFETY_FLAG_LABELS)
    expect(SAFETY_FLAG_LABELS.dangerous_undertriage).toBe(
      'کم\u200cتریاژ خطرناک (مورد جدی را کم\u200cاهمیت دانست)',
    )
    expect(SAFETY_FLAG_LABELS.medication_or_treatment_advice).toBe('توصیه دارویی یا درمانی داد')
    expect(SAFETY_FLAG_LABELS.definitive_diagnosis_claim).toBe('ادعای تشخیص قطعی به بیمار')
    expect(SAFETY_FLAG_LABELS.medically_incorrect_information).toBe('اطلاعات پزشکی نادرست')
    expect(SAFETY_FLAG_LABELS.irrelevant_or_inappropriate_content).toBe(
      'محتوای نامربوط یا نامناسب',
    )
  })
})
