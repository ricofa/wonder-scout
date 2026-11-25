/**
 * FICTIONAL scouting methodology documents for the Qdrant compatibility spike (prompt 05).
 * They are written for this spike only and describe no real club, player or league data.
 * The TDD's 14-document corpus is NOT implemented here (out of scope for prompt 05).
 */
export const SYNTHETIC_KB_VERSION = 'kb-spike-synthetic-2026-11-25-a';

export const SYNTHETIC_DOCUMENTS_RAW: readonly string[] = [
  `---
document_id: progressive-midfielder
title: Progressive midfielder (fictional methodology)
version: 1.0.0
role_id: progressive-midfielder
seasons: [synthetic]
source_urls: []
reviewed_at: 2026-11-25
usage_rights: internal-synthetic-spike
status: active
---

# Progressive midfielder (fictional methodology)

## Role profile
A progressive midfielder moves the ball forward through the middle of the pitch. Success is judged by how often the player carries or passes the ball into the opponent's half and beyond the defensive line, not by total touches.

## Indicators to review
Review progressive passes per 90 minutes, progressive carries per 90 minutes and the share of passes that break a line. Read creative output (assists, key passes) next to these measures, because a player can progress the ball without creating chances.

## Interpretation and limitations
Progressive counts favour players on teams that build from deep. Compare a candidate with midfielders in the same tactical system before drawing conclusions. Do not rank a player on progression alone when minutes played are low.
`,
  `---
document_id: inside-forward
title: Inside forward (fictional methodology)
version: 1.0.0
role_id: inside-forward
seasons: [synthetic]
source_urls: []
reviewed_at: 2026-11-25
usage_rights: internal-synthetic-spike
status: active
---

# Inside forward (fictional methodology)

## Role profile
An inside forward starts wide and cuts inside onto the stronger foot to shoot or to combine in the penalty area. The role depends on shot-taking from wide and dribbling into central channels.

## Indicators to review
Review shots per 90 minutes taken from inside the penalty area, successful dribbles per 90 minutes and goals per 90 minutes. Check how often the player receives the ball on the left or right touchline before cutting inside.

## Interpretation and limitations
A high goal count from a small number of shots can reflect finishing variance rather than a repeatable skill. Use shot volume together with conversion before judging the role fit.
`,
  `---
document_id: evidence-confidence-rules
title: Evidence confidence rules (fictional methodology)
version: 1.0.0
role_id: null
seasons: [synthetic]
source_urls: []
reviewed_at: 2026-11-25
usage_rights: internal-synthetic-spike
status: active
---

# Evidence confidence rules (fictional methodology)

## Minimum sample
Assign low confidence when a player has fewer than 450 minutes in the period under review. Medium confidence applies from 450 to 1,349 minutes. High confidence requires at least 1,350 minutes in the same competitive context.

## Conflicting signals
When two indicators point in opposite directions, report both and lower the confidence level by one step. Never resolve a conflict by dropping the less favourable indicator.

## Missing data
Missing fields are reported as missing. They are never filled with averages from other players or seasons.
`,
  `---
document_id: metric-glossary
title: Metric glossary (fictional methodology)
version: 1.0.0
role_id: null
seasons: [synthetic]
source_urls: []
reviewed_at: 2026-11-25
usage_rights: internal-synthetic-spike
status: active
---

# Metric glossary (fictional methodology)

## Per 90 minutes
A per-90 value is a count divided by minutes played and multiplied by 90. It makes players with different playing time comparable, but it is unstable for very small samples.

## Progressive pass
A progressive pass moves the ball a set distance towards the opponent's goal from its starting point, or enters the final third. The exact distance threshold must be stated with any reported figure.

## Assist and key pass
An assist is a pass that directly leads to a goal. A key pass leads to a shot that does not necessarily score. The two measures are reported separately.
`,
];
