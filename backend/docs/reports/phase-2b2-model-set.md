# Backend Phase 2b-2 — Final Model Set, Turn Deadline, M3 Gate

**Date:** 2026-09-30 · **Status:** complete · **Spent:** USD 0.89 of the USD 3 budget (OpenRouter `GET /key` usage 0.8702 → 1.7616; smoke runs 0.43 + 0.40, compose run ≈ 0.08).

## 1. Summary

- **Model set (D-034, D-036):** all seven slugs exist exactly on OpenRouter `/models`. `agents.yaml` now has 14 agents: the Sonnet and GPT-Mini agents were renamed in place, DeepSeek moved to `deepseek-v4-pro-0813` with `minimal` / 8000, and `b-/a-gptoss120b` are new (B-037).
- **Deadlines (D-038):** there is an 80 s budget per turn and a 50 s total deadline per call (`min(50 s, remaining)`). A retry, a repair or B's assessment call starts only if ≥ 15 s remain. On expiry the turn returns a 502 `AGENT_ERROR`, the lock is released, and the attempt is traced as `deadline_exceeded` (B-038). The deadline fired in the real runs and cut two calls at 50.0 s. **The backend now always answers before the web client's 90 s timeout:** the slowest turn in the final runs took 50.0 s, down from 106.8 s in phase 2b.
- **Smoke runs (final pair, all 14 agents):** run 1 12/14, run 2 11/14. No provider rejected any parameter, so there is **no D-025 config change and no greeting fallback** (B-039).
- **D-036 gate:** **`b-gptoss120b` is disabled.** Its forced conclusion hit the 50 s deadline in both runs (B-040). All other enabled agents pass.
- **Enabled agents after the gate: 8.** They are `b-gemini3flash`, `a-sonnet55`, `b-gpt54`, `b-deepseekv4pro`, `a-gpt54`, `b-sonnet55`, `b-gpt54mini` and `b-gemini31pro`.
- **D-037 targets:** 6 of the 8 enabled agents meet them. `b-deepseekv4pro` misses p50 (29.6 s) and p90 (45.3 s vs 45 s). `a-gpt54` misses p90 by 0.6 s (25.6 s). Nothing was tuned.
- **Compose + nginx:** real turns with `b-sonnet55` and the substitute `b-gpt54mini` passed, including `finish` → `ResultCard`. The gated `b-gptoss120b` is not listed and returns 404. The database was left as it was.

| Check | Result |
|---|---|
| `uv run pytest -q` | **322 passed** (baseline 306; +16) |
| Guard `--cov=app.agents.guard --cov-branch --cov-fail-under=100` | 100% (19 tests) |
| `ruff check` / `ruff format --check` | clean |

| Task | Result | Commit |
|---|---|---|
| T1 | Final model set, slugs verified (B-037) | `638d0bb` |
| T2 | Turn/call deadlines (B-038) | `7552856` |
| T3 | Two real runs, no config change (B-039) | `cc5a6e6` |
| T4 | Gate: `b-gptoss120b` disabled; targets table; compose run (B-040, B-041) | `cc5a6e6` + this commit |
| T5 | This report, README, progress, decisions | this commit |

## 2. Model-set change (T1)

`GET https://openrouter.ai/api/v1/models` returned 464 models on 2026-09-30, and all seven D-034 slugs are present exactly.

| Agent (old → new id) | Display name | Old model | New model | Config change | Enabled |
|---|---|---|---|---|---|
| `b-sonnet5` → **`b-sonnet55`** | «دکتر ۶» | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5.5` | — | ✓ |
| `a-sonnet5` → **`a-sonnet55`** | «دکتر ۲» | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5.5` | — | ✓ |
| `b-gpt5mini` → **`b-gpt54mini`** | «دکتر ۷» | `openai/gpt-5-mini` | `openai/gpt-5.4-mini` | — | ✓ |
| `a-gpt5mini` → **`a-gpt54mini`** | «دکتر ۱۱» | `openai/gpt-5-mini` | `openai/gpt-5.4-mini` | — | ✗ |
| `b-deepseekv4pro` | «دکتر ۴» | `deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-pro-0813` | `reasoning_effort: minimal`, `max_tokens: 8000` (D-036) | ✓ |
| `a-deepseekv4pro` | «دکتر ۱۰» | `deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-pro-0813` | same | ✗ |
| **`b-gptoss120b`** (new) | «دکتر ۱۳» | — | `openai/gpt-oss-120b` | defaults | ✓ → **✗ (D-036 gate)** |
| **`a-gptoss120b`** (new) | «دکتر ۱۴» | — | `openai/gpt-oss-120b` | defaults | ✗ |

Other agents (`b-/a-gpt54`, `b-/a-gemini31pro`, `b-/a-gemini3flash`) are unchanged. Retired ids are no longer in the file, so `sync_to_db` keeps their rows but disables them (B-014; covered by a new test). Every changed YAML line carries `# D-034` / `# D-036`.

## 3. Deadline implementation (T2, D-038, B-038)

| Piece | Behavior |
|---|---|
| `app/llm/budget.py` | `TurnBudget(turn_seconds=80, call_seconds=50, min_follow_up_seconds=15, clock)` provides `remaining()`, `call_timeout() = min(call, remaining)`, `can_follow_up()` and `require_follow_up(what)`. `DeadlineExceeded` subclasses `LLMError`, so the existing 502 path, lock release in `finally`, and resend rule apply unchanged. |
| Settings | `LLM_CALL_DEADLINE_SECONDS=50` and `TURN_DEADLINE_SECONDS=80` were added to `.env.example` and the README. `LLM_TIMEOUT_SECONDS` stays the httpx per-read timeout. `backend/.env` is untouched, so the defaults apply. |
| Session service | A fresh budget is created per `process_turn` (each `next_turn` or `force_conclude`) and set on `SessionContext.budget`. When the cap forces a conclusion, `next_turn` and `force_conclude` share that budget. |
| `json_runner` | Each call runs inside `asyncio.timeout(min(50, remaining))` around `llm.complete(req, budget)`, covering the whole request, the body, and the client's own retry. On expiry it traces `error="deadline_exceeded"` with the attempt's wall time. The repair runs only if ≥ 15 s remain. |
| `OpenRouterClient` | Skips its transport retry when < 15 s of the turn remain. |
| Architecture B | After the turn call it saves the new clinical state, then requires ≥ 15 s before the assessment call. Otherwise it raises a 502 and the state stays saved (B-011). |
| Smoke test | Uses the same settings and a fresh budget per scripted step. It adds a `reason` column (`deadline`, `invalid_output`, `transport`, `model_missing`) and a `failure_reason` key in the JSON. |
| Trace | Failed attempts without a response now store their wall time in `llm_calls.latency_ms` (previously null). |

**Tests** (`tests/test_deadline.py`, 15 tests; real waits ≤ 0.3 s, or a fake clock):

- budget arithmetic (the 15 s boundary, spent budget);
- a slow single call cut at the call deadline, with a `deadline_exceeded` trace and its latency;
- the call deadline capped by the remaining turn budget;
- no call starting when the budget is spent;
- repair skipped at 14 s left and run at 15 s left;
- **a stream that sends one byte every 20 ms (the per-read timeout never fires) cut by the total deadline**;
- OpenRouter transport retry skipped (< 15 s) and run (enough budget);
- B skipping the assessment call while the clinical state is saved;
- API: slow call → 502 `AGENT_ERROR`, one `deadline_exceeded` row, `turn_in_progress = false`, then **a resend succeeds** and reuses the patient message;
- API B: short budget → 502, one turn call, clinical state persisted;
- smoke: `deadline` reason and a fresh budget per step.

## 4. Smoke results (T3)

The config was identical in both runs: `json_object`, temperature 0.3 sent, `reasoning_effort: low` (DeepSeek: `minimal`, 8000 tokens), with the D-038 deadlines. Columns are as in phase 2b. Run 2 is the final run for latencies and cost. **Reason** is the failure reason in any run.

| Agent | Model | Enabled | Run 1 | Run 2 | Reason | Repairs (r1 / r2) | Turn s (run 2: t1 · t2 · finish) | Cost r1 / r2 (USD) |
|---|---|---|---|---|---|---|---|---|
| b-gemini3flash | google/gemini-3-flash-preview | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 6.8 · 8.2 · 7.0 | 0.0133 / 0.0134 |
| a-sonnet55 | anthropic/claude-sonnet-5.5 | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 4.0 · 4.7 · 19.4 | 0.0479 / 0.0463 |
| b-gpt54 | openai/gpt-5.4 | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 16.2 · 18.8 · 27.5 | 0.0689 / 0.0598 |
| b-deepseekv4pro | deepseek/deepseek-v4-pro-0813 | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 29.6 · 45.3 · 36.6 | 0.0400 / 0.0381 |
| a-gpt54 | openai/gpt-5.4 | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 3.9 · 4.2 · 21.4 | 0.0352 / 0.0304 |
| b-sonnet55 | anthropic/claude-sonnet-5.5 | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 7.3 · 8.9 · 13.3 | 0.0650 / 0.0631 |
| b-gpt54mini | openai/gpt-5.4-mini | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 7.3 · 9.1 · 11.7 | 0.0198 / 0.0192 |
| b-gemini31pro | google/gemini-3.1-pro-preview | ✓ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 8.6 · 11.5 · 8.6 | 0.0539 / 0.0562 |
| **b-gptoss120b** | openai/gpt-oss-120b | ✓ → ✗ | yy**n** ❌ | yy**n** ❌ | **deadline** ×2 | 0/3 · 1/4 | 29.1 · 8.1 · 50.0 (cut) | 0.0006 / 0.0009 |
| a-gemini3flash | google/gemini-3-flash-preview | ✗ | yy**n** ❌ | yy**n** ❌ | invalid_output ×2 | 0/3 · 0/3 | 3.0 · 3.8 · 2.9 | 0.0052 / 0.0051 |
| a-deepseekv4pro | deepseek/deepseek-v4-pro-0813 | ✗ | yyy ✅ | yy**n** ❌ | invalid_output | 0/3 · 1/4 | 7.8 · 3.4 · 3.0 | 0.0107 / 0.0073 |
| a-gpt54mini | openai/gpt-5.4-mini | ✗ | yyy ✅ | yyy ✅ | — | 1/4 · 0/3 | 3.6 · 4.7 · 9.4 | 0.0177 / 0.0090 |
| a-gemini31pro | google/gemini-3.1-pro-preview | ✗ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 7.9 · 4.6 · 13.2 | 0.0498 / 0.0485 |
| a-gptoss120b | openai/gpt-oss-120b | ✗ | yyy ✅ | yyy ✅ | — | 0/3 · 0/3 | 3.8 · 3.7 · 33.1 | 0.0006 / 0.0004 |

- **Run totals:** run 1 12/14 passed, USD 0.4286; run 2 11/14, USD 0.3976. All 14 slugs were found.
- As in phase 2b, no agent concluded by itself within two scripted turns, so every result came from the forced conclusion.
- **Raw data:** `data/smoke-2b2-run{1,2}.json` and `.txt`, plus the analysis in `data/t4-2b2-analysis.txt` (all git-ignored).

**Failures (trace excerpts):**

```text
b-gptoss120b  run 1 conclude assessment#1  50019 ms  error=deadline_exceeded  (no response)
              DeadlineExceeded: deadline_exceeded: assessment attempt 1 cut after 50019 ms (call deadline 50.0 s)
              turn1 took 40.1 s for 825 completion tokens (10 reasoning)
b-gptoss120b  run 2 turn1 turn#1 6211 ms  parsed but invalid: 6 validation errors for TurnDecision
              (cant_miss, emergency_probability, … Field required) → repair succeeded (turn1 total 29.1 s)
              conclude assessment#1  50022 ms  error=deadline_exceeded  (no response)
a-gemini3flash  runs 1+2 conclude: AgentOutputError: model returned action 'ask' after being told to conclude
a-deepseekv4pro run 2   conclude: AgentOutputError: model returned action 'ask' after being told to conclude
                        (turn1 needed a repair: "1 validation error for SimpleTurn / assessment Field required")
a-gpt54mini     run 1   conclude attempt 1 returned a bare AssessmentResult without the SimpleTurn wrapper
                        ("4 validation errors for SimpleTurn / action Field required …") → repair succeeded
```

`gpt-oss-120b` is fast when it answers (A turns 3–4 s). However, its latency in structured mode varies widely: 6–40 s for a turn call of 200–1,100 tokens, and no answer to the assessment call within 50 s in two of two runs. With `data_collection: deny`, OpenRouter routes this open-weight model to whichever eligible provider is available. The trace does not show which provider served (or failed to serve) the call.

## 5. Config changes with evidence (T3)

**None under D-025** (B-039).
- No provider returned an HTTP error for `temperature`, `response_format: json_object`, `reasoning.effort: low`, or `reasoning.effort: minimal` (DeepSeek 0813).
- Every model had a provider under `data_collection: deny`.
- All seven architecture-A agents handled the conversation that starts with the `assistant` greeting: each asked a relevant first question. There is therefore no greeting fallback.

The remaining failures fall in the rows "anything else → no fix" (deadline, forced-conclude ignored). No fix was applied, so runs 1 and 2 are the final pair and no third run was spent.

The only `agents.yaml` change after T1 is the **D-036 gate** (§6).

## 6. D-036 gate and D-037 targets (T4)

**Gate** (enabled agents; fail if either final run fails the conclusion, or any turn exceeds 75 s):

| Agent | Conclusion r1 / r2 | Max turn | Gate |
|---|---|---|---|
| b-gemini3flash, a-sonnet55, b-gpt54, a-gpt54, b-sonnet55, b-gpt54mini, b-gemini31pro | ✅ / ✅ | ≤ 28.9 s | pass |
| b-deepseekv4pro | ✅ / ✅ | 45.3 s | pass (D-036 config fixed the phase-2b failures: 0 repairs, max 45 s, down from 106.8 s) |
| **b-gptoss120b** | ❌ / ❌ (deadline) | 50.0 s | **`enabled: false  # D-036 gate: …` (B-040)** |

**Targets** (D-037; per agent, nearest-rank over the question and finish turns of both final runs, n = 6 turns each; a cut turn counts at 50.0 s):

| Agent | Arch | Enabled | p50 | p90 | max | Target p50 / p90 | p50 | p90 | ≤ 75 s |
|---|---|---|---|---|---|---|---|---|---|
| b-gemini3flash | B | ✓ | 7.0 | 8.2 | 8.2 | 20 / 45 | ✅ | ✅ | ✅ |
| b-gpt54 | B | ✓ | 18.8 | 28.9 | 28.9 | 20 / 45 | ✅ | ✅ | ✅ |
| b-deepseekv4pro | B | ✓ | **29.6** | **45.3** | 45.3 | 20 / 45 | ❌ | ❌ | ✅ |
| b-sonnet55 | B | ✓ | 8.9 | 13.8 | 13.8 | 20 / 45 | ✅ | ✅ | ✅ |
| b-gpt54mini | B | ✓ | 7.3 | 24.7 | 24.7 | 20 / 45 | ✅ | ✅ | ✅ |
| b-gemini31pro | B | ✓ | 8.7 | 11.5 | 11.5 | 20 / 45 | ✅ | ✅ | ✅ |
| a-sonnet55 | A | ✓ | 5.0 | 19.4 | 19.4 | 8 / 25 | ✅ | ✅ | ✅ |
| a-gpt54 | A | ✓ | 4.5 | **25.6** | 25.6 | 8 / 25 | ✅ | ❌ | ✅ |
| b-gptoss120b | B | ✗ (gate) | 29.1 | 50.0 | 50.0 | 20 / 45 | ❌ | ❌ | ✅ |
| a-gemini3flash | A | ✗ | 3.7 | 4.0 | 4.0 | 8 / 25 | ✅ | ✅ | ✅ |
| a-deepseekv4pro | A | ✗ | 3.8 | 40.4 | 40.4 | 8 / 25 | ✅ | ❌ | ✅ |
| a-gpt54mini | A | ✗ | 4.1 | 14.4 | 14.4 | 8 / 25 | ✅ | ✅ | ✅ |
| a-gemini31pro | A | ✗ | 7.5 | 13.2 | 13.2 | 8 / 25 | ✅ | ✅ | ✅ |
| a-gptoss120b | A | ✗ | 3.7 | 33.1 | 33.1 | 8 / 25 | ✅ | ❌ | ✅ |

**Pooled figures for the 8 enabled agents (48 turns):**
- all turns: p50 9.1 s, p90 28.9 s, max 45.3 s;
- A: p50 5.0 s, p90 21.4 s (question turns p50 4.5 s);
- B: p50 9.8 s, p90 29.6 s.

The two misses are:
- `b-deepseekv4pro`: its turns take 11–45 s. It still spends 1,200–3,700 reasoning tokens per call at `minimal`.
- `a-gpt54`: its single-call finish turn took 25.6 s.

Per D-037 nothing was changed to meet the targets. The A agents' p90 is set by the finish turn, which writes the whole assessment in one call.

## 7. Compose + nginx run (T4.3)

`backend/data` had no `lab.db*` before the check, so no backup was needed.

- **`b-sonnet55`** ran as specified.
- **`b-gptoss120b`** had just been disabled by the gate, so the run verifies that it is not reachable.
- **Substitute:** `b-gpt54mini`, another changed model, was run instead (B-041).

```text
PS> docker compose up --build -d                       → backend Started, web Started (:80)
PS> $pw | docker compose exec -T backend uv run python -m app.cli create-user --username qa2b2x … --password-stdin
# requests from the host with httpx (trust_env=False: a system proxy answered 503 for localhost)
POST /auth/login → 200 (227 ms) role=evaluator
GET  /agents     → 200 (10 ms), 8 agents; b-gptoss120b listed: False
POST /sessions {b-sonnet55} → 201 (121 ms), status=active, first=greeting
  turn 1 → 200, wall 7.6 s (server 7510), question
    «متوجه‌ام، ممکن است ناراحت‌کننده باشد. سردردتان ناگهانی شروع شد یا کم‌کم؟ شدتش از ۱ تا ۱۰ چقدر است؟»
  turn 2 → 200, wall 7.6 s (server 7533), question
    «آیا همراه سردرد ضعف یا بی‌حسی دست و پا، تاری دید، اشکال در حرف زدن یا سفتی گردن دارید؟ آیا اخیراً ضربه‌ای به سرتان خورده است؟»
  finish → 200, wall 13.0 s (server 12946), result; status=completed, end_reason=evaluator_ended,
    INSUFFICIENT_INFO, general_practice, 4 differentials, guard flags=[], stats.total_cost_usd=0.064
POST /sessions {b-gptoss120b} → 404 NOT_FOUND "Agent not found"      (second user qa2b2y)
POST /sessions {b-gpt54mini}  → 201, turns 9.5 s / 9.1 s (questions), finish 9.4 s → result
    INSUFFICIENT_INFO, general_practice, 5 differentials, flags=[], total_cost_usd=0.0194
PS> docker compose down                                  → containers and network removed
PS> Get-ChildItem backend\data -Filter 'lab.db*'         → lab.db 4096, lab.db-shm 32768, lab.db-wal 1203072 → deleted
PS> Get-ChildItem backend\data                           → dev.db*, smoke-*.json/txt, t4-*.txt, t5-run.txt (no lab.db)
```

The two evaluator accounts (`qa2b2x`, and a first `qa2b2` whose password was discarded after the proxy error) existed only in the deleted check database. Passwords were random, 20 characters, and never printed. Output: `data/t4-2b2-compose*.txt`.

## 8. Qualitative notes on the changed and new models (observations only)

These notes cover the 14 agents × 2 runs plus the compose run, but focus on the changed and new models. **No reply contained Latin script** (a regex check over every reply returned nothing). **None named a drug or a dose.**

- **Claude Sonnet 5.5.**
  - Warm and consistent: it opens with empathy («متأسفم که سردرد دارید» / «متوجه‌ام، ممکن است ناراحت‌کننده باشد») and asks two focused questions (onset, then severity 1–10).
  - Its turn 1 was nearly word-for-word identical across runs and architectures.
  - Its conclusions are the most complete red-flag lists: fever with neck stiffness, weakness or numbness, speech, vision, seizure, reduced consciousness.
  - Compared with Sonnet 5 it no longer mixes colloquial and formal forms, and it needed no repair (0/12 calls).
- **GPT-5.4 Mini.**
  - Clinical and fast. It bundles 5–7 symptoms into one line («تهوع، تب، سفتی گردن، تاری دید یا ضعف و بی‌حسی هم دارید؟»), often on two lines with a `/`-style list.
  - Unlike GPT-5 Mini it writes full sentences, and it adds sensible extra probes (head trauma, blood pressure, sinus/eye symptoms for cluster headache).
  - One repair in `a-gpt54mini` run 1: it returned a bare assessment without the `SimpleTurn` wrapper.
  - One conclusion added the pediatric caveat on its own («اگر سن‌تان کمتر از ۱۲ سال است …»).
- **DeepSeek V4 Pro 0813** (with `minimal` / 8000).
  - Valid JSON every time in B (0 repairs, down from 25% in phase 2b), and the B conclusions are sensible and concise.
  - It is still **repetitive**: it asked the location of the pain in both turns in all 4 conversations («کجای سرتان درد می‌کند …» twice).
  - `a-deepseekv4pro` run 1 **echoed the patient's own message as its result text** («مرد هستم، ۳۵ سالمه. درد حدود ۵ از ۱۰ است …»). In run 2 it ignored the forced-conclude line.
- **gpt-oss-120b.**
  - Its Persian is understandable but less idiomatic, with some odd word choices:
    - «از چه نقطه‌ای حس می‌شود؟»
    - «نوردهی» for photophobia
    - «از چه موقعیتی شروع شد؟»
    - one irrelevant probe, «سینه‌درد», in a headache interview
  - It asks 2–3 questions per message.
  - **In architecture A, both results were the patient's case restated in the first person** instead of advice to the patient («از دیروز سردرد دارم، مرد ۳۵ ساله، درد ۵/۱۰، کم‌کم شروع شد، بدون تب یا علائم هشداردهنده.»). The run-2 version also asserts "no fever or warning signs", which the patient never said.
  - The guard does not catch this, because the level (ROUTINE_DAYS) and the rest of the schema are valid.
  - In B it never produced a result within 50 s (§4).

The "result text = patient echo" pattern has now appeared with three models in architecture A: Gemini 3.1 Pro (phase 2b), DeepSeek 0813 and gpt-oss-120b. It is worth checking in M3 and in the prompt work (D-031).

## 9. Known issues and next steps

**Known issues**

1. `b-gptoss120b` is disabled by the D-036 gate. Its B assessment call does not finish within 50 s, and its B turn latency varies 6–40 s. The provider behind it under `data_collection: deny` is not recorded in our trace.
2. D-037 misses among enabled agents: `b-deepseekv4pro` (p50 29.6 s, p90 45.3 s) and `a-gpt54` (p90 25.6 s, marginal).
3. In architecture A, `a-gptoss120b` (2 of 2 runs) and `a-deepseekv4pro` (1 of 2) wrote a result text that restates the patient's message. Both are disabled, and the guard does not detect it (§8).
4. `a-gemini3flash` (both runs) and `a-deepseekv4pro` (run 2) ignore the forced-conclude line. Both are disabled.
5. A deadline-cut call has no response, so its tokens and cost are unknown in our trace. The provider may still bill it, but OpenRouter's `/key` total stays authoritative.
6. The smoke script still covers one complaint and two turns. Agent-concluded B turns (turn call plus assessment call in one 80 s budget) were not observed in these runs.
7. On this machine a system proxy intercepts `localhost` for Python HTTP clients. Use `trust_env=False` (or `NO_PROXY=localhost`) for host-side checks.
8. `docs/BACKEND_ARCHITECTURE.md` has uncommitted product-owner edits (v1.2) in the working tree. The backend coder may not edit that file, so it was deliberately left out of the `backend:` commits and needs a product-side commit.

**Next steps**

1. Product owner: decide whether `b-gptoss120b` needs another look before M3 (for example, a provider allow-list, or a later re-check). Under D-036 it stays off for M3.
2. Phase 2c (§8a pricing and cost accounting, D-035) as planned.
3. M3 QA (`docs/qa/M3-qa-protocol.md`) with the 8 enabled agents. Watch `b-deepseekv4pro` latency, the repair rate, and result texts that echo the patient.
