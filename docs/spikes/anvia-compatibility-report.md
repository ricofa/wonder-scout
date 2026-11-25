# Anvia Compatibility Spike — Report

> **TDD reference:** §2.3 (mandatory M1 entry/exit gate), §12.1 item 2
> **Revisions:** Prompt 02: Anvia Core + OpenAI-compatible adapter, one Agent, one Pipeline, Devscale Gateway model (§2–§9). **Prompt 03:** MCP producer/consumer, real Agent tool calling, per-run timeout and tool-call limit (§10). **Prompt 04:** Anvia Lens tracing and Evals (§11). Earlier findings are preserved; later sections note any contract change.
> **Executed:** 2026-11-24, WSL2 Linux x64. All results below come from commands actually run; nothing is marked PASS without execution evidence.
> **Data:** synthetic only (`SYN-###` fictional players). No real football data, no credentials in this document.

## 1. Summary

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Node.js / pnpm / ESM / script commands | **PASS** | §2, §5.1 |
| 2 | `@anvia/core` + `@anvia/openai` install, peer-dependency resolution | **PASS** | §3 |
| 3 | TypeScript 7.0.2 strict, `skipLibCheck: false` against Anvia declarations | **PASS** | §5.1 |
| 4 | Real Chat Completion — raw HTTP to Devscale Gateway | **PASS** | §5.2 |
| 5 | Real Chat Completion — through `@anvia/openai` adapter (`api: "chat"`) | **PASS** | §5.3 test 2 |
| 6 | Anvia Agent invocation (plain text) | **PASS** | §5.3 test 3 |
| 7 | Synthetic scouting Agent — structured output, local Zod validation | **PASS** | §5.3 test 4 |
| 8 | Anvia Pipeline — input → deterministic step → Agent → validated output | **PASS** | §5.3 test 7, §5.4 |
| 9 | Invalid input rejected before any stage / model call | **PASS** | §5.1 offline tests |
| 10 | Invalid model response handled (local schema rule, truncation) | **PASS** | §5.3 tests 5–6 |
| 11 | Provider failure propagation through Pipeline (HTTP 401, HTTP 400) | **PASS** | §5.3 tests 8–9 |
| 12 | Credentials never printed/committed | **PASS** | §5.5 |
| 13 | **Provider-enforced** structured output (`response_format: json_schema, strict`) as a guarantee | **FAIL** | §6.1 |
| 14 | `@anvia/mcp` + `@modelcontextprotocol/server` v2 install, peers, TS 7 `skipLibCheck: false` | **PASS** | §10.1 |
| 15 | MCP stdio handshake (pinned protocol `2026-07-28`) + tool discovery | **PASS** | §10.3 |
| 16 | MCP valid call / malformed + missing input / unknown ID / internal failure | **PASS** | §10.3 |
| 17 | MCP clean disconnect, child processes exit; no `OPENAI_*` in child env | **PASS** | §10.3 |
| 18 | **Real Agent tool calling** — `deepseek-v4.1-flash` invokes the MCP tool and consumes the genuine result | **PASS** | §10.4 |
| 19 | Failing MCP tool during a real Agent run: error surfaced, data not used | **PASS** | §10.4 |
| 20 | Max 5 tool calls per run enforced by code; 6th rejected before execution (scripted + real model) | **PASS** | §10.5 |
| 21 | Per-run timeout with real cancellation (model HTTP request + in-flight MCP call) and cleanup | **PASS** | §10.5 |
| 22 | Prompt 02 offline + live suites still pass after Prompt 03 changes | **PASS** | §10.6 |
| 23 | `@anvia/lens` install (14-day policy), peers, TS 7 `skipLibCheck: false` | **PASS** | §11.1 |
| 24 | Lens: successful Pipeline run → **one linked trace** (Pipeline → Agent run → model turns + MCP tool span), real model | **PASS** (exported OTLP verified at a local receiver) | §11.3 |
| 25 | Lens: failed Pipeline runs (provider 401; fabricated number; failing MCP tool) → linked traces with error status | **PASS** (local receiver) | §11.3 |
| 26 | Lens: safe capture + redaction; no secrets in exported payloads | **PASS** | §11.3 |
| 27 | Lens: batched export flushed on `close()` (0 spans before, all after) | **PASS** | §11.3 |
| 28 | Lens: ingestion in an **actual Anvia Lens backend** (self-hosted v0.19.0 at `localhost:3080`): 3 successful + 3 failed Pipeline traces stored with linked spans, redaction and flush | **PASS** (storage verified in ClickHouse; visual check in the dashboard UI pending) | §12 |
| 29 | Evals: deterministic case verifying real MCP execution + matching `evidenceRefs`, real model, **exit 0** | **PASS** | §11.4 |
| 30 | Evals: deliberately wrong expected value → metric fail, **exit 1** | **PASS** | §11.4 |
| 31 | Qdrant (`qdrant/qdrant:v1.20.0`, digest-pinned) local-only, persistent volume, auth enforced, health green | **PASS** | §14.2 |
| 32 | Embeddings: `@anvia/transformers` + `Xenova/all-MiniLM-L6-v2`, 384-dim, mean-pooled, normalized (real model) | **PASS** | §14.3 |
| 33 | Synthetic knowledge ingested via `@anvia/qdrant` into dedicated collection; deterministic IDs; re-ingest idempotent | **PASS** | §14.4, §14.5 |
| 34 | Semantic retrieval: expected documents in top-3 for 4 fixed queries; `roleId` metadata filter; metadata preserved | **PASS** | §14.5 |
| 35 | Dimension mismatch rejected (upsert and query); Qdrant connection failure surfaced | **PASS** | §14.5 |
| 36 | Qdrant payload indexes for filter fields (TDD §6.2) | **NOT DONE** | §14.7 |

**Gate status (after Prompt 04B.3):** the Agent, Pipeline, model, MCP/tool-calling, **Lens instrumentation** (now delivered to the real self-hosted backend, §12), and **Evals** portions of §2.3 are **PASS**. One item keeps the full §2.3 gate **open**:
- **Qdrant:** still **PENDING**.
- **Dashboard visual check:** the traces are stored in the backend, but the Lens dashboard UI was not inspected in a browser (see §12.4).

**Gate status (after Prompt 04C):** Studio integration (§13) is **PASS at the API level**: the existing Agent and Pipeline are registered, run through Devscale, and show traces, errors and MCP discovery in Studio's endpoints. The Studio UI was **not visually inspected** (no browser tool was available in this session), so it is not claimed as verified. Qdrant remains **PENDING**.

**Gate status (after Prompt 06, final compatibility verification):** technical gate **PASS**; see §15. Two UI checks (Lens dashboard, Studio playground) are **PENDING USER VERIFICATION** and are not counted as PASS.

**Gate status (after Prompt 05):** Qdrant and the embedding adapter (§14) are **PASS** for local vector storage, real embeddings, ingestion, retrieval and failure handling at the spike's synthetic scale. Still open: payload indexes (row 36), the Lens dashboard and Studio UI visual checks, and the full 14-document knowledge base (out of scope for this spike).

## 2. Environment

| Item | Value |
|---|---|
| Node.js | `v26.13.1` (`node --version`); repo floor `engines.node >=24`; `.nvmrc` = `26.13.1` |
| pnpm | `12.10.1` (`pnpm --version`); `packageManager: pnpm@12.10.1` |
| TypeScript | `7.0.2` (`pnpm exec tsc --version`) |
| Module format | ESM (`"type": "module"`), `module`/`moduleResolution: NodeNext`, `verbatimModuleSyntax` |
| Strictness | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, **`skipLibCheck: false`** |
| OS | Linux x64 (WSL2 6.6.87.2) |

## 3. Installed dependency versions (from `pnpm-lock.yaml`)

| Package | Version | Role | Notes |
|---|---|---|---|
| `@anvia/core` | **1.18.0** | Agent, Pipeline, structured output | peer `zod ^4.6.7` ✔; optional peer `@valibot/to-json-schema` not needed |
| `@anvia/openai` | **1.3.8** | OpenAI-compatible adapter | peer `@anvia/core ^1.18.0` ✔ |
| `openai` (transitive) | 7.55.0 | HTTP SDK used by the adapter | |
| `yaml` (transitive) | 2.9.1 | dep of core | |
| `zod` | 4.6.7 | schemas | single copy (`pnpm why zod`) |
| `vitest` | 5.1.0 | tests | `vite` 8.3.7 (transitive) |
| `@types/node` | 24.19.2 | Node 24 API surface | |

`pnpm install` reported no peer-dependency warnings or conflicts.

**Version selection policy (decision):** `pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (14 days), applied to direct **and transitive** dependencies. On 2026-11-24 the newest releases were `@anvia/core@1.23.0` (published that day) and `@anvia/openai@1.4.1` (1 day old); both packages release almost daily. The policy resolved `@anvia/core@1.18.0` + `@anvia/openai@1.3.8` (both 2026-11-06). Enabling it required regenerating the Prompt 01 lockfile, since several transitive entries (e.g. `vite@8.3.8`, `postcss@8.5.33`) were younger than 14 days. They were re-resolved to older versions, and typecheck/build/tests were re-verified. **Upgrading to newer Anvia releases needs a deliberate re-run of this spike.**

## 4. Model configuration

| Item | Value |
|---|---|
| Provider | Devscale Gateway (OpenAI-compatible) |
| Base URL | `https://gateway.devscale.id/v1` |
| Model ID | `deepseek-v4.1-flash` (exact; no substitution or fallback in code) |
| Adapter | `@anvia/openai` → `new OpenAIClient({ apiKey, baseUrl }).completionModel({ modelId, api: "chat" })` |
| Credentials | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL_ID` from the gitignored repo-root `.env`, validated by Zod (`src/model-config.ts`). Errors name invalid variables only, never values. |

Note: `@anvia/openai` types `modelId` as `KnownOpenAICompletionModelId | (string & {})`, so a non-OpenAI ID type-checks without casts. Reasoning controls are typed only for OpenAI model IDs, so `deepseek-v4.1-flash` gets no typed `reasoningEffort` control.

## 5. Commands executed and observed results

All commands run from the repo root unless noted (`cd spikes/anvia-compat` for package scripts).

### 5.1 Install, typecheck, build, offline tests

| Command | Observed result |
|---|---|
| `pnpm --filter @wonderscout/anvia-compat-spike add @anvia/core @anvia/openai` (with cooldown) | `@anvia/core 1.18.0`, `@anvia/openai 1.3.8` added; exit 0 |
| `rm -rf node_modules …/node_modules …/dist && pnpm install --frozen-lockfile` | `Done in 277ms`; exit 0 |
| `pnpm verify` (= typecheck → build → test) | typecheck `Done`; build exit 0; **16/16 tests passed**; exit 0 |

Offline suite (`pnpm test`, no network, CI-safe): 4 files / 16 tests.
- `test/env.test.ts` (3): env flags default false, invalid values rejected.
- `test/preprocess.test.ts` (5): deterministic filtering + per-90 values, determinism, evidence check rejects invented player `SYN-999` and altered numbers, Zod rejects malformed agent output.
- `test/pipeline-input.test.ts` (7): **typed Pipeline** (`expectTypeOf`: input = `ScoutingRequestInput`, output = `ScoutingResult`); stage graph contains `step:preprocess`, `parallel:assess`, `agent:scouting-agent`, `step:validate-output`; four invalid inputs (`dataset: "real"`, non-`SYN-` ID, inverted age range, age > 25) each reject with `ZodError` → `InvalidInputError`, and the observer confirms **neither `preprocess` nor `scouting-agent` started** (the model endpoint is a dead local port, so any model call would have failed differently); config errors don't echo the key.
- `test/redact.test.ts` (1): redaction of configured secrets, `Bearer …`, `sk-…`.

**TypeScript 7 finding:** `tsc 7.0.2` with `skipLibCheck: false` type-checks all `@anvia/core@1.18.0` and `@anvia/openai@1.3.8` declaration files (including the bundled `openai` types) with **zero errors**. The only error during development was in my own test code (accessing a non-existent `CompletionResult.choice`; the correct field is `.text`), which the compiler caught. **No downgrade needed.**

### 5.2 Raw gateway probe (no Anvia) — `pnpm probe:gateway`

| Probe | HTTP | Observation |
|---|---|---|
| `GET /models` | 200 | 42 models; `deepseek-v4.1-flash` present |
| chat, basic | 200 | `"OK"`, `finish_reason: stop`; ~1.5–2.6 s |
| chat, `response_format: json_object` | 200 | `{"ok": true}` |
| chat, `response_format: json_schema strict`, `max_tokens: 200` | 200 | **empty content, `finish_reason: length`**: all 200 tokens went to reasoning |
| chat, `json_schema strict` + conflicting prompt, `max_tokens: 2000` | 200 | **prose `"The weather is nice."` — schema NOT enforced** (see §6.1) |
| chat, `reasoning_effort: "low"` | 200 | accepted; reasoning tokens still used (13 of 15) |
| chat, unknown model ID | **400** | `invalid_request_error`, "Unknown model. Call /v1/models…" |
| chat, invalid key | **401** | `auth_error`, "Invalid API key…" |

### 5.3 Live suite through Anvia — `pnpm test:live`

Real requests to the gateway, **no mocks**. Run three times, **9/9 passed** each time (exit 0). Final run, verbose with logs (`vitest run --config vitest.live.config.ts --silent=false --reporter=verbose`):

| # | Test | Result | Observed |
|---|---|---|---|
| 1 | exact model ID / base URL from env | PASS | `deepseek-v4.1-flash`, `https://gateway.devscale.id/v1` |
| 2 | real chat completion via `generateCompletion` + adapter | PASS | `text: "OK"`, `finishReason: stop`, 35 in / 14 out tokens (11 reasoning); 2.1 s (68 s in one earlier run, see §6.3) |
| 3 | plain-text `Agent.generate()` | PASS | `type: "response"`, non-empty output; 4.0 s |
| 4 | scouting Agent structured output | PASS | `verdict: candidates_found`; ranked SYN-003, SYN-001, SYN-002; all cited values equal engine values (e.g. SYN-003 `progressivePassesPer90: 9.5`); 460 in / 656 out tokens (301 reasoning); 5.9 s |
| 5 | schema-valid provider JSON failing a **local-only** Zod refinement | PASS | `InvalidAgentOutputError: rejected during schema after 2 attempt(s)` |
| 6 | truncated real response (`maxTokens: 16`) | PASS | `InvalidAgentOutputError: rejected during truncated after 2 attempt(s)` |
| 7 | Pipeline end-to-end | PASS | `ScoutingResultSchema` re-parse equal; stage order `preprocess` → `scouting-agent` → `validate-output`; `excluded`: SYN-004 (age 24), SYN-005 (300 min), SYN-006 (FWD); 5.2 s |
| 8 | Pipeline with invalid key | PASS | `ProviderError (HTTP 401)`; `stage_failed:scouting-agent`; `validate-output` never started; message contains neither the test key nor the real key; 70 ms (no retry) |
| 9 | Pipeline with unknown model | PASS | `ProviderError (HTTP 400)`: "Unknown model…"; no fallback model; 62 ms |

### 5.4 Demo — `pnpm demo:pipeline`

Exit 0. `model: deepseek-v4.1-flash`, `runId: 077ddf09-995c-4eb7-8166-50d7506ecc39`, 5.7 s, `verdict: candidates_found`, SYN-004 correctly excluded (age 24).

### 5.5 Secret handling

- `.env` is gitignored (`git check-ignore -v .env` → `.gitignore:8`) and not tracked.
- The configured key was searched verbatim in every captured live-run log: **0 occurrences**.
- Provider errors are rebuilt as `ProviderError` with a redacted message, and the SDK error `cause` is dropped on purpose because SDK errors can carry request metadata.

## 6. Capability findings and limitations

### 6.1 Provider-enforced vs local structured output — **important**

With an Agent `outputSchema`, `@anvia/openai` (chat API) sends `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Anvia Core then **independently** JSON-parses and `schema.parse()`s the reply locally, raising `AgentStructuredOutputError` (`phase: parse | schema | truncated | content-filter`). It re-asks the model when `retries.maxAttempts > 1`.

Gateway behaviour for `json_schema strict`, measured with raw requests (`pnpm probe:structured`, `N` trials per case):

| Case | Trials → schema-conforming JSON |
|---|---|
| user prompt asks for prose, schema `{ok: boolean}` | 1 + 5 + 15 + 5 trials → **25/26** (first probe returned prose) |
| system prompt forbids JSON, schema `{digest: /^[0-9a-f]{64}$/}` | run A **5/5**, run B **1/5**, run C **0/5** |

**Conclusion:** the gateway *accepts* `json_schema` (HTTP 200, no unsupported-parameter error) but **does not reliably enforce it**. Enforcement varies between runs of the same request (possibly upstream routing; not confirmed). Therefore:

- **Provider-enforced structured output: FAIL as a guarantee.** Do not rely on it.
- **Local Zod validation (Anvia `outputSchema` + our pipeline `validate-output` step): PASS.** It is the actual guarantee. Every Agent output is parsed locally, and the Pipeline additionally re-validates with `ScoutingResultSchema` and checks every cited player ID and number against the deterministic step (`assertEvidenceMatches`), in line with the TDD invariant that the LLM never produces statistics.
- The scouting Agent's instructions also spell out the exact JSON shape, so the prompt and the schema agree. In all live runs it produced valid output on the first or second attempt.

### 6.2 Reasoning-token budget

`deepseek-v4.1-flash` emits reasoning tokens (reported as `output_reasoning_tokens`) counted against `max_tokens`. With small budgets, the content can be **empty with `finish_reason: length`** (seen at `max_tokens: 200` raw, and deliberately at `maxTokens: 16` in test 6). The scouting Agent uses `maxTokens: 4000`. `reasoning_effort: "low"` is accepted by the gateway but did not stop reasoning. The adapter exposes no typed reasoning control for non-OpenAI model IDs.

### 6.3 Latency

Most calls took 2–6 s. One live run saw a **68 s** latency for a trivial completion, while other runs of the same test took ~2 s. ~~The Agent has no explicit timeout yet.~~ **Resolved in Prompt 03:** `runAgentWithLimits` enforces a per-run timeout with real cancellation (§10.5).

### 6.4 Retry policy

The Agent uses `retries: { maxAttempts: 2, shouldRetry: error instanceof AgentStructuredOutputError }`, so it retries only structured-output failures. Auth/model errors fail fast (401 in 70 ms, 400 in 62 ms, one HTTP call each). The adapter itself sets `maxRetries: 0` on the OpenAI SDK.

### 6.5 Pipeline design note

`Pipeline.agent()` replaces the stage value with the Agent output, and `PipelineStageContext` exposes only the current value. To keep the deterministic data available for post-Agent evidence validation, the Pipeline uses a typed `parallel` stage with a pass-through `prepared` branch and an `assessment` branch containing the `.agent(...)` stage. The resulting types are inferred end-to-end without casts.

## 7. Implementation (spike only — not production code)

`spikes/anvia-compat/`

| File | Purpose |
|---|---|
| `src/model-config.ts` | Zod-validated `OPENAI_*` config; `createChatModel()` (`api: "chat"`) |
| `src/schemas.ts` | `ScoutingRequestSchema` (synthetic-only), `PreparedBriefSchema`, `ScoutingAssessmentSchema` (Agent output), `ScoutingResultSchema` |
| `src/preprocess.ts` | deterministic filter + per-90 (`prepareBrief`); evidence check (`assertEvidenceMatches`) |
| `src/agent.ts` | the single synthetic Agent (`synthetic-scouting-agent`) |
| `src/pipeline.ts` | the single typed Pipeline (`synthetic-scouting-pipeline`) |
| `src/errors.ts` | `InvalidInputError`, `ProviderError`, `InvalidAgentOutputError`, `EvidenceValidationError`, `toSpikeError()` |
| `src/redact.ts` | secret redaction |
| `src/scripts/probe-gateway.ts` | raw HTTP capability probe |
| `src/scripts/probe-structured-output.ts` | repeated `json_schema` enforcement probe |
| `src/scripts/run-pipeline.ts` | one live Pipeline run |
| `test/*.test.ts` | offline suite (16 tests) |
| `test/live/devscale.live.test.ts` | live suite (9 tests) |
| `vitest.live.config.ts` | live config; loads repo-root `.env` |

### Reproduction

```sh
pnpm install --frozen-lockfile
pnpm verify                              # typecheck + build + offline tests (no network)
pnpm test:live                           # real gateway calls; needs OPENAI_* in .env
cd spikes/anvia-compat
pnpm probe:gateway                       # raw HTTP capability probe (after build)
N=5 pnpm probe:structured                # json_schema enforcement probe
pnpm demo:pipeline                       # one live Pipeline run
```

## 8. Remaining blockers and open items

| Item | Status |
|---|---|
| MCP (`@anvia/mcp` + `@modelcontextprotocol/server` v2) handshake, typed tool call, malformed call, failing call | **PASS** (Prompt 03, §10.3) |
| Agent + MCP tool calling on `deepseek-v4.1-flash` through the gateway (TDD §2.3 step 4) | **PASS** (Prompt 03, §10.4) |
| Tool-count enforcement (max 5) | **PASS** at Agent-run level (§10.5). Not yet wired into the Pipeline's agent stage (see §10.7) |
| Per-run timeout on Agent calls | **PASS** (§10.5) |
| `@anvia/lens` linked Pipeline + Agent trace | **PASS** for client instrumentation and exported payloads (§11.3); **BLOCKED** for a real Lens backend (§11.6) |
| `@anvia/core/evals` one deterministic case + deliberate failure | **PASS** (§11.4) |
| Qdrant + embedding adapter | **PENDING** — embedding model not selected |
| Provider-enforced structured output | **FAIL** — mitigated by mandatory local validation (§6.1); not a blocker |
| Cost per run | not measured — gateway pricing not retrieved |
| Anvia upgrade cadence (near-daily releases) | each upgrade must re-run `pnpm verify && pnpm test:live` |

## 9. Sign-off

| Role | Decision | Date |
|---|---|---|
| Engineering (spike executor) | Prompt 02: Agent/Pipeline/model portion **PASS**; full §2.3 gate **open** | 2026-11-24 |
| Engineering (spike executor) | Prompt 03: MCP transport + real Agent tool calling + timeout/limit **PASS**; full §2.3 gate **open** (Lens, Evals, Qdrant) | 2026-11-24 |
| Engineering (spike executor) | Prompt 04: Lens instrumentation (linked traces, redaction, flush; local OTLP receiver) **PASS**; real Lens backend **BLOCKED**; Evals pass/fail exit codes **PASS**; full §2.3 gate **open** (Lens backend, Qdrant) | 2026-11-24 |
| Engineering (spike executor) | Prompt 04B.3: real self-hosted Lens backend accepts linked Pipeline traces (success + failure), redaction and flush **PASS**; dashboard UI visual check pending; Qdrant **PENDING** | 2026-11-25 |
| Engineering (spike executor) | Prompt 04C: Studio registers the existing Agent and Pipeline; API-level runs, MCP discovery/invocation, traces and errors **PASS**; Studio UI not visually inspected (no browser available); Qdrant **PENDING** | 2026-11-25 |
| Product/technical approver | _pending_ | |

---

## 10. Prompt 03 — MCP integration and Agent tool calling

### 10.1 Dependencies (14-day release-age policy respected)

| Package | Version | Published | Peers / deps | Notes |
|---|---|---|---|---|
| `@anvia/mcp` | **1.2.7** | 2026-11-06 | peer `@anvia/core ^1.18.0` ✔ (installed 1.18.0); deps `@modelcontextprotocol/client ^2.4.0`, `undici ^8.12.4` | newest is 1.2.8 (2026-11-23), excluded by policy; it would need `@anvia/core ^1.21.0` |
| `@modelcontextprotocol/server` | **2.4.0** | 2026-10-23 | dep `@modelcontextprotocol/core 2.4.0`, `zod ^4.2.0` (deduped to 4.6.7) | official MCP TypeScript SDK v2 |
| `@modelcontextprotocol/client` (transitive) | 2.4.0 | 2026-10-23 | | used by `@anvia/mcp` |
| `@modelcontextprotocol/core` (transitive) | 2.4.0 | | | single copy |
| `undici` (transitive) | 8.12.4 | | | |

`@anvia/core` 1.18.0, `@anvia/openai` 1.3.8, TypeScript 7.0.2, Node 26.13.1 and `zod` 4.6.7 are **unchanged**, so nothing was downgraded or upgraded. The install printed `✓ Lockfile passes supply-chain policies` with no peer warnings, and `pnpm why zod` reports a single copy.

**TypeScript 7:** `tsc 7.0.2` with `skipLibCheck: false` type-checks the `@anvia/mcp`, `@modelcontextprotocol/server` (`.d.mts`), `@modelcontextprotocol/client` and `core` declarations with **zero errors**. The v2 SDK README requires `"types": ["node"]`, which `tsconfig.base.json` already sets.

### 10.2 Implementation (spike only)

| File | Purpose |
|---|---|
| `src/mcp/fixtures.ts` | fictional players `SYN-101…106`; `SYN-500` = simulated failure; `SYN-900` = slow (cancellation tests) |
| `src/mcp/server.ts` | `McpServer` with exactly one tool, `get_demo_player_stats` (Zod `inputSchema` `{ playerId: /^SYN-\d{3}$/ }`, annotations `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false`). Returns `{ dataset, verificationId, player }`. Unknown ID → `isError` result. `SYN-500` throws. `SYN-900` waits on `ctx.mcpReq.signal`. Optional JSONL invocation log for independent evidence |
| `src/mcp/stdio-server.ts` | stdio entry (`serveStdio`); reads `MCP_VERIFICATION_ID`, `MCP_INVOCATION_LOG`, `MCP_SLOW_DELAY_MS`; shuts down on stdin end / SIGTERM |
| `src/mcp/client.ts` | `McpClient` stdio transport launching `node dist/mcp/stdio-server.js` with an **explicit minimal env** (`PATH` + `MCP_*` only); `withDemoMcp()` always closes the connection |
| `src/mcp/evidence.ts` | `extractToolInvocations(messages)` reads tool calls and genuine results from the run history; `assertToolEvidence()` checks every candidate came from a successful tool result, cited numbers equal the tool's, and `evidenceRefs` holds the tool's `verificationId` (and nothing else) |
| `src/runtime.ts` | `runAgentWithLimits()`: per-run timeout (AbortController → model request + MCP call) and `createToolCallBudget()` (max 5) via a per-run `onToolInput` middleware; errors `RunTimeoutError`, `ToolCallLimitExceededError` |
| `src/agent.ts` (changed) | the **same** single Agent. New options `mcpServers` and `maxTurns` (default 2 without tools, 8 with). The model parameter is widened to `CompletionModel`. Instructions extended for tool-sourced data and `evidenceRefs`. `buildToolLookupPrompt()` sends only IDs |
| `src/schemas.ts` (changed) | `ScoutingAssessmentSchema` gains required `evidenceRefs: string[]` (PRD output contract `evidence_refs[]`) |
| `test/mcp-transport.test.ts` | MCP over real stdio, no model (8 tests) |
| `test/runtime-limits.test.ts` | real MCP server + scripted model: limit, timeout and evidence checks (7 tests) |
| `test/helpers/scripted-model.ts` | deterministic `CompletionModel`, **used only for offline control-mechanics tests, not for compatibility approval** |
| `test/live/mcp-agent.live.test.ts` | real model + real MCP (4 tests) |

Package scripts `test` and `test:live` now build first (`tsc -p tsconfig.build.json && vitest run …`), because the MCP client launches the compiled server from `dist/`.

**No new Agent or Workflow was created.** The Prompt 02 Agent (`synthetic-scouting-agent`) and Pipeline (`synthetic-scouting-pipeline`) are reused. Test-only probe Agents from Prompt 02 (`plain-probe`, `local-rule-probe`) are unchanged.

### 10.3 MCP transport (no model) — `pnpm test` → `test/mcp-transport.test.ts`, 8/8 PASS

| Check | Observed |
|---|---|
| Handshake | `McpClientGroup.connect()` succeeds with Anvia's default `versionNegotiation` = **pin `2026-07-28`** (no fallback, so success proves modern-era negotiation). `serverInfo = { name: "wonderscout-demo-mcp", version: "0.1.0" }`, capabilities `{ tools: { listChanged: true } }` |
| Discovery | exactly `["get_demo_player_stats"]`; parameters `{ type: "object", required: ["playerId"], properties: { playerId: { type: "string", pattern: "^SYN-\\d{3}$" } } }` (JSON Schema draft 2020-12) |
| Valid call | `SYN-101` → `{ dataset: "synthetic", verificationId: <per-test UUID>, player: { …, metrics: { progressivePassesPer90: 7.65 } } }`; server log `call SYN-101 ok` |
| Malformed input `{ playerId: "not-an-id" }` | server-side Zod validation → `isError` result → Anvia tool throws `Input validation error: … must be a synthetic ID like SYN-101`. The v2 SDK reports this as a **tool error result, not a JSON-RPC protocol error** |
| Missing field `{ wrong: 1 }` | `Input validation error: … playerId: Invalid input: expected string, received undefined` |
| Non-object args `["SYN-101"]` | rejected client-side by `@anvia/mcp` `parseInput` ("strict JSON object") before sending |
| Unknown ID `SYN-999` | `isError` → `Unknown player ID: SYN-999` |
| Internal failure `SYN-500` | handler throws → SDK returns `isError` → `Simulated internal failure in demo data store` |
| Server survives errors | each error test then makes a successful `SYN-102` call on the same connection |
| Credentials isolation | Linux `/proc/<pid>/environ` of the server child holds **no `OPENAI*` variable** (canary `OPENAI_API_KEY_CANARY_TEST` set in the parent was not inherited); `MCP_VERIFICATION_ID` present |
| Clean disconnect | `group.close()` → both server processes exit (checked with `kill(pid, 0)`), and each logs `shutdown` |

**Finding — two processes per connection:** with the pinned protocol, the MCP client SDK runs the `server/discover` probe on a **short-lived sibling process** (documented in `VersionNegotiationMode`: "the probe runs on a short-lived sibling process spawned from the same parameters"), and then starts the long-lived connection process. Every `connect()` therefore spawns the server twice (observed: the first PID starts and shuts down within ~45 ms). Both processes exit on close. Implication: server start-up must be cheap and side-effect-free, and the probe process must not be counted as a session.

### 10.4 Real Agent tool calling — `pnpm test:live` → `test/live/mcp-agent.live.test.ts`

Model `deepseek-v4.1-flash` via `https://gateway.devscale.id/v1`, adapter `@anvia/openai` (`api: "chat"`), Agent `synthetic-scouting-agent` with `mcpServers: mcp.servers`.

**Anti-hallucination design:** each test generates `verificationId = "VERIFY-<random UUID>"` and passes it **only** to the MCP child process environment. The prompt (`buildToolLookupPrompt`) contains only the brief and player IDs, and the test asserts `prompt` does not contain the value. Success requires **three independent pieces of evidence**:
1. the **server process's own log** records the execution;
2. the Anvia **run message history** contains the model's `tool-call` part and the genuine `tool-result` holding the UUID;
3. the Zod-validated final output cites the UUID in `evidenceRefs` and the fixture numbers, checked deterministically by `assertToolEvidence`.

| Test | Result | Evidence (sanitized excerpt, first run) |
|---|---|---|
| invoke + consume tool | **PASS** | model emitted `tool-call get_demo_player_stats {"playerId":"SYN-101"}` (id `call_b35e2b42…`); server log `{pid: 60009, event: "call", playerId: "SYN-101", outcome: "ok"}`; tool result contains `VERIFY-7c5f972f-…`; output `evidenceRefs: ["VERIFY-7c5f972f-8bef-4471-9679-53d6494a2cdf"]`, evidence `minutes 1530, goalsPer90 0.24, assistsPer90 0.35, progressivePassesPer90 7.65` = fixture; `assertToolEvidence` passed. **5.3 s** run; **1,596 input / 292 output tokens** (0 reasoning tokens reported on this tool run); 1 tool call |
| failing tool during run | **PASS** | model called `SYN-500` and `SYN-102`; server log `SYN-500 internal_error`, `SYN-102 ok`; Anvia passed the failure to the model as `error-text` (`ToolCallError: Simulated internal failure…`); final output ranks only `SYN-102` and lists "SYN-500 could not be evaluated: … simulated internal failure" in `limitations`; `assertToolEvidence` passed |
| 6th call rejected (real model) | **PASS** | see §10.5 |
| real-run timeout | **PASS** | see §10.5 |

Real tool calling therefore works end-to-end across all four layers: the **gateway** accepts OpenAI `tools`/`tool_calls` on chat completions, the **model** emits well-formed calls with correct arguments, the **Anvia adapter** maps them, and the **MCP layer** executes them. No failure isolation was needed.

### 10.5 Runtime safety controls

**Mechanism:**
- **Timeout:** `runAgentWithLimits(agent, { prompt }, { timeoutMs, maxToolCalls = 5, abortSignal? })` creates one `AbortController` per run and passes it as `abortSignal` to `agent.generate()`. Anvia forwards it to the model HTTP request and to MCP tool calls (`ToolCallContext.abortSignal` → `client.callTool(…, { signal })`, which sends an MCP cancellation). The timer and listeners are cleared in `finally`.
- **Tool-call limit:** a **per-run** `AgentMiddleware.onToolInput` counts calls. It runs before argument preparation and tool execution. The call that would exceed the limit throws `ToolCallLimitExceededError`, so the tool is **never invoked**, and the middleware aborts the run.
- **Why not `lifecycle.onToolCall`:** Anvia's `onToolCall` hook (skip/terminate) exists only on an internal, non-public interface (`./internal/agent`), so I didn't use it.
- **Why per run:** the budget is attached through `AgentRunSettings.middlewares`, so the single shared Agent instance gets a fresh budget on every run.

| Check | Model | Result | Observed |
|---|---|---|---|
| 6 sequential calls (one per turn) | scripted | **PASS** | server executed exactly `SYN-101…105`; 6th rejected; `ToolCallLimitExceededError`; model called 6 times, no turn after the rejection |
| 6 parallel calls in one turn | scripted | **PASS** | 5 executed, `SYN-106` never reached the server |
| within limit | scripted | **PASS** | 1 call recorded `allowed`, response returned, evidence valid |
| **6th real attempt** | **deepseek-v4.1-flash** | **PASS** | model requested all 6 lookups; server log shows exactly 5 `ok` calls (`SYN-101…105`, timestamps within 72 ms, i.e. parallel tool calls in one turn); error `ToolCallLimitExceededError: Tool call limit of 5 per run exceeded; call #6 to get_demo_player_stats was rejected before execution` |
| timeout during in-flight MCP call | scripted + real MCP | **PASS** | `SYN-900` (15 s tool) with `timeoutMs: 800` → `RunTimeoutError` in < 5 s total; **server logged `SYN-900 cancelled`**, so the MCP cancellation reached the server; server process exited afterwards |
| timeout during hanging model call | scripted | **PASS** | `RunTimeoutError` < 2 s with `timeoutMs: 300` |
| **real-run timeout** | **deepseek-v4.1-flash** | **PASS** | `timeoutMs: 1000` → `RunTimeoutError: … cancelled at 1003 ms`. Test total 1,975 ms including MCP connect (2 spawns) and close. The in-flight gateway request was aborted, not awaited |
| no credential leakage | all | **PASS** | configured key searched in all live logs: **0 occurrences**; MCP child env has no `OPENAI*` |

### 10.6 Commands and results

| Command | Result |
|---|---|
| `pnpm --filter @wonderscout/anvia-compat-spike add @anvia/mcp @modelcontextprotocol/server` | `@anvia/mcp 1.2.7`, `@modelcontextprotocol/server 2.4.0`; `✓ Lockfile passes supply-chain policies`; +17 packages |
| `rm -rf node_modules …/node_modules …/dist && pnpm install --frozen-lockfile` | `Done in 429ms` |
| `pnpm verify` | typecheck `Done` (0 errors, `skipLibCheck: false`); build OK; **31/31 offline tests** (6 files) passed; exit 0 |
| `pnpm test:live` (run 1) | **13/13 passed** (9 Prompt 02 + 4 Prompt 03), 49.9 s, exit 0 |
| `pnpm test:live` (run 2) | **13/13 passed**, 54.6 s, exit 0 |
| `vitest run --config vitest.live.config.ts --silent=false --reporter=verbose test/live/mcp-agent.live.test.ts` | 4/4 passed; evidence lines quoted in §10.4–10.5 |

**Errors found and fixed during Prompt 03:**
1. The transport test first read the PID of the protocol-probe sibling process (already exited) instead of the long-lived connection. This is the two-process behaviour in §10.3; the test now checks both processes.
2. A heredoc typo in a helper-file command. No product impact.

There were no gateway, model, adapter or MCP failures.

### 10.7 Remaining items after Prompt 03

| Item | Status |
|---|---|
| Lens, Evals, Qdrant (TDD §2.3 steps 6–8) | **PENDING** |
| Tool budget/timeout inside the **Pipeline** agent stage | ~~not yet wired~~ **Tool budget wired in Prompt 04** (§11.2): per-run `middlewares` returned from the agent stage's `request`. The Pipeline timeout still goes through `PipelineRunOptions.abortSignal` and has no dedicated test yet |
| `$schema` (draft 2020-12) key in tool parameters | accepted by the gateway in all runs. Worth re-checking if the provider or gateway changes |
| Two server processes per MCP connect (pinned protocol probe) | expected SDK behaviour (§10.3); keep server start-up side-effect-free |
| Tool-calling latency/tokens at scale | measured for single runs only (~5–7 s, ~1.9k tokens per tool run); no load testing |
| Cost per run | not measured |

---

## 11. Prompt 04 — Anvia Lens and Evals

### 11.1 Dependencies (14-day release-age policy respected)

| Package | Version | Published | Notes |
|---|---|---|---|
| `@anvia/lens` | **1.2.5** | 2026-11-06 | peer `@anvia/core ^1.18.0` ✔; `engines.node >=24` ✔ (26.13.1). Newest is 1.3.2 (2026-11-23), excluded by policy; it needs `@anvia/core ^1.22.0` |
| `@anvia/otel` (transitive) | 1.3.2 | | pinned by lens |
| `@opentelemetry/sdk-trace-node` / `sdk-trace-base` / `resources` | 2.12.1 | | |
| `@opentelemetry/exporter-trace-otlp-http` / `exporter-logs-otlp-http` / `sdk-logs` | 0.223.1 | | OTLP over HTTP, **JSON** encoding (observed `content-type: application/json`) |
| `@opentelemetry/api` | **1.10.0 and 1.9.1 (two copies)** | | see finding below |
| `@anvia/core/evals` | (part of `@anvia/core` 1.18.0) | | no new package |

`@anvia/core` 1.18.0, `@anvia/openai` 1.3.8, `@anvia/mcp` 1.2.7, `@modelcontextprotocol/server` 2.4.0, TypeScript 7.0.2, Node 26.13.1 and Zod 4.6.7 are **unchanged**. TypeScript 7 with `skipLibCheck: false` type-checks the Lens, `@anvia/otel` and OTel declarations with **zero errors**.

**Finding: duplicate `@opentelemetry/api`.**
- `@anvia/otel@1.3.2` depends on `@opentelemetry/api ^1.10.0`.
- The OTel SDK 2.12.1 packages that `@anvia/lens@1.2.5` uses declare peer `@opentelemetry/api >=1.3.0 <1.10.0`.
- pnpm therefore installs **1.10.0** (for `@anvia/otel`) and **1.9.1** (for the SDK).

Tracing works across both copies: linkage and export were verified in §11.3, and the OTel API shares state through a global registry keyed by major version. This is still a version-skew risk to track. `@anvia/lens` 1.3.x moves to OTel SDK 3.x, but upgrading needs `@anvia/core ^1.22`, which is currently inside the cooldown window, plus a re-run of this spike.

### 11.2 Implementation (spike only — no new Agent or Pipeline)

| File | Purpose |
|---|---|
| `src/observability.ts` | `createLensClient()`:<br>• `captureMode: "safe"` (no prompt/response bodies);<br>• `redactInputs/Outputs/Errors/Metadata: true`;<br>• redaction = Lens `DEFAULT_PATTERNS` (email, card, IPv4, phone, JWT, `sk-`/`pk-`, bearer) **plus exact-value patterns for configured secrets** (e.g. the gateway key);<br>• `serviceName: wonderscout-anvia-compat-spike`, `environment: spike`.<br>`lensObservability()` registers the observer under the same name `"lens"` as `primaryTrace` for both Agent and Pipeline (TDD §10.4) |
| `src/agent.ts` (changed) | new `observability` option on the **same** Agent; prompt includes `playersToLookUp` when requested |
| `src/pipeline.ts` (changed) | new `observability` and `maxToolCalls` options on the **same** Pipeline. Its agent stage now gets, **per run**, the tool-call budget middleware (closing the §10.7 gap) and a `lifecycle.onFinish` hook. The hook records the run's messages so `validate-output` can check tool-sourced evidence against genuine tool results |
| `src/schemas.ts`, `src/preprocess.ts` (changed) | optional `lookupPlayerIds` (max 5) on the request. `assertEvidenceMatches` now accepts eligible candidates (engine numbers) **or** requested lookups backed by a genuine tool result (tool numbers + cited `verificationId`); anything else is rejected |
| `src/evals/tool-evidence-eval.ts` | one synthetic case, a target that runs the **existing Agent + real MCP server** (fresh `verificationId` per run, only in the server env), and 3 deterministic `defineMetric` metrics: `mcp_tool_executed`, `evidence_refs_match`, `expected_fixture_values`. Token usage is reported via `targetUsage` |
| `src/scripts/run-evals.ts` | `runEvalCli({ exitCode: true })`; flag `--inject-wrong-expected` flips the expected `progressivePassesPer90` from 7.65 to **8.65** |
| `test/helpers/otlp-receiver.ts` | local HTTP receiver at `/api/public/otel/v1/{traces,logs}` capturing the **real** OTLP payloads from the Lens exporters, so the tests can inspect linkage, redaction and flush. It is **not** a Lens emulator: no storage, UI or auth validation |
| `test/lens-tracing.test.ts` | 4 offline tests: real Lens client + real MCP + scripted model |
| `test/evals.test.ts` | 4 offline eval-mechanics tests (scripted model + real MCP) |
| `test/live/lens-evals.live.test.ts` | 4 live tests: real model + real MCP + real Lens exporter, and Eval CLI subprocess exit codes |

New scripts: `pnpm eval` and `pnpm eval:inject-failure` (in `spikes/anvia-compat`).

### 11.3 Lens trace evidence

**Span structure (one trace per Pipeline run).** Observed span names and parent links from the exported OTLP:

```text
pipeline.synthetic-scouting-pipeline            (root; anvia.run.id, anvia.run.status, anvia.run.duration_ms)
├── step.preprocess
├── parallel.assess
│   ├── branch.prepared
│   └── branch.assessment
│       └── agent.scouting-agent                 (pipeline stage; agent_id synthetic-scouting-agent)
│           └── agent.Synthetic Scouting Agent   (agent run; anvia.run.id, max_turns, usage)
│               ├── model.turn.1                 (model_id, provider, tool_count, has_output_schema, usage)
│               ├── tool.get_demo_player_stats   (anvia.tool.name, turn, internal_call_id, skipped)
│               └── model.turn.2
└── step.validate-output
```

`result.trace` returned by `pipeline.run()` equals `{ observer: "lens", traceId: <root traceId>, observationId: <root spanId> }`, so an app-level run can be correlated with the trace.

**Live runs (real `deepseek-v4.1-flash`, real MCP, real exporter → local receiver):**

| Run | traceId | Result | Observed |
|---|---|---|---|
| success | `fa37fcd4b66c273b7576f38af699176f` (root span `4cc89470adbd5a8a`) | **PASS** | all 11 spans share the traceId. `tool.get_demo_player_stats` (10 ms, status OK) → parent `agent.Synthetic Scouting Agent` (8,612 ms, 2,958 tokens) → … → root (8,624 ms). `model.turn.1` 2,975 ms / 964 tokens; `model.turn.2` 5,617 ms / 1,994 tokens; `model_id = deepseek-v4.1-flash`. Gateway key absent from payloads |
| failure: provider HTTP 401 | root span `14651e09c36f9ee6` | **PASS** | error status (`code 2`) on `model.turn.1` → `agent.Synthetic Scouting Agent` → `agent.scouting-agent` → `branch.assessment` → `parallel.assess` → root. `anvia.run.status = failed`. `validate-output` correctly never started. Neither the invalid test key nor the real key appears in payloads. Error mapped to `ProviderError (HTTP 401)` |

**Offline runs (real Lens client + real MCP + scripted model), `test/lens-tracing.test.ts`, 4/4 PASS:**

| Check | Observed |
|---|---|
| linkage | single traceId for all spans; every stage, the agent run and the tool span have the Pipeline root as an ancestor; tool span's parent is the agent-run span; 2 `model.turn.*` spans |
| latency | every span has `endTimeUnixNano ≥ startTimeUnixNano`; stage spans carry `anvia.pipeline.stage.duration_ms`, root carries `anvia.run.duration_ms` |
| failed run (fabricated number 9.99) | `EvidenceValidationError`; `step.validate-output` and root have error status; root `anvia.run.status = failed`; tool span still linked under root |
| failing MCP tool (`SYN-500`) | two tool spans: one OK, one **error status**, both under the root; run completes using only `SYN-101` |
| **flush** | **0 spans exported before `lens.close()`** (BatchSpanProcessor buffering) and all spans received after it, so delivery depends on flush/close, and flush/close was verified |
| safe capture | exported payloads contain **neither** the brief text, **nor** the tool's `verificationId` (no prompt/response/tool bodies), **nor** the Lens secret key. Lens credentials travel only in the `Authorization: Basic …` header |
| error redaction | a provider error containing a configured secret, an `sk-proj-…` key and a `Bearer …` token is traced (error text present), but all three values are replaced by `[REDACTED]` |
| endpoints | only `POST /api/public/otel/v1/traces` observed (no logs emitted in these runs) |

### 11.4 Evals evidence

Suite `tool-evidence`, case `mcp-lookup-SYN-101`. Expected: `SYN-101`, `minutes 1530`, `progressivePassesPer90 7.65` (fixture values). All metrics are deterministic and `required`; no LLM judge is used.

| Command | Exit | Output (excerpt) |
|---|---|---|
| `pnpm eval` | **0** | `Cases: 1 total / 1 pass` · `Metrics: 3 total / 3 pass / 0 fail / 0 invalid` · `mcp_tool_executed: pass (server executed 1 call(s))` · `evidence_refs_match: pass` · `expected_fixture_values: pass` · `Usage: target=1841 tokens` · 14.0 s |
| `pnpm eval:inject-failure` | **1** | `Cases: 1 total / 0 pass / 1 fail` · `Metrics: 3 total / 2 pass / 1 fail` · `expected_fixture_values: fail — progressivePassesPer90: expected 8.65, cited 7.65` · `Usage: target=1861 tokens` · 13.6 s |
| live test (subprocess `node dist/scripts/run-evals.js`) | **0** / **1** | same results, asserted via `spawnSync().status` |

In the passing run, the case output records `evidenceRefs: ["VERIFY-a2b013d6-…"]` equal to the server-generated `verificationId`, the server log entry `{ playerId: "SYN-101", outcome: "ok" }`, and the genuine tool result. The injected run fails **only** the expectation metric, while tool-execution and evidence metrics still pass, so the failure is attributed precisely.

Offline mechanics (`test/evals.test.ts`, 4/4 PASS, scripted model + real MCP):
- honest run → 3/3 pass, `evalExitCode = 0`;
- wrong expected → `expected_fixture_values` fail, `evalExitCode = 1`;
- fabricated `evidenceRefs` → `evidence_refs_match` fail, exit 1;
- answer without any tool call → `mcp_tool_executed` fail, exit 1.

### 11.5 Commands and results

| Command | Result |
|---|---|
| `pnpm --filter @wonderscout/anvia-compat-spike add @anvia/lens` | `@anvia/lens 1.2.5`, +20 packages, no peer warnings printed |
| `rm -rf node_modules …/node_modules …/dist && pnpm install --frozen-lockfile` | `Done in 383ms` |
| `pnpm verify` | typecheck `Done` (0 errors); build OK; **39/39 offline tests** (8 files); exit 0 |
| `pnpm test:live` | **17/17 passed** (9 Prompt 02 + 4 Prompt 03 + 4 Prompt 04), 96.5 s, exit 0 |
| `pnpm eval` / `pnpm eval:inject-failure` | exit **0** / exit **1** (§11.4) |
| configured gateway key searched in all captured logs and all tracked + untracked repo files | **0 occurrences** |

**Errors found and fixed:** `AgentObservabilityOptions` is exported from `@anvia/core/observability`, not the package root; I fixed the import. The eval summary initially reported `target=0` tokens; I added a `targetUsage` selector. No Lens, OTel, model or MCP failures.

### 11.6 Remaining blockers and limitations after Prompt 04

| Item | Status |
|---|---|
| **Real Anvia Lens backend:** ingestion, trace links in the Lens UI, Lens-side redaction review | **BLOCKED**. No Lens deployment or `ANVIA_LENS_BASE_URL` / `ANVIA_LENS_PUBLIC_KEY` / `ANVIA_LENS_SECRET_KEY` are configured, and the package guide does not document self-hosting. Exported payloads were verified locally instead. To unblock: provide a Lens deployment + keys, then run the same Pipeline with `createLensClient()` pointed at it (`baseUrl` is the only change) and record the trace links |
| Duplicate `@opentelemetry/api` (1.10.0 + 1.9.1) | works; track as version skew (§11.1) |
| Lens eval reporter (`lens.evalReporter()`) linking eval results to traces | not exercised. It needs a real Lens backend to be meaningful |
| Trace attributes from TDD §10.4 (`snapshot_id`, `scorer_version`, `kb_version`, role, `runStatus` vs `outcome`) | not yet attached; spike traces carry Anvia's built-in attributes only. Add via `trace.metadata` in M3/M4 |
| Tool-sourced candidates | evidence-checked against the genuine tool result, but **not eligibility-filtered** (age/position) by the deterministic engine. M3 must apply the engine's eligibility rules to tool data |
| Per-run state in the Pipeline (`runs` map) | removed in `validate-output`; a run failing before that step leaves one small entry. Clean up via `finally`/observer in M3 |
| Qdrant + embedding adapter | **PENDING** (TDD §2.3 step 8) |
| Cost per run | not measured |

## 12. Prompt 04B.3 — Real Anvia Lens integration (self-hosted backend)

Supersedes the "BLOCKED" status in §11.6 for ingestion. Lens was deployed locally in Prompt 04B.1 (`infra/lens/`, Lens v0.19.0, `http://localhost:3080`), and the owner account, project and ingestion key were created by hand.

### 12.1 Files changed

| File | Change |
|---|---|
| `spikes/anvia-compat/src/scripts/run-lens-traces.ts` | **new**: one successful and one controlled-failure Pipeline run against the configured Lens backend, then `flush()` and `close()`. Reads `ANVIA_LENS_BASE_URL`, `ANVIA_LENS_PUBLIC_KEY`, `ANVIA_LENS_SECRET_KEY` from the environment. Prints trace IDs and statuses only |
| `spikes/anvia-compat/package.json` | adds script `trace:lens` |
| `docs/spikes/anvia-compatibility-report.md` | row 28 → PASS; gate status; sign-off; this section |

No changes to the Agent, Pipeline, MCP, Evals, `src/observability.ts` or the tests. `createLensClient()` and `lensObservability()` are reused as they are, so `captureMode: "safe"`, redaction and the shared `primaryTrace: "lens"` are unchanged. The only difference from the offline tests is the `baseUrl`/keys, which now come from `.env`.

### 12.2 Commands and results

| Command | Result |
|---|---|
| Lens stack health (`docker compose ps`) | postgres, clickhouse, redis, api, web, monitor **healthy**; worker running; `/health/live` → 200 |
| Ingestion probe, valid key, `POST /api/public/otel/v1/traces` with an empty `resourceSpans` | **200** |
| Ingestion probe, wrong secret | **401** (the backend validates credentials) |
| `pnpm typecheck` / `pnpm build` (spike) | pass after one fix (the script first imported a test fixture outside `src`; inlined the same data) |
| `pnpm trace:lens` (real Devscale `deepseek-v4.1-flash`, real MCP, real Lens) | **exit 0**, `flush: ok`, `close: ok` (3 invocations; see 12.3) |
| `pnpm verify` (root) | typecheck, build, **39/39 offline tests PASS** |
| Secret search in stored Lens data (`lens.spans`: `span_attributes`, `events`, `input`, `output` of the spike service) | gateway key: **0 hits**; Lens secret key: **0 hits** |

### 12.3 Trace IDs and observed spans

Three invocations were run. Each produced one successful and one failed Pipeline trace. Each row below is a trace stored in Lens (`lens.trace_summaries`, service `wonderscout-anvia-compat-spike`, environment `spike`).

| Run | Pipeline trace ID | Status | Spans | Generations | Tools | Errors | Tokens |
|---|---|---|---|---|---|---|---|
| 1 (fixture-import build, see note) | `969c384ed9d4d97a4f29be079eace06c` | ok | 11 | 2 | 1 | 0 | 2819 |
| 1 | `5441373abf8c0ef7686cee095143734f` | error | 8 | 1 | 0 | 6 | 0 |
| 2 | `d3b8924076771deeccd8c9497871fa34` | ok | 11 | 2 | 1 | 0 | 2994 |
| 2 | `8ab283b46bf4f7743b8202fca2bc43a5` | error | 8 | 1 | 0 | 6 | 0 |
| 3 | `e31cd9dd53007fc2d14a6c4190af1c1b` | ok | 11 | 2 | 1 | 0 | 2930 |
| 3 | `860fb75286ff975a51bb2b6283f57f46` | error | 8 | 1 | 0 | 6 | 0 |

The `Run` column is the invocation number. Run 1 used the fixture import, which was replaced before runs 2 and 3. The code path is otherwise identical.

**Successful trace `d3b8924076771deeccd8c9497871fa34`** (one trace; all spans share the same trace ID):

```
pipeline.synthetic-scouting-pipeline        agent   ok   completed   (root)
├─ step.preprocess                          span    ok
├─ parallel.assess                          span    ok
│  ├─ branch.assessment                     span    ok
│  │  └─ agent.scouting-agent               agent   ok
│  │     └─ agent.Synthetic Scouting Agent  agent   ok   completed
│  │        ├─ model.turn.1                 generation ok  991 tokens
│  │        ├─ tool.get_demo_player_stats   tool   ok   (MCP, SYN-101)
│  │        └─ model.turn.2                 generation ok  2003 tokens
│  └─ branch.prepared                       span    ok
└─ step.validate-output                     span    ok
```

**Failed trace `8ab283b46bf4f7743b8202fca2bc43a5`** (controlled failure: the Pipeline is run with an invalid key, so the real gateway returns HTTP 401):

```
pipeline.synthetic-scouting-pipeline        agent   error  failed   "401 Invalid API key…"
├─ step.preprocess                          span    ok
└─ parallel.assess                          span    error
   └─ branch.assessment                     span    error
      └─ agent.scouting-agent               agent   error
         └─ agent.Synthetic Scouting Agent  agent   error  failed
            └─ model.turn.1                 generation error
```

The failed run contains no tool span, because the request fails before any tool call.

### 12.4 Lens dashboard verification

- **Storage (verified):** the rows above are in the ClickHouse database `lens` (tables `spans` and `trace_summaries`). They were read directly with `clickhouse-client` inside the Lens container.
- **Dashboard UI (not verified):** I did not open `http://localhost:3080` in a browser, so I have not seen the traces on screen. **Check:** in the project, open the traces list and find `synthetic-scouting-pipeline`, with 3 `ok` and 3 `error` entries that match the IDs in §12.3.

### 12.5 Export errors and cleanup

- No export errors. `flush()` returned `ok` and `close()` returned `ok` on every invocation.
- A failed run returns no trace object, so the failed trace IDs were read from the backend, not from the script output.
- Content capture: `input` and `output` are empty in all stored spans (safe capture mode; zero payload bytes).

### 12.6 Remaining issues

| Item | Status |
|---|---|
| Dashboard visual check | pending (see 12.4) |
| `@opentelemetry/api` duplicate (1.10.0 + 1.9.1) | unchanged; version skew (§11.1) |
| TDD §10.4 trace attributes (`snapshot_id`, `scorer_version`, `kb_version`, role) | not attached (unchanged, §11.6) |
| Lens eval reporter (`lens.evalReporter()`) | not exercised; the evals still run without it |
| Cost per run | measured tokens only (2819–2994 per successful run); not priced |
| Qdrant + embedding adapter | **PENDING** (TDD §2.3 step 8) |

**Status: PASS** for real-backend ingestion, linked Agent and MCP spans, redaction, and flush/close. The dashboard UI check is pending.

## 13. Prompt 04C — Anvia Studio integration (development only)

### 13.1 Dependencies and release policy

- `@anvia/studio@1.3.26`, installed exact (`pnpm add -E`). Peer `@anvia/core ^1.18.0` matches the installed `@anvia/core@1.18.0`. Engines `node >=20.12`; the repo runs Node 26.
- Newer releases were excluded: `1.4.0` (published 2026-11-13, 12 days before this run) is inside the 14-day window. `1.5.2` (published 2026-11-24) requires peer `@anvia/core ^1.23`, which does not match the installed core. The publish dates of `1.4.1`–`1.5.1` were not re-checked in this run; they were excluded at the time of selection under the same policy.
- Known install warning: `@anvia/react-ui@1.3.1` is deprecated upstream. It is a transitive dependency of Studio's bundled UI, not used by the spike.

### 13.2 Files changed

| File | Change |
|---|---|
| `spikes/anvia-compat/package.json` | dependency `@anvia/studio` 1.3.26; script `studio` (`node --env-file=../../.env dist/studio/entry.js`) |
| `spikes/anvia-compat/src/studio/session.ts` | registers the **existing** Agent (`synthetic-scouting-agent`) and Pipeline (`synthetic-scouting-pipeline`); no new Agent or Pipeline |
| `spikes/anvia-compat/src/studio/entry.ts` | dev-only entry: MCP demo server + Studio on `127.0.0.1:4021`; closes MCP on shutdown |
| `spikes/anvia-compat/test/studio.test.ts` | offline: both targets registered; key absent from `studio.config()` and from 13 browser-facing endpoints |

Agent, Pipeline, MCP, Lens and Evals code is unchanged.

### 13.3 Credential exposure found and fixed

- **Finding:** Studio's `GET /agents/:id/runtime` serialized the model object. The `@anvia/openai` client keeps the API key as a plain string, so the Devscale key was returned to any browser that could reach the server.
- **Attempt that did not work:** a `toJSON` proxy. Studio does not call `toJSON`, so the key still leaked.
- **Fix:** `opaqueModelForStudio()` in `session.ts` gives the Agent a frozen object with only `provider`, `modelId`, `capabilities`, optional metadata and delegating `completion`/`traceRequest` functions. The real model is held in a closure, so Studio cannot reach the client.
- **Verification:** 13 browser-facing paths (listed in `test/studio.test.ts`) were fetched in-process, and the key was absent from each. The live server was probed on the runtime, traces, pipeline logs and runs endpoints. Saved run responses and `/traces` were also scanned: no key. The offline test now guards this.
- **Residual:** the runtime view shows the delegating functions as source text (for example `(request, options) => real.completion(...)`). This reveals no secret.

### 13.4 Commands and results

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm build` | clean |
| `pnpm verify` (typecheck, build, offline tests) | **exit 0**; 9 files, **41/41** tests pass |
| `pnpm studio` | serves `http://127.0.0.1:4021/playground` |

### 13.5 Verification evidence (Studio API, real Devscale and real MCP)

| Check | Result |
|---|---|
| `/health` | `{"status":"ok"}` |
| Agents registered | `synthetic-scouting-agent` listed; `/agents/:id/tools` shows `get_demo_player_stats` from MCP server `demo` |
| Pipeline graph | `/pipelines/synthetic-scouting-pipeline`: 6 stages, 8 edges. Nodes: `$input` → `preprocess` → `assess` (parallel: `prepared`, `assessment`, `scouting-agent`) → `validate-output` → `$output` |
| Agent run via Devscale | `POST /agents/synthetic-scouting-agent/runs` within a created session: **HTTP 200**, ~8 s; output is valid JSON with `candidates_found` and the MCP-sourced `verificationId` |
| MCP tool discovery | per-agent `/tools` and `/mcps` list `get_demo_player_stats` |
| MCP tool invocation | `POST .../tools/get_demo_player_stats/runs` with `{"args":{"playerId":"SYN-101"}}`: **HTTP 200**, returns `SYN-101` (fictional) and a `verificationId` |
| Controlled tool error | invalid ID `NOT-A-VALID-ID` → HTTP 500, `ToolCallError`, message "playerId must be a synthetic ID like SYN-101" (the error is recorded as a run, not a crash) |
| Pipeline run, synthetic input | `POST /pipelines/synthetic-scouting-pipeline/runs`: **HTTP 200**, ~18 s, verdict `candidates_found`, `evidenceRefs` contain the MCP `verificationId` |
| Pipeline controlled failure | input with `dataset: "real"` → HTTP 500, `ZodError`; run listed with status `error`; log `pipeline.run_failed` (level `error`) |
| Traces | the agent run produced 1 trace, status `success`, 3 observations: `model.turn.1`, `get_demo_player_stats`, `model.turn.2` |
| Sessions | the session created for the run is listed |

### 13.6 Trace persistence note

Studio stores an Agent trace only when the run has a `sessionId`. Runs without one returned HTTP 200 but produced no trace. This was confirmed with a direct in-process run (store stayed at 0 traces). The fix is to create a session via `POST /sessions` and pass its `sessionId` in each run. Whether the playground sends a session was not verified (see 13.7).

Pipeline runs are not traced by Studio's trace store (the pipeline has no observer in this spike). Pipeline history is in `/pipelines/:id/runs` and `/pipelines/:id/logs`, which work as shown above.

### 13.7 UI verification — NOT DONE

- No browser tool was available in this session, so the Studio UI was **not visually inspected**.
- What was checked: `GET /playground` returns 200 (HTML, `text/html`); its 12 referenced assets return 200; `GET /ui/playground` redirects 302 to `/playground`.
- **Still to check in a browser:** the Agent appears in the playground and a message runs through Devscale; the Pipeline graph renders the stages in §13.5; a Pipeline run with the synthetic input works; MCP tools are visible; the traces and error entries display.
- **Expected risk:** the Agent has an `outputSchema`. Free-form chat in the playground may produce non-JSON output and fail validation. This is untested and must be recorded from a real run, not assumed.

### 13.8 Blockers and limitations

| Item | Status |
|---|---|
| Studio UI visual check (playground run, graph, traces) | **not done** (13.7) |
| Trace persistence requires a `sessionId` | documented (13.6); the playground behavior is unverified |
| Pipeline runs not traced in Studio | by design of this spike; Lens (§12) remains the trace backend |
| Studio is local-only and development-only | `127.0.0.1` binding; not a production surface |
| Qdrant + embedding adapter | **PENDING** (TDD §2.3 step 8) |

**Status: PASS at the API level** for registration, Devscale runs, MCP discovery and invocation, controlled errors, pipeline stages, and key isolation. **UI verification is not done** and is not claimed.

## 14. Prompt 05 — Qdrant and embeddings compatibility (synthetic only)

**Branch:** `spike/anvia-qdrant-05`. **Result:** PASS for the listed scope; payload indexes NOT DONE (§14.7). Nothing committed or pushed.

### 14.1 Versions and dependencies

| Package / image | Version | Source of pin |
|---|---|---|
| `@anvia/core` | `1.18.0` | existing (unchanged) |
| `@anvia/qdrant` | `1.2.1` (exact) | 14-day policy; `1.3.0` published 2026-11-24, excluded |
| `@anvia/transformers` | `1.1.7` (exact) | 14-day policy; `1.2.0` published 2026-11-24, excluded |
| `@huggingface/transformers` | `4.3.2` | transitive of `@anvia/transformers` |
| `@qdrant/js-client-rest` | `1.20.0` | transitive of `@anvia/qdrant` |
| `onnxruntime-node` | `1.30.0` | transitive (CPU; `ONNXRUNTIME_NODE_INSTALL=skip`) |
| Qdrant server image | `qdrant/qdrant:v1.20.0@sha256:9bfc89f9914fc14876a88c05270685921a55b8877b254a98bcc1cc2f0a424cd2` | `v1.20.1` (pushed 2026-11-13) and `v1.20.2` (2026-11-16) are inside the 14-day window, excluded |

Peer compatibility: `@anvia/qdrant` peers `@anvia/core ^1.17.2`; `@anvia/transformers` peers `@anvia/core ^1.18.0`. Both satisfied by Core `1.18.0`. Core was **not** upgraded.

Build-script approval: `pnpm-workspace.yaml` `allowBuilds` lists `onnxruntime-node` and `protobufjs`, written by `pnpm approve-builds`. Both postinstall scripts were read first: onnxruntime-node runs `script/install` (CUDA download, skipped with `ONNXRUNTIME_NODE_INSTALL=skip`); protobufjs only prints a warning.

### 14.2 Qdrant configuration and health

Files: `infra/qdrant/docker-compose.yml`, `infra/qdrant/README.md`. Gitignored secrets: `infra/qdrant/.env` (two random keys) and the repo-root `.env` (`QDRANT_URL`, `QDRANT_API_KEY`, values not printed).

| Check | Result |
|---|---|
| Compose project | `wonderscout-qdrant`; separate from `infra/lens` |
| Ports | `127.0.0.1:6333` (REST) and `127.0.0.1:6334` (gRPC); no listener on `0.0.0.0` or `::` |
| Persistent volume | `wonderscout-qdrant_qdrant_storage` |
| Docker healthcheck | `healthy` (`/readyz` over raw TCP) |
| `GET /readyz` with and without key | 200 / 200 |
| `GET /collections` without key or with wrong key | **401** / **401** (auth enforced) |
| Version | `1.20.0` (commit `222b2e44…`) |
| Lens containers | 7 still running, untouched |

### 14.3 Embedding model (real, no mocks)

| Field | Value |
|---|---|
| Provider | `transformers` (`@anvia/transformers`, `loadTransformersEmbeddingModel`) |
| Model | `Xenova/all-MiniLM-L6-v2` |
| Dimensions | **384** (verified at runtime; the model object does not expose `dimensions`, so the spike enforces 384 itself) |
| Pooling | `mean` |
| Normalization | `normalize: true` (unit length, verified: norm 1.0000) |
| Metric | `cosine` |
| Max batch size | 16 |
| `localFilesOnly` | not set (first load downloaded the model; later loads use the cache) |

The Devscale Agent model (`deepseek-v4.1-flash`) was not changed or used for embeddings.

### 14.4 Synthetic knowledge

Four fictional methodology documents (`src/knowledge/corpus.ts`), all with `usage_rights: internal-synthetic-spike`, `seasons: [synthetic]`, `source_urls: []`, version `1.0.0`:

| `document_id` | `role_id` | Chunks |
|---|---|---|
| `progressive-midfielder` | `progressive-midfielder` | 3 |
| `inside-forward` | `inside-forward` | 3 |
| `evidence-confidence-rules` | `null` (stored as `''`) | 3 |
| `metric-glossary` | `null` (stored as `''`) | 3 |

Total: **12 chunks**, one per `##` section. Frontmatter is validated with Zod (`document_id` kebab-case, semver `version`, required fields); invalid frontmatter is rejected with field names only.

Chunk ID = `sha256(document_id|version|chunk_number|text_hash)`, used as the Qdrant point ID source. Dedicated collection: `wonderscout_spike_knowledge_v1` (not the TDD production name `wonderscout_knowledge_v1`). Distance metric: cosine.

### 14.5 Test evidence

Commands:
- `pnpm verify` (root): typecheck, build, offline tests. **49/49 passed.**
- `pnpm test:live` (includes the knowledge suite and the existing Devscale and Lens suites): **28/28 passed**.
- `npx vitest run --config vitest.live.config.ts test/live/knowledge.live.test.ts`: **11/11 passed** (real model, real Qdrant).

Offline (`test/knowledge.offline.test.ts`): frontmatter parsing; 12-chunk count per document; metadata on each chunk; deterministic chunk IDs that change when content changes; invalid frontmatter rejected; dimension guard (10 rejected, 384 accepted); `roleId` eq-filter shape; connection to a closed port (`127.0.0.1:1`) fails.

Live (`test/live/knowledge.live.test.ts`):
- Embedding: 384 dimensions, unit length.
- Ingest: 12 points in the dedicated collection; `countPoints` = 12.
- Idempotence: two more ingests of the same content leave the count at 12.
- Retrieval (top-3, fixed expected top-1 chosen before the run):

| Query (abridged) | Expected top-1 `document_id` | Result |
|---|---|---|
| midfielder moving the ball forward beyond the defensive line | `progressive-midfielder` | PASS |
| minutes before evidence is reliable | `evidence-confidence-rules` | PASS |
| how a per-90 value is calculated | `metric-glossary` | PASS |
| wide forward cutting inside to shoot | `inside-forward` | PASS |

  Scores are non-increasing; the expected document is in the top 3 for each query.
- `roleId = inside-forward` filter returns exactly 3 hits, all `inside-forward`, with `documentVersion`, `usageRights`, `heading` and `document` preserved.
- Dimension mismatch on upsert (10-dim vector) is rejected with `dimension`; the point count stays at 12.
- Dimension mismatch on query is rejected with `dimension mismatch for query`.

### 14.6 Latency (single local machine, WSL2, CPU)

| Operation | Value |
|---|---|
| Model init, first run (download + load) | 73,067 ms (one-time download, not representative) |
| Model init, cached | 414 ms |
| Embed 2 texts (earlier probe) | 32 ms |
| Ingest 12 chunks: embed | 141 ms |
| Ingest 12 chunks: upsert | 42 ms |
| Search, top-5, 20 repeats: p50 / max | 48 ms / 50 ms |

These are spike numbers from one machine, not production targets.

### 14.7 Limitations and open items

| Item | Status |
|---|---|
| Payload indexes on `role_id`, `document_id`, `document_version`, `source`, `status` (TDD §6.2) | **NOT DONE.** `@anvia/qdrant` exposes no index method, so this needs the native Qdrant client or REST calls. Filters work without indexes at this size; add them before the full knowledge base. |
| Collection reset in tests | done with a raw REST `DELETE`, because the adapter has no drop method. Test-only. |
| Chunking | one chunk per `##` section; no token-based splitting (synthetic sections are short). The TDD's 300–600 token rule applies to the real corpus. |
| `roleId` `''` for documents with `role_id: null` | filtering on `''` would return both null-role documents. Not used by any test. |
| Embedding model not exposed `dimensions` at runtime | the spike enforces 384 in code. |
| Qdrant on loopback only; API key required | local development only, not a production deployment. |
| Lens dashboard and Studio UI visual checks | not done (carry-over from §12.4 and §13.7). |
| Full 14-document KB, Recall@5 ≥ 0.85 target | out of scope for prompt 05. |
| Commit / push / PR | not done; awaiting the user's request. |

**Status: PASS** for Qdrant (local, pinned, authenticated, persistent, health verified), the MiniLM embedding path, ingestion and idempotence, semantic retrieval with metadata filters, dimension and connection failure handling, and latency measurement. **Payload indexes are NOT DONE.** Prompt 06 was not started.

## 15. Prompt 06 — Final Anvia compatibility verification

**Executed:** 2026-11-25, branch `main` (after merge of PR #2, `431b324`), WSL2 Linux x64. Nothing below is PASS without the command output listed.

### 15.1 Final dependency versions

| Component | Version | Notes |
|---|---|---|
| Node.js / pnpm | `v26.13.1` / `12.10.1` | repo floor `>=24` |
| TypeScript | `7.0.2` | `skipLibCheck: false`, strict |
| `@anvia/core` | `1.18.0` | unchanged across prompts 02–06 |
| `@anvia/openai` | `1.3.8` | Devscale Gateway, chat API |
| `@anvia/mcp` | `1.2.7` | with `@modelcontextprotocol/server` `2.4.0` |
| `@anvia/lens` | `1.2.5` | backend self-hosted v0.19.0 |
| `@anvia/studio` | `1.3.26` | API-level integration |
| `@anvia/qdrant` | `1.2.1` | exact |
| `@anvia/transformers` | `1.1.7` | exact |
| `@huggingface/transformers` | `4.3.2` | transitive |
| `@qdrant/js-client-rest` | `1.20.0` | transitive |
| `onnxruntime-node` | `1.30.0` | transitive, CPU |
| `zod` | `4.6.7` | exact |
| Qdrant server | `1.20.0` (`qdrant/qdrant:v1.20.0@sha256:9bfc89f9…4cd2`) | |
| Model | `deepseek-v4.1-flash` (Devscale, Agent) | unchanged |
| Embedding model | `Xenova/all-MiniLM-L6-v2`, 384-dim, mean, normalized | spike only |

Dependency consistency: `pnpm install --frozen-lockfile` → exit 0, "Lockfile passes supply-chain policies", "Lockfile is up to date". Release policy: `minimumReleaseAge: 20160` (14 days), `savePrefix: ''`, `engineStrict: true`. No dependency was upgraded in this prompt.

### 15.2 Commands executed and results

| Command | Result |
|---|---|
| `pnpm verify` (root: typecheck, build, offline) | **exit 0**, **49/49** offline tests |
| `pnpm test:live` (full live suite, verbose run) | **exit 0**, **28/28** live tests across 4 files |
| `pnpm trace:lens` (real model, real MCP, real Lens) | **exit 0**, `flush: ok`, `close: ok`; new traces `cbffde00…` (ok) and `ba6516d2…` (error) |
| `pnpm eval` | **exit 0**: real tool call executed, `evidence_refs_match` pass, `expected_fixture_values` pass |
| `pnpm eval:inject-failure` | **exit 1** (intended): `expected 8.65, cited 7.65` → fail |
| Studio server (`dist/studio/entry.js`, `127.0.0.1:4021`) | `/health`, `/agents`, `/pipelines`, `/tools`, `/traces`, `/playground` all **200**; process stopped afterwards and port closed |
| Qdrant | `/readyz` **200**; `/collections` without key **401**, with key **200**; Docker health `healthy`; spike collection `points_count: 12` |
| Frozen lockfile install | **exit 0** |

Safety-critical offline tests, verified by name (`--reporter=verbose`):
- `runtime-limits`: 5 sequential tool calls allowed, 6th rejected before execution; 6 parallel calls in one model turn → 6th rejected; per-run timeout cancels an in-flight MCP call (server observes cancellation) and a hanging model call; evidence validation rejects hallucinated IDs, altered numbers, and missing tool calls.
- `mcp-transport`: initialize and single read-only tool discovery; malformed, missing, unknown, and internal-failure inputs return tool errors; the client rejects non-object arguments; **model credentials not passed to the MCP child process**; clean disconnect and child process exit.
- `pipeline-input`: real (non-synthetic) dataset, non-`SYN-` player ID, inverted age range, and age outside 16–25 are rejected before any stage runs; missing model variables are named without values.
- `preprocess`: deterministic filtering and per-90 computation; evidence assertion rejects invented players and altered numbers; Zod rejects malformed Agent output.
- `redact`, `env`, `studio` (model key absent from all 13 endpoints), `lens-tracing` (linked trace, flush on close, failing MCP span, redacted errors), `evals`.

Live tests, verbose:
- `devscale`: exact model ID; real chat completion through the adapter; plain-text Agent; structured output validated locally; schema-valid JSON failing a local Zod rule rejected; truncated response (`finish_reason=length`) rejected; Pipeline end-to-end; HTTP 401 → `ProviderError` without leaking the key; HTTP 400 unknown model not substituted.
- `mcp-agent`: real `deepseek-v4.1-flash` invokes the MCP tool and uses the genuine result; failing tool handled; 6th real tool attempt rejected; real timeout cancels the run.
- `lens-evals`: successful run → one linked trace containing the MCP span; failed run (401) → linked error trace, key redacted; eval CLI exit 0 on pass and exit 1 on deliberately wrong expected value.
- `knowledge`: 11 tests (see 15.4).

### 15.3 Lens and trace correlation (real backend, ClickHouse)

Read directly with `clickhouse-client` in `wonderscout-lens-clickhouse-1`, database `lens`. The `running` row for `step.preprocess` seen in `trace_summaries` was a superseded summary version; `FINAL` shows `ok`.

Latest successful trace `cbffde00054b8219ca82b1269f5c523b`, 11 spans, one tree:

```
pipeline.synthetic-scouting-pipeline   agent   ok  (root)
├─ step.preprocess                     span    ok
├─ parallel.assess                     span    ok
│  ├─ branch.assessment                span    ok
│  │  └─ agent.scouting-agent          agent   ok
│  │     └─ agent.Synthetic Scouting Agent  agent ok
│  │        ├─ model.turn.1            generation ok
│  │        ├─ tool.get_demo_player_stats    tool ok  (MCP)
│  │        └─ model.turn.2            generation ok
│  └─ branch.prepared                  span    ok
└─ step.validate-output                span    ok
```

Latest failed trace `ba6516d2cbc1927b8ce7c2f8f3868b66`: 8 spans, `error`, 6 error spans, no tool span (fails before tool call).

Linkage check across the last 6 spike traces: **0 orphan spans** (every non-root `parent_span_id` resolves inside its own trace). Pipeline, Agent, MCP tool, and model-turn spans share one trace ID.

Secret check on stored data: spans of service `wonderscout-anvia-compat-spike` contain **0 hits** for the OpenAI-compatible key, the Lens public key, or the Lens secret key (checked in `span_attributes`, `events`, `resource_attributes`, `input`, `output`). Tracked files contain **0 occurrences** of either key.

### 15.4 Qdrant and embeddings

- Health and auth: §15.2 (`readyz` 200; unauthenticated 401; key 200; Docker healthy).
- Embedding and ingestion: 12 chunks (4 fictional documents), dedicated collection `wonderscout_spike_knowledge_v1`, cosine, 384-dim. Re-ingestion leaves the count at 12.
- Retrieval: the expected document is top-1 for each of 4 fixed queries and in the top 3. Scores are non-increasing.
- Metadata filter: `roleId = inside-forward` returns 3 hits, all `inside-forward`, with `documentVersion`, `usageRights`, `heading`, and `document` preserved.
- Rejections: 10-dim upsert and 10-dim query both rejected; a closed port (`127.0.0.1:1`) fails.
- Latency (CPU, WSL2): model init 414 ms cached (73 s on first download); ingest embed 141 ms and upsert 42 ms for 12 chunks; search p50 48 ms, max 50 ms (top-5, 20 repeats).

Payload indexes: **deferred** to the production knowledge-base work, as instructed. Not implemented.

### 15.5 Compatibility matrix

| # | Area | Verdict | Evidence |
|---|---|---|---|
| 1 | Agent + Pipeline with `deepseek-v4.1-flash` via Devscale | **PASS** | §15.2 live `devscale` (9 tests), `trace:lens` exit 0 |
| 2 | MCP producer and consumer, real model-driven tool calling | **PASS** | §15.2 live `mcp-agent`, offline `mcp-transport` |
| 3 | Runtime timeout, cancellation, max 5 tool calls | **PASS** | §15.2 `runtime-limits` (offline) and `mcp-agent` (live, real 6th attempt rejected) |
| 4 | Lens tracing with the real backend (successful and failed traces) | **PASS** | §15.3 (ClickHouse rows, linked spans) |
| 5 | Evals: pass and intentional failure | **PASS** | `pnpm eval` exit 0; `eval:inject-failure` exit 1; §15.2 |
| 6 | Qdrant health and auth | **PASS** | §15.2 |
| 7 | Local MiniLM embeddings, ingestion, retrieval, metadata filter, idempotency | **PASS** | §15.4 |
| 8 | TypeScript 7 strict, typecheck, build | **PASS** | `pnpm verify` |
| 9 | Dependency consistency | **PASS** | frozen-lockfile install exit 0 |
| 10 | Invalid inputs rejected before any stage | **PASS** | `pipeline-input` (offline) |
| 11 | Provider and MCP errors propagate | **PASS** | live `devscale` 401 and 400; MCP error tests |
| 12 | Local Zod and evidence validation enforced | **PASS** | `preprocess`, `runtime-limits`, live Zod-rule and truncation tests |
| 13 | Devscale structured JSON reliability (known limitation) | **PASS** (mitigated) | Local validation is mandatory; the provider is not trusted for JSON (see 15.6) |
| 14 | Lens traces correlated and safely redacted | **PASS** | §15.3 (0 orphans; 0 key hits) |
| 15 | Secrets not tracked or exposed | **PASS** | §15.3 and §15.7 |
| 16 | MCP processes and Lens clients clean up | **PASS** | `mcp-transport` child exit; `lens` flush and close `ok` |
| 17 | Studio API registration, execution, and chat (streaming and non-streaming) | **PASS** (API) | §15.2 endpoints 200; §15.11 chat fix and live chat tests |
| 18 | Lens dashboard visual check | **PENDING USER VERIFICATION** | not opened in a browser |
| 19 | Studio playground visual check (run, graph, traces) | **PENDING USER VERIFICATION** | not opened in a browser |
| 20 | Qdrant payload indexes | **NOT DONE (deferred by design)** | §15.4 |
| 21 | Agent + RAG integration | **OUT OF SCOPE** | per prompt |

Summary: **PASS 17**, **PENDING USER VERIFICATION 2**, **NOT DONE 1 (deferred)**, **FAIL 0**, **BLOCKED 0**.

### 15.6 Known limitations and mitigations

- **Devscale does not reliably enforce structured JSON.** Mitigation: every Agent output passes local Zod and evidence validation before a Pipeline returns it. Tests cover schema-valid but rule-invalid output, truncation, and fabricated or altered evidence. This is a provider limitation, not solved by the provider.
- **Single-candidate and synthetic data only.** The eval scenario has one candidate, so no ranking is tested.
- **Embedding model not exposed by dimension at runtime.** Mitigation: the spike enforces 384 in code.
- **Qdrant on loopback with an API key**, local development only.
- **Latency numbers** come from one WSL2 CPU machine, not a production target.
- **Lens and Studio UI** are verified only at the storage and API level.

### 15.7 Secrets and git hygiene

- Key values were read from `.env` files and checked by match count only. They were not printed.
- Ignored and not tracked: root `.env`, `infra/lens/.env`, `infra/qdrant/.env`, `spikes/anvia-compat/dist/`.
- Tracked files contain 0 occurrences of the OpenAI-compatible key or the Lens secret key.
- Stored Lens spans for this service contain 0 key hits.

### 15.8 Outstanding technical debt

| Item | Owner / when |
|---|---|
| Qdrant payload indexes (`role_id`, `document_id`, `document_version`, `source`, `status`) | before production KB |
| Qdrant collection reset in tests uses raw REST `DELETE` (no adapter drop method) | test-only, low |
| Chunking is one chunk per `##` section; TDD token-based splitting (300–600 tokens) not implemented | production KB |
| `roleId` stored as `''` for null-role documents; `''` filter would match both | production KB |
| OTel version skew between Anvia and the Lens stack | carry-over from §12 |
| TDD §10.4 attributes | carry-over |
| Cost measurement | carry-over |
| Full 14-document KB, Recall@5 ≥ 0.85 | next milestone |

### 15.9 Remaining manual verification

1. Open the Lens dashboard at `http://localhost:3080`, find `synthetic-scouting-pipeline`, and confirm 3 `ok` and 3 `error` traces matching the IDs in §12.3 and §15.3 (the newest pair is `cbffde00…` and `ba6516d2…`).
2. Open the Studio playground (`pnpm studio`, then `http://127.0.0.1:4021/playground`): run the Agent with a synthetic request, confirm the Pipeline graph, MCP tools, and trace entries. Note the known risk in §13.7 (free-form chat may produce non-JSON output and fail validation).

Neither check is counted as PASS until done.

### 15.10 Final M1 compatibility gate decision

**Technical compatibility gate: PASS.** Every component in the Prompt 06 scope has execution evidence from this session. Typecheck, build, 49 offline tests, and 28 live tests pass, and the trace, eval, Studio, and Qdrant checks behave as intended.

**Not claimed:** production readiness. This is a spike with synthetic data, a local Qdrant, a local Lens backend, and a provider with a known JSON-reliability gap.

**Recommendation: proceed to Data Foundation**, with two conditions:
1. The user completes the two pending UI checks (§15.9), or explicitly accepts them as carry-over.
2. Payload indexes and the token-based chunking are built into the Data Foundation work before the production knowledge base is loaded.

Stop point: Prompt 06 is complete. Prompt 07 (or the next milestone) was not started.

### 15.11 Correction: Studio chat failed with HTTP 500 (fixed after Prompt 06)

- **Symptom:** the Studio playground chat returned HTTP 500 with `This completion model does not support streaming`. Pipeline and MCP tools in Studio worked.
- **Cause (our code):** `opaqueModelForStudio` in `src/studio/session.ts` forwarded `completion` and `traceRequest` but not `streamCompletion`. Core's `Agent.stream()` checks `typeof model.streamCompletion === "function"`, so the guard failed locally, before any gateway call. The real model had the method.
- **Fix:** the wrapper forwards `streamCompletion` only when the real model implements it (`isStreamingCompletionModel`), and calls it through the closure so the key is not exposed.
- **Evidence:** offline `studio.test.ts`: wrapper exposes `streamCompletion` for a streaming model and not for a non-streaming one; key absent. Live `studio-chat.live.test.ts` (real model, Studio `/agents/synthetic-scouting-agent/runs`): non-streaming run → 200 with a locally validated structured reply; streaming run → 200 from `stream_start` through `run_start`, `text_delta`, `run_end` to `stream_end`, with no error events.
- **Matrix correction:** row 17 earlier said Studio chat was PASS, but chat had not been exercised. It is now covered by the live test above.
- **Not yet verified:** the playground UI in a browser (still PENDING USER VERIFICATION, §15.9).
- **Model-level note:** the agent's structured output was accepted by local validation in these runs. Devscale still does not guarantee JSON, so the local check remains mandatory.
