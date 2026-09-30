# Backend Phase 2b — Real-Model Verification

**Date:** 2026-09-30 · **Status:** complete · **Spent:** USD 0.87 of the USD 5 budget (OpenRouter `GET /key` usage after all runs; the two smoke runs report USD 0.41 + 0.39, and the T5 compose run accounts for the rest).

## 1. Summary

The path backend → OpenRouter → six real models has now been tested (D-030). There were two full smoke runs over all 12 agents and one real-model run through Docker Compose and nginx.

- **Provider parameters:** no provider rejected `temperature`, `response_format: json_object` or `reasoning`. The D-025 rule table therefore required **no config change**. All six architecture-A agents handle a conversation that starts with the `assistant` greeting, so there is **no greeting fallback** (B-034).
- **Enabled agents (8):** all 8 passed in run 1. In run 2 (the final run), 7 of 8 passed. `b-deepseekv4pro` failed its forced conclusion in run 2 with invalid JSON that survived the repair. That is a "no fix" row, so it stays enabled and is documented here.
- **Disabled agents (4):** `a-gemini3flash` fails the forced conclusion in both runs: it asks another question after being told to conclude. This is a "no fix" row, and the agent stays disabled. The other three pass.
- **Compose + nginx (T5):** real replies arrived through `http://localhost` for both architectures (`b-sonnet5`, `a-gpt54`). `finish` returned a `result` with a `ResultCard`. The database was left as it was.
- **Latency is the main finding.** In the final run, turn latency was p50 12.4 s and p90 40.6 s over 36 turns, so NFR-2 (p50 ≤ 8 s, p90 ≤ 20 s) is **not met overall**:
  - Architecture-A question turns are fast (pooled p50 6.3 s).
  - Architecture-B question turns are not (pooled p50 13.8 s).
  - `b-deepseekv4pro`'s finish turn exceeded the web client's 90 s timeout in both runs (105.6 s, 106.8 s). The backend's 60 s LLM timeout does not bound a whole call (B-035).
  - §5 lists the recommendations; nothing was changed.

| Check | Result |
|---|---|
| `uv run pytest -q` | **306 passed** (baseline 296; +10) |
| Guard `--cov=app.agents.guard --cov-branch --cov-fail-under=100` | 100% (19 tests) |
| `ruff check` / `ruff format --check` | clean |

### Tasks

| Task | Result |
|---|---|
| T1 | The secrets file was at `backend/env`, which is untracked and **not git-ignored**. It was renamed to `backend/.env`, the path named in its own header (B-032). `GET /key` → 200 with limit USD 50, remaining 50, usage 0. |
| T2 | The smoke table gained per-turn latency, mean and max, LLM calls and repairs; `--json PATH` was added (B-033). 10 new FakeLLM tests. |
| T3 | Two real runs. No config change and no greeting fallback (B-034). |
| T4 | Analysis below (§5). |
| T5 | Compose + nginx real-model run (§6). |
| T6 | This report, plus README, progress and decisions. |

## 2. Smoke results

The config is the same for every agent and was unchanged across all runs: `output_mode: json_object`, `send_temperature: true` (0.3), `reasoning_effort: low`, `max_tokens: 4000`.

Columns:
- **Run 1 / Run 2:** turn1 / turn2 / conclude (`y` ok, `n` failed). Run 2 is the final run.
- **Repairs:** the final run's repair calls out of all calls.
- **Latency:** wall-clock time per scripted turn in the final run.
- **Finish (B):** the forced-conclusion turn. For architecture B this is the assessment call (§5.2).
- **Cost:** the final run's cost for one scripted conversation (2 patient messages plus a forced conclusion).

| Agent | Model | Enabled | Run 1 | Run 2 (final) | Repairs | p50 / max turn (s) | Finish turn (s) | Cost (USD) |
|---|---|---|---|---|---|---|---|---|
| b-gemini3flash | google/gemini-3-flash-preview | ✓ | yyy ✅ | yyy ✅ | 0/3 | 7.8 / 8.2 | 7.8 | 0.0131 |
| a-sonnet5 | anthropic/claude-sonnet-5 | ✓ | yyy ✅ | yyy ✅ | 1/4 | 11.3 / 20.8 | 20.8 | 0.0517 |
| b-gpt54 | openai/gpt-5.4 | ✓ | yyy ✅ | yyy ✅ | 0/3 | 20.4 / 27.3 | 27.3 | 0.0562 |
| b-deepseekv4pro | deepseek/deepseek-v4-pro | ✓ | yyy ✅ (1 repair) | yy**n** ❌ | 1/4 | 74.0 / 106.8 | 106.8 (failed) | 0.0437 |
| a-gpt54 | openai/gpt-5.4 | ✓ | yyy ✅ | yyy ✅ | 0/3 | 5.7 / 26.8 | 26.8 | 0.0317 |
| b-sonnet5 | anthropic/claude-sonnet-5 | ✓ | yyy ✅ | yyy ✅ | 0/3 | 14.8 / 19.0 | 19.0 | 0.0591 |
| b-gpt5mini | openai/gpt-5-mini | ✓ | yyy ✅ | yyy ✅ | 0/3 | 18.5 / 21.0 | 21.0 | 0.0100 |
| b-gemini31pro | google/gemini-3.1-pro-preview | ✓ | yyy ✅ | yyy ✅ | 0/3 | 10.3 / 10.3 | 9.3 | 0.0544 |
| a-gemini3flash | google/gemini-3-flash-preview | ✗ | yy**n** ❌ | yy**n** ❌ | 0/3 | 4.0 / 4.0 | 4.0 (failed) | 0.0051 |
| a-deepseekv4pro | deepseek/deepseek-v4-pro | ✗ | yyy ✅ (1 repair) | yyy ✅ | 1/4 | 14.7 / 40.6 | 40.6 | 0.0066 |
| a-gpt5mini | openai/gpt-5-mini | ✗ | yyy ✅ | yyy ✅ | 0/3 | 7.3 / 15.9 | 15.9 | 0.0051 |
| a-gemini31pro | google/gemini-3.1-pro-preview | ✗ | yyy ✅ | yyy ✅ | 0/3 | 8.8 / 14.1 | 14.1 | 0.0530 |

- Run totals: run 1 11/12 passed, USD 0.4115; run 2 10/12 passed, USD 0.3897. Every model slug was found on `/models`.
- No agent concluded on its own within the two scripted turns. Every result came from the forced conclusion (the evaluator's "finish").
- Raw data: `data/smoke-run1.json`, `data/smoke-run2.json` (git-ignored). The console tables are in `data/smoke-run{1,2}.txt`.

## 3. Config changes

**None.** No provider returned an error for any parameter, so none of the D-025 evidence rows applied:
- `temperature` was accepted, including by the three models whose `/models` entry does not list it (B-030's observation was not confirmed as a problem).
- `response_format: json_object` was accepted by all six models.
- `reasoning.effort: low` was accepted by all six models.
- Assistant-first conversations were handled correctly by all six A agents. Each answered the headache complaint with a relevant question (for example `a-gpt54`: «سردردتان کجاست و از ۰ تا ۱۰ چقدر شدید است؟ ناگهانی شروع شد یا کم‌کم؟»).

`config/agents.yaml` is unchanged, and so are the `enabled` flags. The decision is B-034.

## 4. Failures kept unchanged (evidence)

**`b-deepseekv4pro`: invalid JSON survives the repair (run 2, conclude). Row: "Invalid JSON that survives the repair" → no fix.**

```text
conclude assessment attempt 1  FAIL 38590 ms  reasoning_tokens 2566  completion_tokens 2583
  output: '{"}triage_level{": "}INSUFFICIENT_INFO{"}'
  error:  10 validation errors for AssessmentResult / triage_level Field required …
conclude repair attempt 2      FAIL 68170 ms  reasoning_tokens 3998  completion_tokens 4000
  output: ''
  error:  AgentOutputError: AssessmentResult invalid after repair: 1 validation error for AssessmentResult
          Invalid JSON: EOF while parsing a value at line 1 column 0 [type=json_invalid, input_value='', …]
```

In run 1 the same step truncated its JSON at `max_tokens` (3248 reasoning plus 752 output tokens = 4000; "EOF while parsing a list at line 68"). The repair recovered it that time. DeepSeek V4 Pro spends 2,000–4,000 reasoning tokens per call at `reasoning_effort: low`.

**`a-gemini3flash`: asks after the forced-conclude line (run 1 and run 2, conclude). Row: "anything else" → no fix.**

```text
conclude assessment attempt 1  parsed_ok 4024 ms
  output: {"action": "ask",
           "message_to_patient": "کجای سرتان درد می‌کند؟ آیا علائم دیگری مثل تب، حالت تهوع یا تاری دید هم دارید؟",
           "reasoning_note": "The patient provided age, sex, and severity, but the location of the headache is still unknown. …",
           "assessment": null}
  error:  AgentOutputError: model returned action 'ask' after being told to conclude
```

The output is valid JSON, so no repair runs. The model ignores the trailing `system` message `Conclude now. Set action to "conclude".` in both runs. `a-gemini31pro` obeys the same line. This agent is disabled, so evaluators are not affected. If it were enabled, every "finish" would return 502.

**Repaired and passing (for context, not failures):**
- `a-sonnet5` run 2 turn 2: returned plain Persian text with no JSON («ممنون از اطلاعات. درد بیشتر کجای سرتان است …»). The repair succeeded.
- `a-deepseekv4pro` in both runs, conclude: empty content on the first attempt (27 and 7 completion tokens). The repair succeeded.

## 5. Latency, repairs and cost against the targets (T4)

### 5.1 Turn latency

| Scope (turns) | p50 | p90 | max | NFR-2 (p50 ≤ 8 s, p90 ≤ 20 s) |
|---|---|---|---|---|
| Final run, all agents (36) | 12.4 s | 40.6 s | 106.8 s | ❌ both |
| Both runs, all agents (72) | 12.5 s | 31.3 s | 106.8 s | ❌ both |
| Architecture A, both runs, all turns | 7.4 s | 26.8 s | 40.6 s | p50 ✅, p90 ❌ |
| Architecture A, question turns only | 6.3 s | 14.7 s | — | ✅ |
| Architecture B, both runs, all turns | 14.9 s | 53.7 s | 106.8 s | ❌ |
| Architecture B, question turns only | 13.8 s | 45.3 s | — | ❌ |

Percentiles are nearest-rank, the same method as the admin metrics. Per-agent final-run p50 meets 8 s only for `b-gemini3flash` (7.8), `a-gpt54` (5.7), `a-gpt5mini` (7.3) and `a-gemini3flash` (4.0). The A agents' finish turn takes 14–41 s, because it is one call that writes the whole assessment.

### 5.2 Architecture B conclusion turn

In the scripted runs every B conclusion was forced, so the finish turn was **only the assessment call**. When a B agent concludes by itself, the turn is the turn call plus the assessment call. The estimate below uses the final run's mean question-turn latency plus its assessment latency:

| Agent | Mean question turn | Assessment call (finish) | Estimated agent-concluded turn |
|---|---|---|---|
| b-gemini3flash | 7.6 s | 7.8 s | ~15 s |
| b-gemini31pro | 10.3 s | 9.3 s | ~20 s |
| b-sonnet5 | 14.3 s | 19.0 s | ~33 s |
| b-gpt5mini | 16.0 s | 21.0 s | ~37 s |
| b-gpt54 | 19.3 s | 27.3 s | ~47 s |
| b-deepseekv4pro | 59.6 s | 106.8 s (38.6 + repair 68.2) | ~166 s (> 90 s) |

### 5.3 Timeouts

- **Web client timeout of 90 s:** exceeded by `b-deepseekv4pro`'s finish turn in both runs (105.6 s and 106.8 s). Its agent-concluded turn would exceed it as well. Its turn 2 took 53.7 s and 74.0 s. Every other agent stayed under 47 s estimated and under 32 s measured.
- **LLM timeout of 60 s + 1 retry:** there was no transport timeout in either run. However, three single calls took **more than 60 s and still succeeded**: 86.2 s, 74.0 s and 68.2 s, all from DeepSeek. The httpx timeout limits the gaps between reads, not the whole call (B-035). The effective upper bound on a turn is therefore not 2 × 60 s. It is open-ended, and a repair doubles it.
- **nginx read timeout of 120 s:** not reached.

### 5.4 Repair rate and cost

- **Repair rate (final run):** 0% for 9 agents and 25% (1 of 4 calls) for `a-sonnet5`, `b-deepseekv4pro` and `a-deepseekv4pro`. Across both runs: DeepSeek 25% (A and B), `a-sonnet5` 14%, everyone else 0%.
- **Cost per scripted conversation (3 turns):** USD 0.005–0.013 for the Flash, Mini and DeepSeek-A agents, and USD 0.03–0.06 for Sonnet 5, GPT-5.4 and Gemini 3.1 Pro. A real session of 5–8 questions will cost roughly 2–3 times more.

### 5.5 Recommendations for the product owner (nothing was changed)

1. **`b-deepseekv4pro`, the only enabled agent that fails a target hard.** It exceeds the 90 s client timeout at conclusion in both runs, and its repair rate is 25%. Options, in order of preference:
   - **(a) Disable it for M3.**
   - (b) Raise its `max_tokens` (for example to 8000), because 4000 is consumed by reasoning. This helps validity, not latency.
   - (c) Set `reasoning_effort: null` for DeepSeek. It spends 2,000–4,000 reasoning tokens at "low".
   - Options (b) and (c) are config changes outside the D-025 evidence table, so they need a D-xxx.
2. **NFR-2 is not reachable for architecture B with the current config.** Question turns take 10–20 s, and 60 s for DeepSeek. Options:
   - (a) Accept a separate latency target for B, for example p50 ≤ 20 s, because the comparison is architecture × model anyway.
   - (b) Lower `reasoning_effort` for B turn calls on GPT-5.4 and GPT-5 Mini (18–20 s and 14–19 s per turn).
   - (c) Keep everything as it is and make sure the UI's waiting state is clear for up to 30 s.
3. **Bound the whole LLM call.** Add a total per-call deadline (for example `asyncio.wait_for` at about 40 s). A turn would then return 502 and could be resent before the web client's 90 s timeout, instead of the client giving up while the backend is still working. This changes backend behavior, so it needs a decision.
4. **Keep `a-gemini3flash` disabled.** It does not obey the forced-conclude line. If it is wanted later, the phase after QA could look at how the forced-conclude instruction is phrased or placed. That is a prompt/architecture change, not config.
5. **In M3, watch `a-gemini31pro`'s result text.** In run 1 its `patient_message` was the patient's own second message echoed back (§7). The guard does not catch this.

## 6. T5: real-model smoke through Docker Compose and nginx

`backend/data/lab.db` did not exist before the check, so nothing needed to be backed up.

```text
PS> docker compose up --build -d
 Container salamyar-backend-1 Started · Container salamyar-web-1 Started
PS> docker compose ps
salamyar-backend-1   Up   8000/tcp
salamyar-web-1       Up (health: starting)   0.0.0.0:80->80/tcp
PS> $pw | docker compose exec -T backend uv run python -m app.cli create-user --username qa2b --display-name "QA 2b" --role evaluator --password-stdin
created evaluator 'qa2b' (<id>)                           # random 20-char password, never printed
# All requests below go to http://localhost/api/v1 (nginx), via Invoke-WebRequest with UTF-8 bodies
POST /auth/login                          → 200 (270 ms), user=qa2b role=evaluator
GET  /agents                              → 200 (13 ms), 8 agents
POST /sessions {agent_id: "b-sonnet5"}    → 201 (37 ms), status=active, first message kind=greeting
  turn 1 «از دیروز سردرد دارم»                         → 200, wall 11.5 s (server latency_ms 11399), kind=question
    «سردردتون چقدر شدید است، از ۱ تا ۱۰؟ و آیا به‌طور ناگهانی شروع شد یا کم‌کم؟»
  turn 2 «درد در پیشانی است، حدود ۵ از ۱۰، کم‌کم شروع شد. تب و تهوع ندارم.» → 200, wall 13.6 s (13524), kind=question
    «آیا تا به‌حال بدترین سردرد عمرتان بوده یا با ضعف، اختلال بینایی، گفتار یا سفتی گردن همراه است؟ لطفاً سن و جنسیت‌تان را هم بفرمایید.»
POST /sessions {agent_id: "a-gpt54"}      → 201 (61 ms), status=active, first message kind=greeting
  turn 1 (same text)                                  → 200, wall 4.0 s (3974), kind=question
    «سردردتان کجای سر است و از ۰ تا ۱۰ چقدر شدید است؟ ناگهانی شروع شد یا کم‌کم؟»
  turn 2 (same text)                                  → 200, wall 4.2 s (4154), kind=question
    «الان چند سال‌تان است و خانم هستید یا آقا؟ تاری دید، ضعف دست‌وپا یا سفتی گردن هم دارید؟»
POST /sessions/<a-gpt54>/finish           → 200, wall 28.7 s, kind=result, status=completed, end_reason=evaluator_ended
  ResultCard: triage_level=ROUTINE_DAYS, specialty=general_practice, 5 differentials,
              guard final=ROUTINE_DAYS flags=[], stats.questions_asked=2, duration_seconds=36.847
    «با توجه به اطلاعاتی که گفتید، این سردرد فعلاً بیشتر نیاز به ویزیت غیرفوری دارد، ولی چون سن و جنس شما و چند نکته مهم هنوز مشخص نیست، اگر سردرد شدیدتر شد یا تاری دید، ضعف دست‌وپا، گیجی، سفتی گردن، استفر…»
GET  /sessions/<b-sonnet5>                → 200, status=active, 5 messages
PS> docker compose down
 Container salamyar-web-1 Removed · Container salamyar-backend-1 Removed · Network salamyar_default Removed
PS> Get-ChildItem backend\data -Filter 'lab.db*'     # created by the check
lab.db 4096 · lab.db-shm 32768 · lab.db-wal 947632   → deleted
PS> Get-ChildItem backend\data
dev.db, dev.db-shm, dev.db-wal, smoke-run1.json, smoke-run1.txt, smoke-run2.json, smoke-run2.txt, t4-analysis.txt, t5-run.txt
```

The nginx overhead is 50–70 ms per turn: the difference between wall time and the server's `latency_ms`. There is no `lab.db` left, which matches the state before the check.

## 7. Qualitative notes on the Persian replies (observations only)

These are based on 12 agents × 2 runs plus T5, about 80 replies. **None of the replies contained English words** (a Latin-script check over all texts returned nothing). **None gave drug advice**: no drug names or doses. `a-gemini31pro` asked «آیا بیماری خاصی دارید یا دارویی مصرف می‌کنید؟», which is a history question. Almost every question message holds **2 questions**, with a few 1s and 3s. The number of symptoms bundled into one question varies a lot by model.

- **Claude Sonnet 5.** The most natural and warm tone («ببخشید که سردردتون شروع شده»). It mixes colloquial and formal forms (سرتون / سرتان). It asks two focused questions per message. Once in architecture A it answered in prose instead of JSON, and the repair fixed it.
- **GPT-5.4.** Concise and clinical, focused on red flags early (sudden onset, weakness, speech, vision), often split over two lines. It bundles 3–5 red flags into one question. The conclusions are clear, with an explicit "go to the emergency room if…" list.
- **Gemini 3.1 Pro.** Polite and formal («بفرمایید»). It asks for age and sex first and notices unanswered points («نفرمودید درد دقیقاً کجاست»). In architecture A it opens with «سلام» again after the greeting. **In run 1 its result text was the patient's own message** («مرد هستم، ۳۵ سالمه. درد حدود ۵ از ۱۰ است و کم‌کم شروع شد.») followed by the disclaimer. The level was INSUFFICIENT_INFO, and the guard did not flag it.
- **GPT-5 Mini.** Terse, sometimes telegraphic symptom lists («تب، تهوع/استفراغ، تاری دید، ضعف یک‌طرفه، گیجی یا سفتی گردن دارید؟»). The conclusions use a «خلاصه:» header and numbered lists, and read more like a note than a conversation. It uses one odd coinage («گفتارکُندی»).
- **Gemini 3 Flash.** Short and natural. In architecture B (run 1) it repeated the identical turn-1 question in turn 2. In architecture A it says «سلام» again, and it fails to conclude when told to (§4).
- **DeepSeek V4 Pro.** Natural but repetitive: it re-asked the location and quality of the pain in consecutive turns. It uses 2–3 questions per message, and its conclusions are sensible. It is very slow (§5).

## 8. Known issues and next steps

**Known issues**

1. `b-deepseekv4pro` exceeds the 90 s client timeout at conclusion and failed validation after repair in 1 of 2 runs (§4, §5.5-1).
2. NFR-2 is missed for architecture B and for A's finish turns (§5.1).
3. The LLM timeout is per read, not per call (B-035). A slow provider can hold a turn, and the session lock, for longer than the client waits.
4. `a-gemini3flash` cannot conclude when forced. It is disabled.
5. `a-gemini31pro` once echoed the patient's message as its result text.
6. The smoke script covers only one complaint and two turns. In it, no B agent concluded by itself, so agent-concluded B latency is an estimate (§5.2).
7. Pre-existing: `.env` has `APP_PUBLIC_URL`/`CORS_ORIGINS` set to `http://localhost:5173`. That is harmless behind nginx, which is same-origin, but should be set to the public URL on the target host.

**Next steps**

1. Product owner: decide on §5.5 items 1–3 (DeepSeek-B for M3, the B latency target, a total per-call deadline). These need D-xxx entries.
2. M2 integration report (product side), then deploy on the target host with the evaluator accounts (README "Docker Compose").
3. M3 QA (`docs/qa/M3-qa-protocol.md`): watch the repair rate and latency p50/p90 per agent in the admin metrics, plus the qualitative points in §7. Prompt tuning (`prompts/v2`) comes after the QA findings (D-031).
