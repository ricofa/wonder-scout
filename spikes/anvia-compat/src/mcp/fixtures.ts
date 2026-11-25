/** Fictional players served by the demo MCP tool. Synthetic only. */
export type DemoPlayer = {
  playerId: string;
  name: string;
  ageYears: number;
  positionGroup: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: string;
  metrics: { minutes: number; goalsPer90: number; assistsPer90: number; progressivePassesPer90: number };
};

export const DEMO_PLAYERS: Readonly<Record<string, DemoPlayer>> = Object.freeze({
  'SYN-101': { playerId: 'SYN-101', name: 'Ivo Marlow', ageYears: 21, positionGroup: 'MID', team: 'Fictional Rovers', metrics: { minutes: 1530, goalsPer90: 0.24, assistsPer90: 0.35, progressivePassesPer90: 7.65 } },
  'SYN-102': { playerId: 'SYN-102', name: 'Jonas Pell', ageYears: 19, positionGroup: 'MID', team: 'Synthetic United', metrics: { minutes: 980, goalsPer90: 0.09, assistsPer90: 0.18, progressivePassesPer90: 6.2 } },
  'SYN-103': { playerId: 'SYN-103', name: 'Kai Durand', ageYears: 22, positionGroup: 'DEF', team: 'Placeholder Athletic', metrics: { minutes: 2010, goalsPer90: 0.04, assistsPer90: 0.09, progressivePassesPer90: 5.1 } },
  'SYN-104': { playerId: 'SYN-104', name: 'Luca Brenn', ageYears: 20, positionGroup: 'FWD', team: 'Fictional Rovers', metrics: { minutes: 1400, goalsPer90: 0.51, assistsPer90: 0.13, progressivePassesPer90: 2.3 } },
  'SYN-105': { playerId: 'SYN-105', name: 'Milo Varga', ageYears: 18, positionGroup: 'MID', team: 'Mock City', metrics: { minutes: 610, goalsPer90: 0.15, assistsPer90: 0.3, progressivePassesPer90: 8.85 } },
  'SYN-106': { playerId: 'SYN-106', name: 'Nico Hale', ageYears: 23, positionGroup: 'GK', team: 'Synthetic United', metrics: { minutes: 2700, goalsPer90: 0, assistsPer90: 0, progressivePassesPer90: 1.2 } },
});

/** Requests for this ID make the tool throw (simulated internal failure). */
export const FAILING_PLAYER_ID = 'SYN-500';
/** Requests for this ID block until cancelled or `slowDelayMs` elapses (timeout tests). */
export const SLOW_PLAYER_ID = 'SYN-900';
