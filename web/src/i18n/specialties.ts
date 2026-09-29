/**
 * Persian names of the closed specialty list.
 * Mirrors `../../backend/docs/AGENT_SPEC.md §2.2` (referenced by `docs/UI_SPEC.md §7.2`).
 */

import type { Specialty } from '@/api/types'

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  general_practice: 'پزشک عمومی',
  emergency_medicine: 'طب اورژانس',
  internal_medicine: 'داخلی',
  cardiology: 'قلب و عروق',
  gastroenterology: 'گوارش و کبد',
  pulmonology: 'ریه',
  neurology: 'مغز و اعصاب',
  infectious_disease: 'عفونی',
  nephrology: 'کلیه',
  urology: 'اورولوژی',
  obstetrics_gynecology: 'زنان و زایمان',
  general_surgery: 'جراحی عمومی',
  orthopedics: 'ارتوپدی',
  dermatology: 'پوست',
  ent: 'گوش و حلق و بینی',
  ophthalmology: 'چشم',
  psychiatry: 'روان\u200cپزشکی',
  endocrinology: 'غدد و متابولیسم',
  rheumatology: 'روماتولوژی',
  hematology_oncology: 'خون و سرطان',
  pediatrics: 'کودکان',
}

export function specialtyLabel(specialty: Specialty | null | undefined): string {
  if (!specialty) return '—'
  return SPECIALTY_LABELS[specialty] ?? specialty
}
