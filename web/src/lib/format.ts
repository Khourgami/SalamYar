/**
 * Persian formatting helpers. Every number that reaches the screen goes through one of these so
 * the UI uses Persian digits (`toLocaleString('fa-IR')`) and the Jalali calendar.
 */

const FA_LOCALE = 'fa-IR'

/** Shown instead of a value that is missing or not a finite number. */
export const EMPTY_VALUE = '—'

function isFormattable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `۱۲` — integer with Persian digits and the Persian thousands separator (`٬`). */
export function faNumber(value: number | null | undefined): string {
  if (!isFormattable(value)) return EMPTY_VALUE
  return value.toLocaleString(FA_LOCALE)
}

/** `۳٫۵` — fixed number of decimals (default 1, used for KPI scores). */
export function faDecimal(value: number | null | undefined, fractionDigits = 1): string {
  if (!isFormattable(value)) return EMPTY_VALUE
  return value.toLocaleString(FA_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/** `۰٫۳۵` → `۳۵٪` — a 0..1 ratio rendered as a Persian percentage. */
export function faPercent(ratio: number | null | undefined, fractionDigits = 0): string {
  if (!isFormattable(ratio)) return EMPTY_VALUE
  return `${faDecimal(ratio * 100, fractionDigits)}٪`
}

/** A percentage that is already expressed on a 0..100 scale. */
export function faPercentValue(value: number | null | undefined, fractionDigits = 0): string {
  if (!isFormattable(value)) return EMPTY_VALUE
  return `${faDecimal(value, fractionDigits)}٪`
}

/** `۰٫۰۴۳۱` — cost with exactly four decimals (the unit is rendered separately). */
export function usd(value: number | null | undefined): string {
  if (!isFormattable(value)) return EMPTY_VALUE
  return faDecimal(value, 4)
}

export interface FaDateTimeOptions {
  /** Force a time zone (used by tests). Defaults to the viewer's local time zone. */
  timeZone?: string
  /** Date only, no time. */
  dateOnly?: boolean
}

/** Jalali short date, optionally with the time — e.g. `۱۴۰۵/۷/۷، ۱۱:۴۵`. */
export function faDateTime(
  iso: string | null | undefined,
  options: FaDateTimeOptions = {},
): string {
  if (!iso) return EMPTY_VALUE
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE
  const formatter = new Intl.DateTimeFormat(
    FA_LOCALE,
    options.dateOnly
      ? { dateStyle: 'short', timeZone: options.timeZone }
      : { dateStyle: 'short', timeStyle: 'short', timeZone: options.timeZone },
  )
  return formatter.format(date)
}

/** `۲۲ دقیقه و ۵ ثانیه` — a duration in seconds. */
export function faDuration(seconds: number | null | undefined): string {
  if (!isFormattable(seconds)) return EMPTY_VALUE
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${faNumber(total)} ثانیه`

  const minutes = Math.floor(total / 60)
  const restSeconds = total % 60
  if (minutes < 60) {
    return restSeconds === 0
      ? `${faNumber(minutes)} دقیقه`
      : `${faNumber(minutes)} دقیقه و ${faNumber(restSeconds)} ثانیه`
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0
    ? `${faNumber(hours)} ساعت`
    : `${faNumber(hours)} ساعت و ${faNumber(restMinutes)} دقیقه`
}

/** `۵٫۱ ثانیه` / `۸۴۰ میلی‌ثانیه` — a latency in milliseconds. */
export function faLatency(milliseconds: number | null | undefined): string {
  if (!isFormattable(milliseconds)) return EMPTY_VALUE
  if (Math.abs(milliseconds) < 1_000) return `${faNumber(Math.round(milliseconds))} میلی\u200cثانیه`
  return `${faDecimal(milliseconds / 1_000, 1)} ثانیه`
}

/** Truncate to `length` characters, appending an ellipsis. Used for the message preview. */
export function truncate(text: string | null | undefined, length = 40): string {
  if (!text) return ''
  const trimmed = text.trim()
  return trimmed.length > length ? `${trimmed.slice(0, length)}…` : trimmed
}
