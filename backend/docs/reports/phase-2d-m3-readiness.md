# Backend Phase 2d — M3 Readiness: Provider Trace, Cached Tokens, Open-Weight Provider Selection

**Date:** 2026-09-30 · **Status:** ✅ complete · **Decisions:** D-040 … D-042; B-048 … B-055 · **API spend:** USD 0.184 of the USD 1.50 budget (OpenRouter `GET /key` usage 1.7810 → 1.9654)

## 1. Summary

- **M3 agent set: 9 enabled agents.** They are the 8 from phase 2b-2 plus **`b-gptoss120b`** («دکتر ۱۳»). It passed the D-036 gate again with its routing pinned to Cerebras: conclusion ✅/✅, max turn 3.9 s (B-055).
  - `b-gemini3flash`, `a-sonnet55`, `b-gpt54`, `b-deepseekv4pro`, `a-gpt54`, `b-sonnet55`, `b-gpt54mini`, `b-gemini31pro`, `b-gptoss120b`.
- **Provider pins (D-041):**
  - `openai/gpt-oss-120b` → `cerebras/fp16`: p50 3.4 s, down from 29.1 s unpinned in 2b-2.
  - `deepseek/deepseek-v4-pro-0813` → `coreweave/fp8`: p50 15.1 s, down from 29.6 s. It now meets the D-037 B targets.
  - `data_collection: "deny"` is still sent on every request, and fallbacks stay allowed.
- **Deviation from the literal rule (B-054):** Together had the lowest DeepSeek p50 (5.9 s) but was **excluded**. It returned 0 reasoning tokens in all 6 calls, so it ignores `reasoning`. Pinning it would change the model's behavior, not just the infrastructure. It is a one-line switch if the product owner wants it.
- **T1:** every LLM call stores its serving provider (`llm_calls.provider`). The smoke test shows it, and `cost-report --by provider` groups by it.
- **T2:** cached prompt tokens are stored per call and per session. Six models got a cache-read price. On the pinned DeepSeek provider the estimate now matches the reported cost exactly (+0% vs +11/+28% before).
- **T4:** `init-qa` creates a clean M3 database with one admin and one evaluator in a single command.

| Check | Result |
|---|---|
| `uv run pytest -q` | **384 passed** (baseline 358; +26) |
| Guard `--cov=app.agents.guard --cov-branch --cov-fail-under=100` | 100% |
| `ruff check` / `ruff format --check` | clean |

| Task | Result | Commit |
|---|---|---|
| T1 | Serving provider per call, smoke column, `cost-report --by provider` (B-048, B-051) | `backend: phase 2d T1/T2 …` |
| T2 | Cached prompt tokens, cache-read prices, estimate (B-049, B-050) | same commit (shared files) |
| T3 | Provider measurement, pins, re-gate (B-053 … B-055) | `backend: phase 2d T3 …` |
| T4 | `init-qa` (B-052) | `backend: phase 2d T4 …` |
| T5 | This report, progress, decisions, README | this commit |

## 2. T1 — Serving provider

**Source field.** OpenRouter's API reference does not list a provider field. A real response (probe, 2026-09-30) has a **top-level `"provider": "DeepInfra"`**, which is the endpoint's `provider_name`, not its routing slug.
- It is parsed defensively: a missing, empty or non-string value gives `null`.
- It is stored per attempt in `llm_calls.provider`. Deadline-cut and transport-failed attempts are `null`.

The field is visible in three places:
- **Smoke table:** a `provider` column shows the provider of the last call of each step (`t1/t2/concl`). It collapses to one name when all steps agree, for example `Cerebras`, or `DekaLLM/Crusoe/Crusoe` when a fallback happened.
- **`--json`:** `provider` and `cached_prompt_tokens` per call, plus `step_providers` and `provider_order` per agent.
- **`cost-report --by provider`:** the key is `model / provider`. A session served by several providers is `A+B`, and one without any reported provider is `unknown`. The columns are the same as in the other groupings (B-051).

**What the 2d runs show per model** (22 smoke runs, every call traced):

| Model | Pinned provider asked for | Served by | Fallbacks seen |
|---|---|---|---|
| gpt-oss-120b | Cerebras (4 runs) | Cerebras 12/12 calls | none |
| gpt-oss-120b | Crusoe (4 runs) | Crusoe 11/12 | **run 1, B turn 1 → DekaLLM (44.2 s)** |
| gpt-oss-120b | BaseTen (4 runs) | BaseTen 12/12 | none |
| gpt-oss-120b | DeepInfra turbo (4 runs) | DeepInfra 11/12 | **A run 2 → CoreWeave** |
| DeepSeek 0813 | CoreWeave / Together / Wafer (2 runs each) | the candidate, 18/18 calls | none |

**Serving probe under `deny`** (one tiny request per endpoint with `order: [<tag>]`, ≈ USD 0.004 in total):
- **gpt-oss-120b:** 7 of 19 endpoints were answered by another provider, so `deny` excludes them: CoreWeave, DekaLLM, AkashML, Novita, Groq, Google Vertex, Mara. This explains part of the 6–40 s spread in 2b-2: unpinned routing lands on whichever eligible provider is next.
- **DeepSeek 0813:** DeepSeek's own endpoint and Alibaba are not served under `deny`.
- Raw data: `data/endpoints-*.json` and `data/2d-serve-probe.json`.

## 3. T2 — Cached prompt tokens and cache prices

- **Storage:** `usage.prompt_tokens_details.cached_tokens` → `llm_calls.cached_prompt_tokens`, with `sessions.total_cached_prompt_tokens` as the SQL sum over attempts. It is refreshed after every attempt.
- **Estimate:** `((prompt − cached) × input + cached × cache_read + completion × output) / 1e6`. It is unchanged when a model has no cache price or a call has no cached tokens. Cached tokens are capped at the prompt tokens.
- **`cost-report`:** adds `cached_prompt_tokens` (sum and mean) to every grouping.

**Cache prices** come from public `/models` on 2026-09-30, with `pricing.input_cache_read × 1e6`. Input and output prices are unchanged, and `as_of` stays `2026-09-30` because the re-read was on the same date (B-050).

| Model | Input $/1M | Cache read $/1M | Output $/1M |
|---|---|---|---|
| openai/gpt-5.4 | 2.5 | **0.25** | 15.0 |
| anthropic/claude-sonnet-5.5 | 2.0 | **0.2** | 10.0 |
| google/gemini-3.1-pro-preview | 2.0 | **0.2** | 12.0 |
| openai/gpt-5.4-mini | 0.75 | **0.075** | 4.5 |
| google/gemini-3-flash-preview | 0.5 | **0.05** | 3.0 |
| deepseek/deepseek-v4-pro-0813 | 1.32 | **0.044** | 3.96 |
| openai/gpt-oss-120b | 0.037 | — (not listed) | 0.17 |

**Offline re-comparison of phase 2b-2:** **not possible.** The stored `data/smoke-2b2-run{1,2}.json` (and 2b) files have no cached-token field, and no money was spent to regenerate them.

As a substitute, the same comparison on this phase's runs, which do carry cached tokens (sum over the 3 calls of each run, prices above):

| Run | Reported USD | Old estimate | New estimate |
|---|---|---|---|
| b-deepseekv4pro · CoreWeave r1 | 0.03699 | 0.04098 (+11%) | **0.03706 (+0%)** |
| b-deepseekv4pro · CoreWeave r2 | 0.03110 | 0.03995 (+28%) | **0.03113 (+0%)** |
| b-deepseekv4pro · Together r2 | 0.02005 | 0.02402 (+20%) | 0.01976 (−1%) |
| b-deepseekv4pro · Wafer r2 | 0.03300 | 0.04837 (+47%) | 0.03923 (+19%) |
| b-gptoss120b · Cerebras r1 | 0.00535 | 0.00079 (−85%) | 0.00079 (−85%) |

- Wafer's remaining gap is its own lower list price (0.2449 / 3.49).
- gpt-oss is **under**-estimated because Cerebras charges 0.35 / 0.75, while the `/models` snapshot (the cheapest provider) is 0.037 / 0.17. Prices are only taken from `/models` (B-042), so this was not changed; `cost-report` will flag it `>15%` (known issue 2).
- Cache hits were common. gpt-oss on Cerebras reused up to 7,552 of 9,958 prompt tokens in a run, and DeepSeek on CoreWeave up to 6,912 of 10,111.

## 4. T3 — Provider selection (D-041)

**Implementation (B-053).**
- A top-level `provider_order` map (model slug → provider slugs) in `agents.yaml` is copied into the agent config and the session snapshot.
- `OpenRouterClient` sends `provider: {data_collection: "deny", order: [...], allow_fallbacks: true}`. Without an order the body is unchanged.
- The registry rejects the map for any model other than gpt-oss-120b and DeepSeek 0813. It also rejects an empty list, and the key in `defaults` or in an agent entry.
- Tests cover the request body (order present with `deny`, no `order` otherwise, never `allow_fallbacks: false`), the registry rules, the snapshot, and a reload that does not change a running session.

**Candidate method.**
1. From `GET /api/v1/models/{author}/{slug}/endpoints`, keep endpoints that list both `response_format` and `reasoning` and have `status` 0.
2. Drop endpoints that the serving probe showed are not served under `deny`.
3. Rank by "fastest advertised" = p50 latency + 1,000 tokens ÷ p50 throughput (last 30 min).
4. Take the top 4 for gpt-oss and the top 3 for DeepSeek.

A run counts as **not served** if any answered call came from another provider. Every candidate ran twice through the temporary configs `smoke-test --agent … --config <copy with provider_order>`; the repo `agents.yaml` was not touched during the measurement.

### 4.1 gpt-oss-120b

Candidates (advertised, last 30 min; all support `response_format` and `reasoning`, context 128k–131k):

| Provider (slug) | Latency p50 | Throughput p50 | Est. 1k tokens | Price in/out $/1M |
|---|---|---|---|---|
| Cerebras (`cerebras/fp16`) | 227 ms | 669 tok/s | 1.7 s | 0.35 / 0.75 |
| Crusoe (`crusoe/bf16`) | 249 ms | 157 tok/s | 6.6 s | 0.05 / 0.25 |
| BaseTen (`baseten/fp4`) | 313 ms | 137 tok/s | 7.6 s | 0.10 / 0.50 |
| DeepInfra (`deepinfra/turbo`) | 407 ms | 125 tok/s | 8.4 s | 0.15 / 0.60 |

Other served endpoints were not measured (at most 4 by the rules). They were Phala, Parasail, Together, Mancer 2 and DeepInfra bf16, plus Nebius, SiliconFlow and DeepInfra fp8 with a degraded status.

Measured runs (turns t1 · t2 · conclude in s; cost = reported, per run):

| Candidate | Agent | Run 1 | Run 2 | Served | Repairs | Cost r1 / r2 USD |
|---|---|---|---|---|---|---|
| **Cerebras** | b-gptoss120b | ✅ 2.4 · 3.5 · 3.9 | ✅ 2.6 · 3.6 · 3.4 | ✓ / ✓ | 0 / 0 | 0.00535 / 0.00568 |
| Cerebras | a-gptoss120b | ✅ 2.0 · 3.2 · 3.6 | ✅ 2.3 · 4.0 · 3.3 | ✓ / ✓ | 0 / 0 | 0.00349 / 0.00357 |
| Crusoe | b-gptoss120b | ✅ **44.2** · 8.9 · 9.9 | ✅ 6.9 · 8.1 · 10.8 | **✗ (DekaLLM)** / ✓ | 0 / 0 | 0.00110 / 0.00121 |
| Crusoe | a-gptoss120b | ✅ 2.5 · 4.0 · 7.3 | ✅ 2.8 · 3.6 · 9.7 | ✓ / ✓ | 0 / 0 | 0.00061 / 0.00066 |
| BaseTen | b-gptoss120b | ✅ 6.6 · 12.8 · 8.6 | ✅ 9.2 · 12.5 · 12.6 | ✓ / ✓ | 0 / 0 | 0.00228 / 0.00246 |
| BaseTen | a-gptoss120b | ✅ 4.7 · 5.8 · 9.8 | ❌ 2.4 · 3.6 · 3.9 (invalid_output) | ✓ / ✓ | 0 / 0 | 0.00129 / 0.00092 |
| DeepInfra turbo | b-gptoss120b | ✅ 6.0 · 10.4 · 13.0 | ✅ 6.4 · 7.0 · 9.7 | ✓ / ✓ | 0 / 0 | 0.00294 / 0.00308 |
| DeepInfra turbo | a-gptoss120b | ❌ 4.3 · 7.2 · 8.7 (invalid_output) | ✅ 3.9 · 3.9 · 7.6 | ✓ / **✗ (CoreWeave)** | 0 / 0 | 0.00131 / 0.00145 |

The A failures are `AgentOutputError: model returned action 'ask' after being told to conclude`, the same pattern as `a-gemini3flash` in 2b-2.

**Rule outcome** (`b-gptoss120b` must pass both runs; lowest p50 over its 6 turns, nearest-rank):

| Candidate | Qualifies | p50 | p90 | max |
|---|---|---|---|---|
| **Cerebras** | ✓ | **3.4** | 3.9 | 3.9 |
| DeepInfra turbo | ✓ | 7.0 | 13.0 | 13.0 |
| BaseTen | ✓ | 9.2 | 12.8 | 12.8 |
| Crusoe | ✗ (run 1 not served) | 8.9 | 44.2 | 44.2 |

→ **`provider_order: [cerebras/fp16]`**. Cerebras honors `reasoning`: 58–139 reasoning tokens per call. DeepInfra's variants all report as `DeepInfra`, so a fallback from `turbo` to another DeepInfra endpoint would not be visible. It did not win, so this does not matter here.

**Re-gate (D-036, B-055):** conclusion ✅ in both Cerebras runs, every turn ≤ 3.9 s (≤ 75 s) → `b-gptoss120b` is **`enabled: true`** with the comment `# D-036 gate re-check: passed with provider Cerebras (B-055)`.
- Its D-037 figures are p50 3.4 s and p90 3.9 s, against B targets of 20 / 45.
- It is now the fastest B agent, compared with p50 29.1 s and a 50 s cut in 2b-2.
- `a-gptoss120b` stays disabled (D-012).

### 4.2 DeepSeek V4 Pro 0813 (`b-deepseekv4pro`)

| Provider (slug) | Advertised latency / throughput | Price in/out $/1M | Run 1 (s) | Run 2 (s) | p50 | Reasoning tokens per call | Cost r1 / r2 USD |
|---|---|---|---|---|---|---|---|
| CoreWeave (`coreweave/fp8`) | 594 ms / 116 tok/s | 1.31 / 3.96 | ✅ 12.8 · 18.7 · 16.6 | ✅ 8.8 · 15.1 · 18.2 | **15.1** | 800–2,341 | 0.0370 / 0.0311 |
| Together (`together`) | 909 ms / 113 tok/s | 1.32 / 3.96 | ✅ 5.6 · 6.5 · 9.5 | ✅ 5.4 · 5.9 · 8.5 | 5.9 | **0 (all 6 calls)** | 0.0255 / 0.0201 |
| Wafer (`wafer`) | 587 ms / 107 tok/s | 0.245 / 3.49 | ✅ 12.8 · 19.8 · 29.7 | ✅ 16.5 · 14.2 · 27.0 | 16.5 | 939–2,815 | 0.0292 / 0.0330 |
| *(2b-2, unpinned)* | | | | | *29.6* | *928–3,801* | *0.0400 / 0.0381* |

- **Rule:** pin only if a candidate passes both runs and its p50 is ≥ 25% below 29.6 s, i.e. ≤ 22.2 s. All three qualify on the numbers.
- **Decision (B-054):** Together's speed comes from **not reasoning at all**, although the request asks for `reasoning.effort: minimal`: it produced about ⅓ of the output tokens and no reasoning tokens. That fails the T3 step-2 criterion (support for `reasoning`) and the premise of D-041 (the provider changes infrastructure, not the model). Among the providers that do reason, **CoreWeave** has the lowest p50 → **`provider_order: [coreweave/fp8]`**.
- **Effect:** `b-deepseekv4pro` now meets the D-037 B targets (p50 15.1 s ≤ 20, p90 18.7 s ≤ 45). Its conclusions stayed sensible, but it still re-asks the pain location in turn 2 (D-043).
- **Alternative:** if the product owner prefers speed and accepts a non-reasoning DeepSeek, change that line to `[together]` (p50 5.9 s).

## 5. T4 — `init-qa`

```powershell
# backend/ on the host: line 1 = admin password, line 2 = evaluator password
"admin-password-1", "evaluator-password-1" | uv run python -m app.cli init-qa --admin admin --evaluator dr.qa
# an existing data/lab.db is refused; --force moves it (and -wal/-shm) to data/archive/<timestamp>/ first
"admin-password-1", "evaluator-password-1" | uv run python -m app.cli init-qa --admin admin --evaluator dr.qa --force

# Docker Compose (repository root), backend stopped so the file is free
docker compose stop backend
"admin-password-1", "evaluator-password-1" | docker compose run --rm -T backend uv run python -m app.cli init-qa --admin admin --evaluator dr.qa --force
docker compose up -d
```

- **Order of work:** the command validates usernames (non-empty, different), both passwords (≥ 8 chars) and the agents file before touching anything. It then archives the old files (only with `--force`), creates the schema, syncs the agents and creates the two users.
- **Output:** it prints the enabled agents as `display name  id` for the QA assignment step.
- **Tests:** 8 tests cover refusal, `--force` archive and recreate, roles and passwords, the printed list matching `enabled`, and "invalid input changes nothing".
- **Manual check:** with a real PowerShell pipe on a scratch path, the first run printed the 8 then-enabled agents and exit 0; the second run was refused with exit 1. **It was not run against `data/lab.db`.**
- **Current list:** with the committed config it prints 9 agents, «دکتر ۱» … «دکتر ۸» and «دکتر ۱۳».

## 6. New decisions

- **B-048:** the provider field and smoke output.
- **B-049:** cached tokens and the estimate.
- **B-050:** cache prices.
- **B-051:** `cost-report --by provider`.
- **B-052:** `init-qa`.
- **B-053:** the registry design, the candidate method and the gpt-oss outcome.
- **B-054:** the DeepSeek outcome and the Together exclusion.
- **B-055:** the re-gate, plus the unchanged gpt-oss price.

## 7. Known issues

1. **All databases created before this phase are refused** (new columns; the message now says "older than the current schema"). Start M3 with `init-qa`. The dev server's `data/dev.db` needs a new file too.
2. **gpt-oss estimate under the reported cost** (≈ −85%): Cerebras charges about 10× the `/models` list price. The reported cost stays the truth (D-035). M3 cost for `b-gptoss120b` is about USD 0.005–0.006 per short triage, still roughly 10× cheaper than the frontier B agents.
3. **Fallbacks remain possible** (`allow_fallbacks: true`, as D-041 requires). Two of 16 gpt-oss runs on non-winning candidates fell back, once with a 44 s turn. For Cerebras, 12/12 calls were served by Cerebras. The provider column in `llm_calls` makes any fallback in M3 visible (`cost-report --by provider`).
4. **Provider variants are indistinguishable:** the response names the provider (`DeepInfra`), not the endpoint variant (`turbo`/`bf16`/`fp8`).
5. **`a-gptoss120b` (disabled)** still echoes the patient or returns an empty `patient_message` (Cerebras run 1 / run 2) and sometimes ignores the forced conclusion. This is for the prompt-v2 phase (D-043).
6. **Unmeasured:** longer M3 sessions, agent-concluded B turns, and provider behavior over days. The endpoint statistics change every 30 minutes.
7. `docs/BACKEND_ARCHITECTURE.md` still has uncommitted product-owner edits. They were left out of all `backend:` commits; one early 2d commit included them and was redone at once, before anything else happened.

## 8. Next steps (M3)

1. Product owner: confirm or override the DeepSeek choice (CoreWeave with reasoning vs Together without reasoning, B-054).
2. Rotate the OpenRouter key and `JWT_SECRET` (M2 report §5.6). Then run `init-qa` on the target host and start M3 per `docs/qa/M3-qa-protocol.md` with the 9 agents.
3. During M3:
   - `cost-report --by provider` to see fallbacks;
   - `cost-report --by agent` for the real cost per triage;
   - watch `b-gptoss120b`'s Persian quality (2b-2 §8) and DeepSeek's repeated questions.
