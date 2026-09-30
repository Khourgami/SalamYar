# Backend Phase 2c — Token and Cost Accounting (contract v1.2)

**Date:** 2026-09-30 · **Status:** ✅ complete · **Decisions:** D-035; B-042 … B-047 · **API spend:** USD 0 (one public `GET /models` read, no key)

## 1. Summary

Every LLM attempt now stores its tokens, OpenRouter's reported cost, the price snapshot of its session and an estimated cost. Sessions keep call and token totals. The API serves the contract v1.2 fields (`ResultCard.stats`, `MetricsRow`), and cost, tokens and call count are hidden from non-admin callers until the session is evaluated (D-035/D-007). A new `cost-report` CLI summarizes tokens and cost by session, agent, model or architecture and can write CSV. The reported cost stays the source of truth. The estimate is a cross-check and never replaces a missing reported cost in the API.

Results: 358 tests pass (+36 in this phase), 99% line coverage of `app/`, guard 100% line+branch, and ruff check/format are clean. There is one commit per task (T1–T4, then T5/T6 together).

## 2. Prices (`config/agents.yaml` → `pricing`)

Source: public `GET https://openrouter.ai/api/v1/models` (464 models) on 2026-09-30. `pricing.prompt` and `pricing.completion` (USD per token) were multiplied by 1,000,000 with `Decimal`, so the values are exact and unrounded.

| Model | Input $/1M | Output $/1M | Source | as_of | Extra price fields on `/models` (not modeled) |
|---|---|---|---|---|---|
| openai/gpt-5.4 | 2.5 | 15.0 | openrouter-models | 2026-09-30 | `input_cache_read` 0.25; `web_search`; override ≥ 272k prompt tokens (5 / 22.5) |
| anthropic/claude-sonnet-5.5 | 2.0 | 10.0 | openrouter-models | 2026-09-30 | `input_cache_read` 0.2, `input_cache_write` 2.5, `input_cache_write_1h` 4; `web_search` |
| google/gemini-3.1-pro-preview | 2.0 | 12.0 | openrouter-models | 2026-09-30 | `internal_reasoning` 12 (same as output); cache read/write; image/audio; `web_search`; override ≥ 200k prompt tokens (4 / 18) |
| openai/gpt-5.4-mini | 0.75 | 4.5 | openrouter-models | 2026-09-30 | `input_cache_read` 0.075; `web_search` |
| google/gemini-3-flash-preview | 0.5 | 3.0 | openrouter-models | 2026-09-30 | `internal_reasoning` 3 (same as output); cache read/write; image/audio; `web_search` |
| deepseek/deepseek-v4-pro-0813 | 1.32 | 3.96 | openrouter-models | 2026-09-30 | `input_cache_read` 0.044; **time-of-day overrides**: half price (0.66 / 1.98) on weekends and in several UTC windows on weekdays |
| openai/gpt-oss-120b | 0.037 | 0.17 | openrouter-models | 2026-09-30 | none (but served by several providers at different prices) |

Validation: every model used by any agent, enabled or not, must have an entry, and the error names the agent and the model. Prices must be ≥ 0, and unknown keys, missing `source`/`as_of`, and `pricing` inside `defaults` or an agent entry are all rejected. The model's entry is copied into `AgentConfig.pricing`, so it is part of the session snapshot (B-015), and a price edit followed by a reload changes only new sessions. `list-agents` prints both prices.

## 3. Reasoning tokens: are they inside `completion_tokens`?

Evidence comes from the phase 2b and 2b-2 `--json` traces: 97 calls with usage, checked against formula A = `prompt × in + completion × out` and formula B = A + `reasoning × out`. In every trace, `completion_tokens ≥ reasoning_tokens`.

| Model | Calls with reasoning > 0 | Finding | Evidence |
|---|---|---|---|
| gpt-5.4 | 24/24 | **included** | 3268 / 824 / 11 tokens → reported 0.02053 = A exactly; B would be +0.8% |
| gpt-5.4-mini | 13/13 | **included** | 3268 / 868 / 44 → 0.006357 = A; B +3.1% |
| gemini-3.1-pro-preview | 21/24 | **included** | all 24 calls at 0.00% under A; B up to +47% |
| deepseek-v4-pro-0813 | 12/13 | **included** | 2507 / 149 / 47 → 0.00389928 = A |
| gpt-oss-120b | 6/11 | **included** | repair 3923 / 783 / 70 → 0.000278261 = A |
| claude-sonnet-5.5 | 0/12 | unclear (always 0) | A = B; 12/12 at 0.00% |
| gemini-3-flash-preview | 0/24 | unclear (always 0) | A = B; 24/24 at 0.00% |

**Rule (B-043):** `billable_output_tokens = completion_tokens` for every model. Where A is **above** the reported cost, the gap comes from discounts that the estimate does not model:
- **OpenAI prompt caching.** The implied cached prompt tokens are 1792, 2304 and 2816, which are multiples of 128. Cache reads cost 10% of the input price.
- **DeepSeek.** Cache reads plus the half-price off-peak windows.
- **gpt-oss-120b.** Provider routing: −37% … +20% per call.

## 4. Estimated cost per triage, per agent

> **Estimate from smoke conversations, not real sessions.** Each run is one scripted phase 2b-2 conversation per agent (2 patient messages + forced conclusion, `data/smoke-2b2-run{1,2}.json`, current model set and config). Estimated = tokens × §2 prices over all calls that reported usage, including repairs. Reported = OpenRouter `usage.cost`. Real triages will have more turns (up to 12 questions), so they will cost more.

| Agent | Enabled for M3 | Calls r1/r2 | Prompt tok (mean) | Completion tok (mean) | of which reasoning | **Estimated USD / triage** (r1 / r2 → mean) | Reported USD (mean) | Est. vs reported |
|---|---|---|---|---|---|---|---|---|
| b-gemini3flash | ✓ | 3/3 | 10,909 | 2,620 | 0 | 0.0133 / 0.0134 → **0.0133** | 0.0133 | +0% |
| a-sonnet55 | ✓ | 3/3 | 11,592 | 2,392 | 0 | 0.0479 / 0.0463 → **0.0471** | 0.0471 | +0% |
| b-gpt54 | ✓ | 3/3 | 9,932 | 3,400 | 288 | 0.0752 / 0.0765 → **0.0758** | 0.0643 | +18% (cache) |
| b-deepseekv4pro | ✓ | 3/3 | 10,110 | 9,550 | 7,019 | 0.0503 / 0.0520 → **0.0512** | 0.0391 | +31% (cache/off-peak) |
| a-gpt54 | ✓ | 3/3 | 7,553 | 1,598 | 82 | 0.0433 / 0.0425 → **0.0429** | 0.0328 | +31% (cache) |
| b-sonnet55 | ✓ | 3/3 | 14,580 | 3,494 | 0 | 0.0650 / 0.0631 → **0.0641** | 0.0641 | +0% |
| b-gpt54mini | ✓ | 3/3 | 9,977 | 3,440 | 212 | 0.0217 / 0.0242 → **0.0230** | 0.0195 | +18% (cache) |
| b-gemini31pro | ✓ | 3/3 | 10,892 | 2,772 | 329 | 0.0539 / 0.0562 → **0.0551** | 0.0551 | +0% |
| a-gemini3flash | ✗ | 3/3 | 8,406 | 314 | 0 | 0.0052 / 0.0051 → **0.0051** | 0.0051 | +0% |
| a-deepseekv4pro | ✗ | 3/4 | 9,106 | 1,085 | 397 | 0.0163 / 0.0163 → **0.0163** | 0.0090 | +81% (cache/off-peak) |
| a-gpt54mini | ✗ | 4/3 | 9,660 | 2,347 | 158 | 0.0223 / 0.0133 → **0.0178** | 0.0133 | +34% (cache) |
| a-gemini31pro | ✗ | 3/3 | 8,449 | 2,688 | 1,495 | 0.0498 / 0.0485 → **0.0492** | 0.0492 | +0% |
| b-gptoss120b | ✗ (D-036 gate) | 3/4 | 9,017 | 1,916 | 76 | 0.0006 / 0.0007 → **0.0007** | 0.0007 | −10% (routing; conclusion cut in both runs) |
| a-gptoss120b | ✗ | 3/3 | 7,748 | 984 | 66 | 0.0005 / 0.0004 → **0.0005** | 0.0005 | −13% (routing) |

Reading the table:
- Among the 8 enabled agents, b-gpt54 (~USD 0.07), b-sonnet55 (~0.06) and b-gemini31pro (~0.055) are the most expensive per short triage. b-gemini3flash (~0.013) and b-gpt54mini (~0.02) are the cheapest.
- gpt-oss-120b is about 100× cheaper than the frontier models.
- DeepSeek's cost is dominated by reasoning tokens (7,019 of 9,550 completion tokens on B).

## 5. API, metrics, export (contract v1.2)

- **`ResultCard.stats`** gains `llm_calls`, `prompt_tokens`, `completion_tokens`, `reasoning_tokens` from the session totals, next to `total_cost_usd`.
- **Blindness is decided in one place** (`usage_visible` inside the only `ResultCard` builder). The five fields are `null` for a non-admin caller until an evaluation exists. Admins (`/admin/sessions/{id}`, or reading their own session) always get values. This covers `GET /sessions/{id}`, the `TurnResponse` of `POST /messages` and `POST /finish`, and the admin detail.
- **`MetricsRow`** gains:
  - `total_cost_usd`: the sum of reported cost over completed sessions with a cost.
  - `mean_llm_calls`.
  - `mean_prompt_tokens`, `mean_completion_tokens`, `mean_reasoning_tokens`: over completed sessions with a value.

  The grouping is the same as B-021, for all three `group_by` values.
- **CSV:** `sessions` gains `llm_call_count`, `total_prompt_tokens`, `total_completion_tokens`, `total_reasoning_tokens`, `total_estimated_cost_usd`. `llm_calls` gains `price_input_per_mtok`, `price_output_per_mtok`, `estimated_cost_usd`. Tests check that these columns are present.
- **Data:** the session totals are recomputed from `llm_calls` after **every** attempt, including failed, deadline-cut and repair attempts. Token and estimate totals stay `null` until at least one attempt reported the value.

## 6. Schema check (no migrations)

`init_db()` runs `create_all` and then `check_schema`. If any existing table lacks a column of the current models, start-up fails with:

```
database schema is older than v1.2 — delete data/*.db or use a new DATABASE_PATH (missing columns: sessions.llm_call_count, …)
```

This applies to the API (lifespan), the dev server (printed as `error: …`), `create-user` and `cost-report`. It was verified on the real pre-v1.2 `data/dev.db`, which was refused with 8 missing columns listed.

**Instruction:** before starting v1.2, delete old `data/lab.db*` and `data/dev.db*` files, or point `DATABASE_PATH` / `--db` at a new file.

## 7. `cost-report` CLI

`uv run python -m app.cli cost-report [--by session|agent|model|architecture] [--status completed|all] [--csv PATH] [--db PATH]`, default `--by agent --status completed`. It reads the DB only, needs no key, and uses `DATABASE_PATH` or `--db`.

Grouped rows contain:
- sessions, LLM calls and repair calls;
- prompt, completion and reasoning tokens (sum and mean);
- reported cost (sum, mean, median, max per session);
- estimated cost (sum, mean);
- `diff_pct` over calls that have both values, with `>15%` in the `flag` column.

`--by session` gives one row per session. `--csv` writes the same cells as the table, UTF-8 with BOM. An empty DB prints `no sessions …` and exits 0. A missing DB file or an old schema exits 2.

## 8. Verification with the dev server (T5)

DemoLLM now reports a fixed usage per call: 1500 prompt tokens, 300 completion tokens (60 of them reasoning) and USD 0.002.

**Deviation:** `data/dev.db` could **not** be deleted. It was held open by a dev server already running on port 8000 (`app.dev_server --seed --delay-ms 800`, started 06:50, before this phase and presumably the web coder's). I did not stop that process. Instead:
1. The old file was first used to confirm the schema check refused it.
2. The check ran on a **new** DB, `data/dev-2c.db`, on port 8765 with `--seed --delay-ms 200`.
3. The `dev-2c.db` files were deleted afterwards (B-047).

Output of the `Invoke-RestMethod` script. The doctor ran structured `b-gpt54` for 2 messages to a result and evaluated it. The doctor also ran simple `a-sonnet55` for 1 message plus `finish`, and did not evaluate it.

```
agents visible to doctor: 8
B turn1=question turn2=result status=completed
B stats in the completing TurnResponse (doctor, not evaluated): {"questions_asked":1,"total_cost_usd":null,"llm_calls":null,"prompt_tokens":null,"completion_tokens":null,"reasoning_tokens":null}
A turn1=question finish=result end_reason=evaluator_ended
A stats in the /finish response (doctor, not evaluated): {"questions_asked":1,"total_cost_usd":null,"llm_calls":null,"prompt_tokens":null,"completion_tokens":null,"reasoning_tokens":null}
evaluation created for B: True
GET /sessions/B  (doctor, evaluated):      {"questions_asked":1,"total_cost_usd":0.006,"llm_calls":3,"prompt_tokens":4500,"completion_tokens":900,"reasoning_tokens":180}
GET /sessions/A  (doctor, NOT evaluated):  {"questions_asked":1,"total_cost_usd":null,"llm_calls":null,"prompt_tokens":null,"completion_tokens":null,"reasoning_tokens":null}
GET /admin/sessions/A (admin, any time):   {"questions_asked":1,"total_cost_usd":0.004,"llm_calls":2,"prompt_tokens":3000,"completion_tokens":600,"reasoning_tokens":120}
/admin/metrics?group_by=architecture (v1.2 fields):
key        sessions_total mean_cost_usd total_cost_usd mean_llm_calls mean_prompt_tokens mean_completion_tokens mean_reasoning_tokens
simple                  1         0.004          0.004            2.0             3000.0                  600.0                 120.0
structured              1         0.006          0.006            3.0             4500.0                  900.0                 180.0
/admin/metrics (by agent, rows with sessions):
key        sessions_total total_cost_usd mean_llm_calls mean_prompt_tokens mean_completion_tokens mean_reasoning_tokens
a-sonnet55              1          0.004            2.0             3000.0                  600.0                 120.0
b-gpt54                 1          0.006            3.0             4500.0                  900.0                 180.0
```

`cost-report --by session --db data/dev-2c.db`:

```
Cost report by session — completed sessions — data/dev-2c.db
session_id                            agent_id    model                        architecture  status     end_reason       questions  final_triage_level  llm_calls  prompt_tokens  completion_tokens  reasoning_tokens  reported_usd  estimated_usd
e3fba026-ed37-4fdf-b402-08f0126fe717  b-gpt54     openai/gpt-5.4               structured    completed  agent_concluded  1          ROUTINE_DAYS        3          4500           900                180               0.006000      0.024750
3840eb95-8b3d-4e4e-a976-0731a51474c2  a-sonnet55  anthropic/claude-sonnet-5.5  simple        completed  evaluator_ended  1          ROUTINE_DAYS        2          3000           600                120               0.004000      0.012000
```

`--by model` flagged both rows with `>15%` (+200% and +312.5%). This is expected, because DemoLLM's fixed cost does not follow real prices.

## 9. New decisions

- **B-042:** the pricing map, validation, snapshot, and the extra price fields.
- **B-043:** reasoning tokens are part of `completion_tokens`, so billable output = completion.
- **B-044:** the new columns, totals after every attempt, and the schema check.
- **B-045:** the v1.2 API fields, blindness in one place, and the metrics.
- **B-046:** `cost-report` semantics.
- **B-047:** DemoLLM usage, and T5 running on a new DB because `dev.db` was locked by a running dev server.

## 10. Known issues

1. **The dev server running on port 8000 still uses the pre-v1.2 `data/dev.db`.** It keeps working until it is restarted, and then it refuses to start. Stop it and delete `data/dev.db*` (or start with `--db data/dev2.db`) before web testing against v1.2.
2. **The estimate overstates cost for cached calls.** This affects OpenAI and DeepSeek by about +18–81% per triage in the smoke runs. Cache, time-of-day and provider-routing prices are not modeled, and `usage.prompt_tokens_details.cached_tokens` is not stored. The reported cost is correct.
3. **Two models are "unclear" on reasoning.** Sonnet 5.5 and Gemini 3 Flash never reported reasoning tokens. If they start doing so, re-check B-043.
4. **Pre-v1.2 snapshots.** Sessions created before v1.2 would have no price snapshot, so their estimate is null. This cannot happen in practice, because old DBs are refused.

## 11. Next steps

- Restart the web dev server on a fresh DB. Web phase: show the v1.2 fields after evaluation (already on mocks, 3b).
- M3 QA with the 8 enabled agents. Run `cost-report --by agent` after M3 for the real cost per triage, and compare it with §4.
- Optional: store `cached_tokens` to make the estimate match cached calls.
