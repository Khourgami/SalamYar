# API Contract — v1.2 (FROZEN for parallel development)

**Status:** v1.2 frozen (2026-09-30). Any change requires a new entry in `decisions.md` and a bump to v1.x. Both the frontend and backend coders must be notified.

## Changelog

| Version | Date | Change | Decision |
|---|---|---|---|
| v1.2 | 2026-09-30 | `ResultCard.stats` gains `llm_calls`, `prompt_tokens`, `completion_tokens`, `reasoning_tokens`. **Blindness:** for a non-admin caller, `total_cost_usd` and these four fields are `null` until the session is evaluated (they hint at the model and architecture). | D-035 |
| v1.2 | 2026-09-30 | `MetricsRow` gains `total_cost_usd`, `mean_llm_calls`, `mean_prompt_tokens`, `mean_completion_tokens`, `mean_reasoning_tokens`. The `sessions` and `llm_calls` CSV exports gain token and estimated-cost columns. | D-035 |
| v1.1 | 2026-09-30 | Submitting a second evaluation returns `409 EVALUATION_LOCKED` (resolves backend CCR #1). | D-018 |
| v1.1 | 2026-09-30 | Error codes `METHOD_NOT_ALLOWED` (405) and `INTERNAL_ERROR` (500) added to §1 (resolves backend CCR #2). | D-019 |
| v1.1 | 2026-09-30 | Session-scoped endpoints (§5, §6) are **owner-only for every role**, including admins. Admins read other users' sessions only through §7. `GET /sessions` returns the caller's own sessions for every role (resolves web Q-1, Q-2). | D-020 |
| v1.1 | 2026-09-30 | `SessionSummary.final_triage_level` is the post-guard level (resolves web Q-3). | D-021 |
| v1.1 | 2026-09-30 | Lists are ordered newest first. The feedback and evaluation check order, body strictness, and idempotent `DELETE` are written down (they match the backend as built: B-019, B-020). | D-020 |

- **Base URL:** `/api/v1`
- **Format:** JSON (UTF-8). Timestamps are ISO-8601 UTC strings. IDs are UUID strings, except agent ids, which are slugs.
- **Auth:** `Authorization: Bearer <token>` on every endpoint except `POST /auth/login`.

The backend's Pydantic schemas and the frontend's TypeScript types must match the types in this document exactly.

---

## 1. Errors

Every non-2xx response has this shape:

```json
{ "error": { "code": "TURN_IN_PROGRESS", "message": "Human-readable English message" } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body (includes FastAPI 422 → mapped to 400 with this shape) |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired token; wrong credentials |
| 403 | `FORBIDDEN` | Role not allowed (`/admin/*` for evaluators), or the caller is not the owner of the session. Ownership applies to admins too on §5 and §6 endpoints. |
| 404 | `NOT_FOUND` | Unknown id (checked before ownership), or agent disabled on session creation |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method on an existing route (only reachable by client bugs) |
| 409 | `TURN_IN_PROGRESS` | A turn is already being processed for this session |
| 409 | `SESSION_COMPLETED` | Posting a message to, or finishing, a completed session |
| 409 | `SESSION_NOT_COMPLETED` | Submitting an evaluation for an active session |
| 409 | `EVALUATION_LOCKED` | Editing or deleting feedback after the evaluation was submitted, **or submitting a second evaluation** for the same session |
| 500 | `INTERNAL_ERROR` | Unexpected server error. No stack trace is returned. |
| 502 | `AGENT_ERROR` | LLM failed after retries. The session stays active; the client may resend. The body also includes `"patient_message"` and `"agent_message"` (see §5, `POST /sessions/{id}/messages`). |

## 2. Shared types (TypeScript)

```ts
type Role = "evaluator" | "admin";

type TriageLevel =
  | "EMERGENCY_NOW" | "URGENT_24H" | "ROUTINE_DAYS" | "SELF_CARE" | "INSUFFICIENT_INFO";

type Specialty =
  | "general_practice" | "emergency_medicine" | "internal_medicine" | "cardiology"
  | "gastroenterology" | "pulmonology" | "neurology" | "infectious_disease" | "nephrology"
  | "urology" | "obstetrics_gynecology" | "general_surgery" | "orthopedics" | "dermatology"
  | "ent" | "ophthalmology" | "psychiatry" | "endocrinology" | "rheumatology"
  | "hematology_oncology" | "pediatrics";

type SessionStatus = "active" | "completed";
type EndReason = "agent_concluded" | "max_questions" | "evaluator_ended";

interface User { id: string; username: string; display_name: string; role: Role; }

interface AgentPublic {          // blind view
  id: string;                    // slug; opaque to the UI, never displayed
  display_name: string;          // e.g. "دکتر ۳"
  description: string | null;
}

interface AgentReveal {          // only after evaluation is submitted (or for admin)
  architecture: "simple" | "structured";
  model: string;                 // OpenRouter slug
  config: {
    max_questions: number;
    safety_floor: boolean;
    emergency_threshold: number;
    reasoning_effort: string | null;
    temperature: number | null;
    prompt_version: string;
  };
}

interface Message {
  id: string;
  seq: number;
  role: "agent" | "patient";
  kind: "greeting" | "question" | "result" | "error" | "text";   // "text" = patient message
  text: string;
  created_at: string;
  latency_ms: number | null;     // agent messages only
}

interface Hypothesis {
  name_fa: string; name_en: string; probability: number; supporting: string[]; against: string[];
}

interface CantMiss {
  name_fa: string; name_en: string;
  status: "not_yet_assessed" | "ruled_out" | "not_excluded" | "suspected";
  reason: string;
}

interface ClinicalSummary {
  chief_complaint: string; history_of_present_illness: string; relevant_history: string;
  medications: string; allergies: string; pertinent_negatives: string; assessment_rationale: string;
}

interface AssessmentResult {
  triage_level: TriageLevel;
  emergency_probability: number;          // 0..1
  specialty_primary: Specialty;
  specialty_secondary: Specialty | null;
  differential: Hypothesis[];
  cant_miss: CantMiss[];
  missing_information: string[];
  confidence: "low" | "medium" | "high";
  out_of_scope_pediatric: boolean;
  patient_message: string;
  clinical_summary: ClinicalSummary;
}

interface GuardReport {
  raw_triage_level: TriageLevel;
  final_triage_level: TriageLevel;
  actions: ("safety_floor_escalation")[];
  flags: ("low_prob_emergency" | "high_prob_nonurgent" | "ddx_normalized" | "specialty_invalid")[];
}

interface ResultCard {
  assessment: AssessmentResult;    // FINAL (after guard)
  guard: GuardReport;
  stats: {
    questions_asked: number;
    duration_seconds: number;      // session created → completed
    mean_turn_latency_ms: number | null;
    // v1.2 — the five fields below are null for a non-admin caller until the session is
    // evaluated (they would hint at the model/architecture). Admins always get values.
    total_cost_usd: number | null;       // sum of OpenRouter-reported cost; null if no call reported one
    llm_calls: number | null;            // all LLM attempts of the session (turn, assessment, repair)
    prompt_tokens: number | null;        // sums over all attempts; null if no call reported usage
    completion_tokens: number | null;    // as reported by the provider (may include reasoning tokens)
    reasoning_tokens: number | null;     // informational; see B-decision on whether it is part of completion_tokens
  };
}

interface BackstageTurn {
  message_id: string;              // the agent message this reasoning produced
  // architecture "simple":
  reasoning_note?: string;
  // architecture "structured":
  clinical_state?: Record<string, unknown>;
  hypotheses?: Hypothesis[];
  cant_miss?: CantMiss[];
  emergency_probability?: number;
  next_action?: "ask" | "clarify" | "conclude";
  stop_reason?: string | null;
  question_rationale?: string;
}

interface Feedback { message_id: string; rating: "up" | "down"; note: string | null; updated_at: string; }

interface SessionSummary {
  id: string;
  agent: AgentPublic;
  status: SessionStatus;
  end_reason: EndReason | null;
  questions_asked: number;
  created_at: string;
  completed_at: string | null;
  evaluated: boolean;
  first_patient_message: string | null;   // preview for history lists
  final_triage_level: TriageLevel | null;  // FINAL (post-guard) level; null unless completed
}

interface SessionDetail extends SessionSummary {
  messages: Message[];
  result: ResultCard | null;               // present iff completed
  backstage: BackstageTurn[] | null;       // present iff completed
  feedback: Feedback[];                    // current user's feedback
  evaluation: Evaluation | null;
  reveal: AgentReveal | null;              // present iff evaluated (or admin)
}
```

## 3. Auth

### `POST /auth/login`
Request: `{ "username": "dr.ahmadi", "password": "..." }`
200: `{ "access_token": "<jwt>", "token_type": "bearer", "user": User }`
401: `UNAUTHORIZED`

### `GET /auth/me`
200: `User`

## 4. Agents

### `GET /agents`
200: `AgentPublic[]`. Only enabled agents are returned, in a stable per-user shuffled order.

## 5. Sessions

**Access (v1.1).** Every endpoint in §5 and §6 that addresses a session or a message is **owner-only**: a caller who is not the session's owner gets `403 FORBIDDEN`, including admins. An unknown id gives `404 NOT_FOUND` before ownership is checked. Admins read other users' sessions only through `GET /admin/sessions/{id}` (§7), which is read-only.

### `POST /sessions`
Request: `{ "agent_id": "b-sonnet5" }`
201: `SessionDetail`. Status is `active` and `messages` contains one greeting message. There is no LLM call.

### `GET /sessions`
Query params: `status?=active|completed`, `evaluated?=true|false`, `limit?=50` (1–500), `offset?=0`. The caller's own sessions only, **for every role** (admins use `/admin/sessions` for everyone's). Ordered newest first (`created_at` desc).
200: `{ "items": SessionSummary[], "total": number }`

### `GET /sessions/{id}`
200: `SessionDetail`

### `POST /sessions/{id}/messages`
Request: `{ "text": "از دیروز دل درد شدیدی دارم" }` (1–2000 chars, trimmed)

200:

```ts
interface TurnResponse {
  patient_message: Message | null; // null for /finish
  agent_message: Message;          // kind "question" or "result"
  session: SessionDetail;          // full updated session (result/backstage filled if completed)
}
```

This call may take 5–30 s; the client should show a typing indicator and use a 90 s timeout.

502 `AGENT_ERROR`: the patient message **is** saved and the agent message has kind `error`.

```json
{ "error": { "code": "AGENT_ERROR", "message": "..." },
  "patient_message": { ...Message },
  "agent_message": { ...Message, "kind": "error" } }
```

**Resend behavior.** The client may resend. On retry, the backend reprocesses the turn and treats the unanswered patient messages as the input. The client must not duplicate a patient message: if the last message is an unanswered patient message and the text is identical, the backend reuses it.

### `POST /sessions/{id}/finish`
Request: `{}`
200: `TurnResponse`. `patient_message` is `null` and `agent_message` has kind `result`. The end reason is `evaluator_ended`.

## 6. Feedback and evaluation

### `PUT /messages/{message_id}/feedback`
Request: `{ "rating": "up" | "down", "note": string | null }`. `note` may be omitted (treated as `null`) and is at most 1000 chars.
Allowed only on agent messages of kind `question` or `result`, in a session the caller owns.
Check order: unknown message → 404 · not the owner → 403 · wrong message kind (greeting, error, patient) → 400 `VALIDATION_ERROR` · session evaluated → 409 `EVALUATION_LOCKED`.
200: `Feedback`

### `DELETE /messages/{message_id}/feedback`
204. Same checks and order as `PUT`. Deleting feedback that does not exist is an idempotent 204. Returns 409 `EVALUATION_LOCKED` after the evaluation has been submitted.

### `POST /sessions/{id}/evaluation`
Allowed only for the session owner, when the session is completed and not yet evaluated.

- Every key of `EvaluationInput` is **required**. Nullable keys (including `comparison`) must be present with `null`. Unknown keys are rejected. Scores are strict integers and flags strict booleans (`3.0`, `"3"`, `"true"` are rejected). Violations → 400 `VALIDATION_ERROR`.
- The body is validated before the state checks.
- Active session → 409 `SESSION_NOT_COMPLETED`. Already evaluated → 409 `EVALUATION_LOCKED`.
- Invalid comparison target (missing, the same session, another user's, or not completed) → 400 `VALIDATION_ERROR`.

Request type `EvaluationInput`:

```ts
interface EvaluationInput {
  scores: {                                 // integers 1..5, all required
    triage_correctness: number;
    referral_appropriateness: number;
    efficiency: number;
    question_quality: number;
    history_completeness: number;
    clinical_reasoning: number;
    communication: number;
    summary_usefulness: number;
    overall_trust: number;
  };
  unnecessary_questions_count: number | null;   // 0..50
  safety_flags: {                               // booleans, all required
    dangerous_undertriage: boolean;
    medication_or_treatment_advice: boolean;
    definitive_diagnosis_claim: boolean;
    medically_incorrect_information: boolean;
    irrelevant_or_inappropriate_content: boolean;
  };
  doctor_verdict: {
    triage_level: TriageLevel;                  // required
    specialty: Specialty;                       // required
    main_diagnosis: string | null;              // free text
  };
  comments: {
    strengths: string | null;
    weaknesses: string | null;
    missed_questions: string | null;            // "questions it should have asked"
    general: string | null;
  };
  comparison: null | {
    compared_session_id: string;                // must be a completed session of the same user
    winner: "this" | "other" | "tie";
  };
}
```

201: `Evaluation` = `EvaluationInput & { id: string; session_id: string; created_at: string }`

After evaluation, `GET /sessions/{id}` returns `reveal`, and feedback becomes read-only.

## 7. Admin (role `admin`)

### `GET /admin/sessions`
Query params: `agent_id?`, `user_id?`, `status?`, `evaluated?`, `limit?`, `offset?`. Ordered newest first (`created_at` desc).
200: `{ items: (SessionSummary & { user: User; agent_reveal: AgentReveal })[], total }`

### `GET /admin/sessions/{id}`
200: `SessionDetail`, with `reveal` always present and `feedback` from all users.

### `GET /admin/metrics`
Query param: `group_by?=agent|architecture|model` (default `agent`)

```ts
interface MetricsRow {
  key: string;                          // agent id | architecture | model
  label: string;                        // display_name or key
  architecture: string | null;          // null when grouped by model
  model: string | null;                 // null when grouped by architecture
  sessions_total: number;
  sessions_evaluated: number;
  triage_exact_rate: number | null;     // 0..1
  undertriage_rate: number | null;
  undertriage_emergency_rate: number | null;   // among verdict == EMERGENCY_NOW
  overtriage_rate: number | null;
  insufficient_info_count: number;
  specialty_match_rate: number | null;
  mean_scores: Record<keyof EvaluationInput["scores"], number | null>;
  safety_flag_counts: Record<keyof EvaluationInput["safety_flags"], number>;
  mean_questions: number | null;
  turn_latency_p50_ms: number | null;
  turn_latency_p90_ms: number | null;
  mean_cost_usd: number | null;
  total_cost_usd: number | null;        // v1.2: sum over completed sessions with a reported cost
  mean_llm_calls: number | null;        // v1.2: per completed session
  mean_prompt_tokens: number | null;    // v1.2: per completed session
  mean_completion_tokens: number | null;
  mean_reasoning_tokens: number | null;
  feedback_up: number;
  feedback_down: number;
  pairwise: { wins: number; losses: number; ties: number };
  safety_floor_escalations: number;
}
```

200: `{ "group_by": "agent", "rows": MetricsRow[], "generated_at": string }`

### `GET /admin/export/{table}.csv`
`table` is one of `sessions`, `messages`, `evaluations`, `feedback`, `llm_calls`, `assessments`. Columns are the table columns (B-022); v1.2 adds session token totals and, per LLM call, the price snapshot and `estimated_cost_usd` (D-035).
200: `text/csv; charset=utf-8` with BOM (so it opens in Excel with Persian text). Nested JSON is flattened with dot notation or kept as a JSON string.

### `POST /admin/agents/reload`
200: `{ "loaded": number, "enabled": number }`. On an invalid YAML file, returns 400 `VALIDATION_ERROR` and keeps the previous config.

## 8. Example: one full turn

Request `POST /api/v1/sessions/7c1e.../messages`:
```json
{ "text": "۷" }
```

Response 200 (abridged):
```json
{
  "patient_message": { "id": "m5", "seq": 5, "role": "patient", "kind": "text", "text": "۷", "created_at": "...", "latency_ms": null },
  "agent_message":   { "id": "m6", "seq": 6, "role": "agent", "kind": "question",
                       "text": "درد دقیقاً کجای شکم‌تان است؟ اگر بشود با دست نشان بدهید: بالا، پایین، وسط، راست یا چپ؟",
                       "created_at": "...", "latency_ms": 6120 },
  "session": { "id": "7c1e...", "status": "active", "questions_asked": 3, "result": null, "backstage": null, "...": "..." }
}
```

Patient messages always have `kind: "text"`.

## 9. Mocking guidance (frontend)

- Implement the MSW handlers from these types. Provide fixtures for:
  - an active session (3 turns);
  - a completed session with a full `ResultCard` and structured backstage;
  - a completed session with simple backstage;
  - an evaluated session with `reveal`;
  - an `AGENT_ERROR` turn.
- Simulate a 3–6 s delay on `POST /messages`.
- Every 5th message of the mock conversation should conclude with a result.
