# WonderScout AI: Young Talent Discovery & Tactical Scouting Copilot

> **PRD | FINAL**  
> **Product:** WonderScout AI — Premier League Edition  
> **One-liner:** An evidence-driven AI scouting copilot that helps aspiring scouts and football analytics enthusiasts discover promising young players, evaluate role fit, compare performance, and save scouting shortlists grounded in available data.  
> **Owner:** Rico Fajar Afandi  
> **Proposed stack:** TypeScript, React (web), Node.js, Anvia, PostgreSQL, **Qdrant** (vector database), MCP Server, Anvia Lens  
> **Owner:** Rico Fajar Afandi, November 19, 2026.

---

## 01 — Problem + user

**Who hurts, and what does it cost?**

**Primary users.** Aspiring football scouts and football analytics enthusiasts who want to learn and practice evidence-driven scouting without enterprise tools. **Persona:** Dimas, a football enthusiast building a shortlist of promising Premier League players for a tactical role.

**Secondary users.** Football Manager (FM) players seeking real-world recruitment inspiration; football content creators making player analyses; and independent football analysts. **Future audience:** professional scouts and recruitment analysts after coverage and assessment quality have been proven.

**Pain.** Raw performance statistics are fragmented across seasons and do not automatically explain tactical fit. Users spend time finding candidates, normalizing data, interpreting player profiles, comparing evidence, and keeping track of whom to watch. The ongoing season has incomplete samples.

**Cost.** Repetitive manual analysis and weakly substantiated recommendations. There is **no measured time-savings baseline yet**; validate this through user testing.

**Goal.** From one scouting brief, return **3–5 eligible candidates** with reproducible role-fit calculations, two-season context where supported, data limitations, verifiable evidence, and a lightweight **Saved Shortlist/Watchlist** for future review. Do not claim to predict careers or transfer outcomes.

---

## 02 — Trigger → output

**What starts a run, what comes out?**

| Trigger                                                                                                                                                                     | Output                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Select the Premier League, age range (**18–23 inclusive** by default; adjustable **16–25**), position (GK/DEF/MID/FWD), season, and scouting brief; click **Run Scouting**. | **3–5 eligible candidates** with position, age at the evaluation date, team, selected statistics, data-supported role-fit score, evidence coverage, and concise reasoning. If fewer than three candidates qualify, show only those found—**never fabricate candidates**. |
| Click **Compare** for up to three players.                                                                                                                                  | Side-by-side metrics with definitions, units, minutes played, position/season benchmarks, and warnings where metrics are not comparable.                                                                                                                                 |
| Click **View Dossier**.                                                                                                                                                     | Player strengths, weaknesses, historical-versus-current-season trends, numerical evidence, methodology citations, data limitations, and a verdict: **watch / investigate / insufficient evidence**.                                                                      |
| Click **Save to Watchlist** or open **Saved Shortlist**.                                                                                                                    | Add, list, reopen, and remove selected candidates, linked to the original scouting run, role, and data snapshot. An optional short user note is supported; the app does not automatically update scores.                                                                 |
| Click **Why recommended?** or ask a follow-up.                                                                                                                              | An explanation grounded in retrieved methodology and verified player statistics. The agent may call MCP tools to gather additional evidence.                                                                                                                             |
| Request an unsupported role, or encounter invalid birth dates, missing metrics, or insufficient evidence.                                                                   | A clear **insufficient evidence / role not supported** result, including the missing requirements and suggested follow-up checks; no invented score.                                                                                                                     |

**UI surface.** A desktop-first web app with four core views: **Discover → Shortlist → Compare → Dossier**, plus a lightweight **Saved Shortlist** panel. AI insights live within the scouting dashboard, **not a chatbot-only interface**. No dedicated Football Manager mode.

---

## 03 — Workflow + agent

**Fixed steps vs. where the agent decides**

### FIXED STEPS (CODE — 1 Anvia agentic workflow)

`Validate scouting brief → load authorized data snapshot → resolve player identity and age → filter eligible candidates → calculate position-relative metrics, role fit, and data coverage → retrieve relevant RAG passages → invoke Scouting Agent → validate references and numbers → save run and render UI.`

- Filtering, per-90 calculations, percentiles, minimum-minute rules, role-fit scoring, and ranking are **deterministic**. The LLM does not calculate or invent these values.
- **2025/26** is the completed-season baseline. **2026/27** is the ongoing-season snapshot; show its `data_as_of` timestamp.
- Calculate age from a **verified date of birth** at the evaluation date. **Strict U23 = under 23 (ages 18–22)**; the product's default **18–23** preset is intentionally different.
- Calculate percentiles within comparable **season and position groups**. An FPL `MID` label does not, by itself, establish a tactical position such as central midfielder or winger.
- Produce a role-fit score only when that role's required metrics are present and sufficiently covered. Otherwise **abstain** and explain why.
- Watchlist actions are standard user-triggered database CRUD, **not a second AI agent or workflow**. Persist player, role, run, timestamp, user ownership, and optional note.

### AGENT DECIDES (LLM + TOOLS — 1 AI agent, up to 5 tool actions)

- Interpret the scouting brief and map it to a **supported, predefined** tactical role, or identify when no supported role matches.
- Decide which additional evidence to retrieve via MCP and which RAG guidance is relevant.
- Explain evidence-backed trade-offs between candidates without presenting unsupported opinions as facts.
- Identify inadequate evidence and return `insufficient_evidence` instead of guessing.

**Output contract.** Structured JSON: `run_id`, `snapshot_as_of`, `filters`, `candidates[]`, `role_id`, `fit_score|null`, `coverage`, `evidence_refs[]`, `methodology_refs[]`, `limitations[]`, `verdict`. All numerical and player-specific claims must resolve to valid evidence references. Watchlist rows store `user_id`, `player_id`, `run_id`, `role_id`, `snapshot_as_of`, `saved_at`, and optional `note`.

**Model:** Anvia-compatible model; provider to be chosen during the technical spike. **Human-in-the-loop:** Scouting verdicts are recommendations for human review, not automated recruitment decisions.

---

## 04 — RAG data

**Which documents, how many, from where?**

> RAG stores **scouting knowledge, metric definitions, and interpretation guidelines**. Individual player statistics stay in the structured database and are accessed through MCP; they are **not vectorized to perform numerical ranking**.

| Source / documents                                                                                                                                                                          | MVP volume                                                             | Origin                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tactical role guides:** sweeper keeper, defensive centre-back, attacking fullback, ball-winning midfielder, progressive midfielder, advanced playmaker, inside forward, pressing forward. | **8 original Markdown documents**, approximately 500–1,000 words each. | Authored for this project using attributable football-analysis references; each guide records source links, publication or review dates, and limitations.                      |
| **Scouting methodology:** football metrics glossary, tactical-fit/scoring methodology, evidence-confidence rules, and scouting-dossier rubric.                                              | **4 original Markdown documents.**                                     | Internal guidelines aligned with the verified FPL field definitions; conceptual references may include StatsBomb and other appropriately cited football-analysis publications. |
| **Dataset and season context:** schema/field definitions and a coverage/limitations register covering 2025/26 and 2026/27.                                                                  | **2 original Markdown documents.**                                     | [Vaastav data dictionary](https://github.com/vaastav/Fantasy-Premier-League/blob/master/DATA_DICTIONARY.md), the project's own data audit, and a provenance/license register.  |
| **Total**                                                                                                                                                                                   | **14 initial documents**                                               | Original or curated content; no wholesale reproduction of third-party publications.                                                                                            |

**Pipeline.** Markdown ingestion → metadata checks → chunks of approximately **300–600 tokens** (with limited overlap) → embeddings → **Qdrant** collections with payload metadata → top-5 retrieval filtered by `role`, `document_version`, `source`, and `season` → return chunk IDs, titles, and source references. Reindex documents when their content or metadata changes; no scheduled weekly sync is required for static guidance.

**Storage responsibilities.** **PostgreSQL** holds players, seasons, statistics, scouting runs, saved watchlist entries, and source-record references. **Qdrant** holds knowledge embeddings, chunks, and retrieval metadata. The two stores are not substitutes for one another.

**Citation rule.** Dossiers reference two distinct evidence types: **(a)** RAG methodology passages (`chunk_id` plus source) for tactical explanations, and **(b)** player-stat records (`player_id`, `season`, `metric`, `source_file`, `snapshot_as_of`) for performance claims. General methodology documents never serve as proof of an individual player's statistics.

---

## 05 — MCP

**Server you build, server you use**

**Choice: MCP Producer (build one server).** Implement **`wonderscout-data-mcp`** with these **read-only tools**:

| Tool                 | Inputs                                                            | Returns                                                                           |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `search_players`     | `season`, `age_min/max`, `position_group`, `min_minutes`, `limit` | Eligible candidates, stable IDs, and coverage flags.                              |
| `get_player_profile` | `player_id`, `as_of`                                              | Identity, birth-date validation status, team, positions, and season availability. |
| `get_player_stats`   | `player_id`, `season`, selected metrics                           | Numeric statistics, units, provenance, and snapshot timestamp.                    |
| `compare_players`    | `player_ids[]` (max 3), `role_id`, `season`                       | Comparable metrics, deterministic scores, and limitations.                        |
| `get_data_coverage`  | `role_id`, `position_group`, `season`                             | Available and missing metrics, scoring eligibility, and reasons to abstain.       |

**Why MCP?** The Anvia agent consumes typed scouting tools that can also be tested independently. The server reads only previously ingested data and does **not** scrape live websites during agent runs. It does not expose write access to the dataset. An external MCP consumer integration is not required for the MVP.

**Candidate data sources — publicly accessible, reuse rights pending verification:**

- [Vaastav FPL 2025/26](https://github.com/vaastav/Fantasy-Premier-League/tree/master/data/2025-26) and [2026/27](https://github.com/vaastav/Fantasy-Premier-League/tree/master/data/2026-27): primary candidates for player and gameweek CSVs.
- [FPL Core Insights](https://github.com/olbauday/FPL-Core-Insights): optional enrichment **only if** relevant field coverage and upstream rights are verified.

**Critical gate.** Vaastav's repository uses an MIT license for its software, **but identifies FPL/Understat as the owners of the underlying data**. Public download access does **not** automatically grant permission to redistribute or republish that data. Do not launch a public player-data explorer before confirming reuse permissions, attribution, and distribution scope. If permission cannot be established, use clearly labeled synthetic fixtures for the technical demo or switch to an appropriately licensed dataset; disable claims of actual player-scouting results.

---

## 06 — Evals + tracing

**What is correct, how you score, Lens or Langfuse**

| What is correct                                                                                    | How we score                                                                          | Initial target\* |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| Every candidate meets the age, season, position, and verified-date-of-birth constraints.           | Deterministic assertions against labeled fixtures.                                    | **100%**         |
| Per-90 metrics, percentiles, and role-fit scores match the calculation engine.                     | Compare numerical outputs with golden calculations using a defined tolerance.         | **100%**         |
| Every numerical claim in a dossier resolves to a valid player-stat record.                         | Evidence-reference validator and foreign-key checks.                                  | **100%**         |
| Qualitative assessments are supported by relevant evidence.                                        | Human rubric plus an LLM judge calibrated against 20 human-labeled examples.          | **≥90%**         |
| The agent abstains when the role, birth date, statistics, or supporting evidence are insufficient. | Exact-match checks for expected `insufficient_evidence` cases.                        | **≥95%**         |
| RAG retrieves the appropriate role/methodology passage.                                            | Recall@5 over labeled queries.                                                        | **≥0.85**        |
| MCP tool selection and input parameters are valid.                                                 | Tool-trace assertions.                                                                | **≥95%**         |
| Saved Shortlist creates, lists, reopens, and removes only the correct user-owned records.          | Deterministic API/integration tests for ownership, idempotency, and snapshot linkage. | **100%**         |

\*Initial engineering targets, **not achieved results**. Recalibrate after the first measured baseline.

**Evaluation dataset.** **60 labeled agent cases:** 30 normal scouting scenarios across four position groups and two seasons; 10 insufficient-evidence cases; 10 edge cases (invalid birth date, transfer, low minutes, duplicate names, null metrics); and 10 adversarial requests (such as inventing scores or ignoring coverage rules). Use synthetic fixtures for deterministic/golden tests; introduce real player data only after access and permissions have been verified. Run evaluations whenever prompts, tools, scoring versions, or RAG documents change. Watchlist CRUD receives separate deterministic integration tests, outside the 60 agent cases.

**Tracing: Anvia Lens.** Record `run_id`, data snapshot, retrieved Qdrant chunk IDs, MCP calls, token usage, latency, validation failures, abstention reasons, and the final outcome. Avoid recording entire third-party documents if storage rights are uncertain. Block merges for violations of 100% correctness invariants or a decrease of more than 3 percentage points from an approved quality baseline.

---

## 07 — Risks + scope

**What may fail, what you will not build**

| Risk                                                                                                                          | Mitigation                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data rights:** A CSV published on GitHub is not automatically licensed for reuse.                                           | Audit the original data owner's terms; document provenance; separate local PoC from public demo; provide a labeled synthetic fallback; **no unauthorized scraping**.                                  |
| **Insufficient tactical-position detail:** FPL categorizes players as GK/DEF/MID/FWD, not detailed tactical positions.        | Enable scores only for roles with validated input metrics; return `role_not_supported` when evidence is inadequate.                                                                                   |
| **Season bias:** 2026/27 is ongoing and playing time varies.                                                                  | Use per-90 normalization for count metrics, a minimum-minutes policy, coverage/confidence indicators, and visible snapshot dates. Use 2025/26 as context rather than blindly adding seasons together. |
| **Misleading hidden-gem labels:** FPL ownership and fantasy price are not reliable transfer valuations.                       | Treat _under-the-radar_ as an explicitly defined exploratory proxy, not proof of being undervalued or future success.                                                                                 |
| **Incorrect age, identity, or club after transfers.**                                                                         | Verify birth dates, apply an `as_of` date, maintain stable player-ID mappings, and audit cross-season joins. Missing DOB excludes candidates from strict age-filtered results.                        |
| **Hallucinated insights or mismatched metrics.**                                                                              | Deterministic scoring, role-coverage checks, evidence validation, abstention paths, and regression evals.                                                                                             |
| **Slow agent execution or excessive tool usage.**                                                                             | Cache player metrics and retrieval results, cap the agent at five tool actions, use read-only tools, and monitor latency and usage in Lens.                                                           |
| **Football Manager expectation mismatch:** real-world scores may be mistaken for in-game attributes or eligibility in a save. | Explicitly label results as real-world only; users check player availability, potential ability, prices, and tactics inside FM.                                                                       |
| **Saved shortlist data becomes stale or visible to another user.**                                                            | Persist `snapshot_as_of`, enforce user-level ownership, and do not silently rescore existing saved entries.                                                                                           |

| MVP BUILDS                                                                                                                                                                                                                                                                                                                                                                                                                          | WILL NOT BUILD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premier League only; **2025/26** and **2026/27** seasons; default age **18–23** (adjustable 16–25); GK/DEF/MID/FWD discovery; **2–4 scoring roles subject to the data audit**; Discover, Shortlist, Compare (max 3), Dossier, and **lightweight Saved Shortlist/Watchlist**; **1 Anvia workflow + 1 agent**; 14-document RAG in **Qdrant**; 1 MCP producer; Evals + Lens; robust evidence citations and insufficient-data handling. | Full multi-league scouting, academy/EPA scouting, live match-event processing, video scouting/computer vision, transfer-price prediction, guaranteed wonderkid prediction, unvalidated development tracking, Football Manager save-file import, game-attribute or Potential Ability estimation, native FM integration, automatic FM shortlist export, Football Manager-style simulation, automated recruitment decisions, native mobile apps, or redistribution of third-party data without permission. |

_AI Product Engineering with TypeScript · Anvia · WonderScout AI_
