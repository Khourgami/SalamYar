import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import { screen, within } from '@testing-library/react'

import { createSession, finishSession } from '@/api/endpoints'
import type { SessionDetail } from '@/api/types'
import { FIXTURE_SESSION_IDS } from '@/mocks/fixtures'
import { server } from '@/mocks/server'
import { fixtureDetail } from '@/test/sessionFixtures'
import { CONFIDENCE_LABELS } from '@/i18n/labels'
import {
  RESULT_CANT_MISS_TITLE,
  RESULT_DIFFERENTIAL_TITLE,
  RESULT_GUARD_FLAGS_TITLE,
  RESULT_MISSING_INFO_TITLE,
  RESULT_PEDIATRIC_NOTE,
  RESULT_SPECIALTY,
  RESULT_STATS_COST,
  RESULT_STATS_DURATION,
  RESULT_STATS_LATENCY,
  RESULT_STATS_QUESTIONS,
  RESULT_TITLE,
  safetyFloorText,
} from '@/i18n/uiText'
import { setupMockApi } from '@/test/msw'
import { renderApp, signInAs } from '@/test/renderApp'

setupMockApi()

describe('result card', () => {
  it('renders the full card of the completed structured fixture', async () => {
    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const card = await screen.findByTestId('result-card')

    expect(within(card).getByText(RESULT_TITLE)).toBeInTheDocument()
    expect(within(card).getByTestId('triage-badge')).toHaveTextContent('فوری — ظرف ۲۴ ساعت')
    expect(within(card).getByTestId('triage-badge')).toHaveAttribute('data-triage-level', 'URGENT_24H')
    expect(within(card).getByText('احتمال اورژانسی بودن')).toBeInTheDocument()
    expect(within(card).getByText('۱۴٪')).toBeInTheDocument()
    expect(within(card).getByText(RESULT_SPECIALTY)).toBeInTheDocument()
    expect(within(card).getByText('گوارش و کبد و/یا داخلی')).toBeInTheDocument()
    expect(within(card).getByText(CONFIDENCE_LABELS.medium)).toBeInTheDocument()

    expect(within(card).getByTestId('differential-table')).toBeInTheDocument()
    expect(within(card).getByText(RESULT_DIFFERENTIAL_TITLE)).toBeInTheDocument()
    expect(within(card).getByText('کوله\u200cسیستیت حاد (التهاب کیسه صفرا)')).toBeInTheDocument()
    expect(within(card).getByText('Acute cholecystitis')).toBeInTheDocument()
    expect(within(card).getByText('۳۵٪')).toBeInTheDocument()

    expect(within(card).getByText(RESULT_CANT_MISS_TITLE)).toBeInTheDocument()
    expect(within(card).getByTestId('cant-miss-table')).toBeInTheDocument()
    expect(within(card).getByText('رد شد')).toBeInTheDocument()
    expect(within(card).getByText('رد نشد')).toBeInTheDocument()
    expect(within(card).getByText('مشکوک')).toBeInTheDocument()

    expect(within(card).getByText(RESULT_MISSING_INFO_TITLE)).toBeInTheDocument()
    expect(within(card).getByText('نتیجه نوار قلب و آنزیم\u200cهای قلبی')).toBeInTheDocument()

    // clinical summary blocks
    expect(within(card).getByText('شکایت اصلی')).toBeInTheDocument()
    expect(within(card).getByText('درد شکم از دیروز')).toBeInTheDocument()
    expect(within(card).getByText('دلیل ارزیابی')).toBeInTheDocument()

    // guard flags and stats
    expect(within(card).getByText(RESULT_GUARD_FLAGS_TITLE)).toBeInTheDocument()
    expect(within(card).getByText('احتمالات نرمال\u200cسازی شد')).toBeInTheDocument()
    expect(within(card).getByText(RESULT_STATS_QUESTIONS)).toBeInTheDocument()
    expect(within(card).getByText(RESULT_STATS_DURATION)).toBeInTheDocument()
    expect(within(card).getByText(RESULT_STATS_LATENCY)).toBeInTheDocument()
    expect(within(card).getByText(RESULT_STATS_COST)).toBeInTheDocument()

    // no escalation and no pediatric note on this fixture
    expect(within(card).queryByTestId('safety-floor-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pediatric-note')).not.toBeInTheDocument()
    expect(card).toBeInTheDocument()
  })

  it('shows the safety-floor note when the guard escalated the triage level', async () => {
    signInAs('doctor')
    const session = await createSession({ agent_id: 'b-gpt54' })
    await finishSession(session.id)
    renderApp(`/sessions/${session.id}`)

    await screen.findByTestId('result-card')

    const note = screen.getByTestId('safety-floor-note')
    expect(note).toHaveTextContent(safetyFloorText('فوری — ظرف ۲۴ ساعت'))
    expect(screen.getByTestId('triage-badge')).toHaveTextContent('اورژانسی — همین حالا')
    expect(screen.getByTestId('triage-badge')).toHaveAttribute('data-triage-level', 'EMERGENCY_NOW')

    // b-gpt54 escalates without extra guard flags
    expect(screen.queryByText(RESULT_GUARD_FLAGS_TITLE)).not.toBeInTheDocument()
  })

  it('renders the pediatric note for an out-of-scope assessment', async () => {
    const structured = fixtureDetail(FIXTURE_SESSION_IDS.completedStructured)
    const result = structured.result
    if (!result) throw new Error('the structured fixture must have a result')
    const pediatric: SessionDetail = {
      ...structured,
      result: {
        ...result,
        assessment: { ...result.assessment, out_of_scope_pediatric: true },
      },
    }
    server.use(http.get('*/api/v1/sessions/:sessionId', () => HttpResponse.json(pediatric)))

    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    expect(await screen.findByTestId('pediatric-note')).toHaveTextContent(RESULT_PEDIATRIC_NOTE)
  })

  it('does not crash when the optional fields are missing', async () => {
    const minimal: SessionDetail = {
      ...fixtureDetail(FIXTURE_SESSION_IDS.completedStructured),
      questions_asked: 0,
      first_patient_message: null,
      final_triage_level: 'INSUFFICIENT_INFO',
      messages: [],
      result: {
        assessment: {
          triage_level: 'INSUFFICIENT_INFO',
          emergency_probability: 0,
          specialty_primary: 'general_practice',
          specialty_secondary: null,
          differential: [],
          cant_miss: [],
          missing_information: [],
          confidence: 'low',
          out_of_scope_pediatric: false,
          patient_message: '',
          clinical_summary: {
            chief_complaint: '',
            history_of_present_illness: '',
            relevant_history: '',
            medications: '',
            allergies: '',
            pertinent_negatives: '',
            assessment_rationale: '',
          },
        },
        guard: {
          raw_triage_level: 'INSUFFICIENT_INFO',
          final_triage_level: 'INSUFFICIENT_INFO',
          actions: [],
          flags: [],
        },
        stats: {
          questions_asked: 0,
          duration_seconds: 0,
          total_cost_usd: null,
          mean_turn_latency_ms: null,
        },
      },
      backstage: [{ message_id: 'ghost-message' }],
    }
    server.use(http.get('*/api/v1/sessions/:sessionId', () => HttpResponse.json(minimal)))

    signInAs('doctor')
    renderApp(`/sessions/${FIXTURE_SESSION_IDS.completedStructured}`)

    const card = await screen.findByTestId('result-card')
    expect(within(card).getByText('اطلاعات کافی نیست')).toBeInTheDocument()
    expect(screen.queryByTestId('differential-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cant-miss-table')).not.toBeInTheDocument()
    expect(screen.queryByText(RESULT_MISSING_INFO_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByText(RESULT_GUARD_FLAGS_TITLE)).not.toBeInTheDocument()

    // a backstage turn with no optional field at all still renders
    expect(screen.getByTestId('backstage-empty-turn')).toBeInTheDocument()
  })
})
