import { describe, expect, it } from 'vitest'

import {
  EMPTY_VALUE,
  faDateTime,
  faDecimal,
  faDuration,
  faLatency,
  faNumber,
  faTime,
  faPercent,
  faPercentValue,
  truncate,
  usd,
} from '@/lib/format'

const PERSIAN_DIGITS = /[\u06F0-\u06F9]/

describe('faNumber', () => {
  it('renders integers with Persian digits', () => {
    expect(faNumber(0)).toBe('۰')
    expect(faNumber(12)).toBe('۱۲')
    expect(faNumber(115)).toBe('۱۱۵')
    expect(faNumber(1234)).toBe('۱٬۲۳۴')
    expect(faNumber(1234)).toMatch(PERSIAN_DIGITS)
    expect(faNumber(1234)).not.toMatch(/\d/)
  })

  it('fails soft for missing values', () => {
    expect(faNumber(null)).toBe(EMPTY_VALUE)
    expect(faNumber(undefined)).toBe(EMPTY_VALUE)
    expect(faNumber(Number.NaN)).toBe(EMPTY_VALUE)
    expect(faNumber(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE)
  })
})

describe('faDecimal', () => {
  it('always shows the requested number of decimals (default 1)', () => {
    expect(faDecimal(3.5)).toBe('۳٫۵')
    expect(faDecimal(3.5)).not.toMatch(/\d/)
    expect(faDecimal(4)).toBe('۴٫۰')
    expect(faDecimal(4.25, 2)).toBe('۴٫۲۵')
    expect(faDecimal(4.2, 0)).toBe('۴')
  })

  it('fails soft for missing values', () => {
    expect(faDecimal(null)).toBe(EMPTY_VALUE)
  })
})

describe('faPercent', () => {
  it('turns a 0..1 ratio into a Persian percentage', () => {
    expect(faPercent(0.35)).toBe('۳۵٪')
    expect(faPercent(0)).toBe('۰٪')
    expect(faPercent(1)).toBe('۱۰۰٪')
    expect(faPercent(0.355, 1)).toBe('۳۵٫۵٪')
    expect(faPercent(0.042)).toBe('۴٪')
    expect(faPercent(0.35)).not.toMatch(/\d/)
  })

  it('fails soft for missing values', () => {
    expect(faPercent(null)).toBe(EMPTY_VALUE)
  })
})

describe('faPercentValue', () => {
  it('formats a value that is already on a 0..100 scale', () => {
    expect(faPercentValue(35)).toBe('۳۵٪')
    expect(faPercentValue(35, 1)).toBe('۳۵٫۰٪')
    expect(faPercentValue(null)).toBe(EMPTY_VALUE)
  })
})

describe('usd', () => {
  it('always shows four decimals', () => {
    expect(usd(0.0431)).toBe('۰٫۰۴۳۱')
    expect(usd(0.0431)).not.toMatch(/\d/)
    expect(usd(1)).toBe('۱٫۰۰۰۰')
    expect(usd(0)).toBe('۰٫۰۰۰۰')
    expect(usd(null)).toBe(EMPTY_VALUE)
  })
})

describe('faDateTime', () => {
  it('renders a Jalali short date and time', () => {
    const formatted = faDateTime('2026-09-29T08:15:00.000Z', { timeZone: 'Asia/Tehran' })

    expect(formatted).toContain('۱۴۰۵/۷/۷')
    expect(formatted).toContain('۱۱:۴۵')
    expect(formatted).not.toMatch(/\d/)
  })

  it('can render the date only', () => {
    expect(faDateTime('2026-09-29T08:15:00.000Z', { timeZone: 'Asia/Tehran', dateOnly: true })).toBe(
      '۱۴۰۵/۷/۷',
    )
  })

  it('fails soft for missing or invalid values', () => {
    expect(faDateTime(null)).toBe(EMPTY_VALUE)
    expect(faDateTime(undefined)).toBe(EMPTY_VALUE)
    expect(faDateTime('not-a-date')).toBe(EMPTY_VALUE)
  })
})

describe('faTime', () => {
  it('renders the time only with Persian digits', () => {
    expect(faTime('2026-09-29T07:30:00.000Z', { timeZone: 'UTC' })).toBe('۷:۳۰')
    expect(faTime(null)).toBe(EMPTY_VALUE)
    expect(faTime('not-a-date')).toBe(EMPTY_VALUE)
  })
})

describe('faDuration', () => {
  it('renders seconds, minutes and hours', () => {
    expect(faDuration(0)).toBe('۰ ثانیه')
    expect(faDuration(45)).toBe('۴۵ ثانیه')
    expect(faDuration(60)).toBe('۱ دقیقه')
    expect(faDuration(1234)).toBe('۲۰ دقیقه و ۳۴ ثانیه')
    expect(faDuration(3600)).toBe('۱ ساعت')
    expect(faDuration(3900)).toBe('۱ ساعت و ۵ دقیقه')
    expect(faDuration(null)).toBe(EMPTY_VALUE)
  })
})

describe('faLatency', () => {
  it('renders milliseconds below one second and seconds above', () => {
    expect(faLatency(840)).toBe('۸۴۰ میلی\u200cثانیه')
    expect(faLatency(999)).toBe('۹۹۹ میلی\u200cثانیه')
    expect(faLatency(1000)).toBe('۱٫۰ ثانیه')
    expect(faLatency(5100)).toBe('۵٫۱ ثانیه')
    expect(faLatency(null)).toBe(EMPTY_VALUE)
  })
})

describe('truncate', () => {
  it('cuts to the requested length and adds an ellipsis', () => {
    expect(truncate('سلام', 40)).toBe('سلام')
    expect(truncate('  سلام  ', 40)).toBe('سلام')

    const long = 'د'.repeat(50)
    const result = truncate(long, 40)
    expect(result).toHaveLength(41)
    expect(result.endsWith('…')).toBe(true)

    expect(truncate(null)).toBe('')
    expect(truncate(undefined)).toBe('')
  })
})
