import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policySource = readFileSync(new URL('./simulate_trade_autoplay.mjs', import.meta.url), 'utf8');
const measureSource = readFileSync(new URL('./measure_release_candidate_balance.mjs', import.meta.url), 'utf8');

assert.match(policySource, /export \{[\s\S]*placementCandidates[\s\S]*manageConstruction[\s\S]*rebalanceJobs[\s\S]*handleChoice[\s\S]*emptyMetrics[\s\S]*\};/,
  'the established non-cheating autoplay policy must be reusable by the RC measurement');
assert.match(policySource, /if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\)/,
  'importing the policy must not execute the legacy benchmark main loop');
assert.match(policySource, /export \{[\s\S]*tryTradeForTarget[\s\S]*\};/,
  'the RC policy must be able to request a visible resource target through the normal trade API');

assert.match(measureSource, /const DEFAULT_RUNS = 16;/,
  'release-candidate measurement must default to sixteen fixed seeds');
assert.match(measureSource, /const DEFAULT_YEARS = 10;/,
  'release-candidate measurement must default to at least ten game years');
assert.match(measureSource, /simulation\.newGame\(seed, 'normal'\)/,
  'release-candidate measurement must use normal difficulty');
assert.match(measureSource, /AUTOPLAY_POLICY_DESCRIPTION/,
  'the automatic choice and management policy must be documented in the output');
assert.match(measureSource, /function rebalanceReleaseJobs\([\s\S]*season === 'winter'/,
  'release autoplay must reassign otherwise-idle farmers during winter');
assert.match(measureSource, /function tryReleaseTrade\(/,
  'release autoplay must manage explicit food, fuel, and tool reserves without hidden state');
assert.match(measureSource, /function collectNewLogs\(/,
  'daily log metrics must survive the capped rolling log buffer');
assert.match(measureSource, /crop\.plantSeasons\.includes\([\s\S]*!crop\.plantSeasons\.includes/,
  'large-plot sowing rate must be sampled at the crop planting deadline rather than averaged across winter');
assert.match(measureSource, /!beforeAlive\.has\(resident\.id\)[\s\S]*resident\.motherId/,
  'birth counts must use new family-linked resident ids instead of depending only on log text');
assert.match(measureSource, /function handleReleaseChoice\([\s\S]*choice\.kind === 'immigration'[\s\S]*projectedFoodDays[\s\S]*projectedFuelDays/,
  'immigration acceptance must account for the enlarged population food and winter fuel reserve');
assert.match(measureSource, /function reconcileCandidateFulfillment\([\s\S]*courtTribute\?\.resolved[\s\S]*lastKimjangYear/,
  'waived tribute and completed kimjang deadlines must not be reported as missed choices');
assert.match(measureSource, /function manageCropPlan\([\s\S]*summer[\s\S]*buckwheat[\s\S]*autumn[\s\S]*barley/,
  'a late first-field completion must use the current legal planting window instead of waiting a full year');
assert.match(measureSource, /firstFoodPlotReady[\s\S]*\? 2 :/,
  'the first large food plot must receive two builders so map distance does not consume the planting window');

for (const field of [
  'occurrenceDay', 'displayDay', 'waitDays', 'expiresDay', 'expired', 'retryCount',
  'multipleCandidateDays', 'longestWait', 'deadlineMisses',
]) {
  assert.match(measureSource, new RegExp(`\\b${field}\\b`), `event audit must record ${field}`);
}

for (const field of [
  'ageStages', 'marriages', 'births', 'deathCauses', 'minFoodDays', 'minFuelDays',
  'spoilageLoss', 'preservedFoodProduced', 'kimjangSuccesses', 'jangProduced',
  'saltShortageDays', 'livestockBirths', 'livestockStarvationDeaths', 'hayShortageDays',
  'silverIncome', 'silverSpending', 'secretMiningDays', 'youthWorkDays', 'youthSchoolDays',
  'largePlotAverageSowingRate', 'unsownTiles', 'unharvestedLosses', 'plowOxUseDays',
  'longVacancies', 'averageMorale', 'minimumMorale', 'unmetSatisfactionByRank',
  'burialDelayDays', 'maxUnburiedCorpses', 'specialResidentsJoined', 'specialResidentsDeparted',
  'maxSuspicion', 'inspections', 'censures', 'crackdowns', 'rankReach', 'survivedTenYears',
]) {
  assert.match(measureSource, new RegExp(`\\b${field}\\b`), `balance output must include ${field}`);
}

assert.match(measureSource, /validateStructuralIntegrity\(state\)/,
  'every simulated day must check resident, building, livestock, corpse, and numeric integrity');
assert.match(measureSource, /saveLoad\.saveGame\(state, 1\)[\s\S]*saveLoad\.loadGame\(1\)/,
  'each completed run must prove the resulting state can save and reload');
assert.doesNotMatch(measureSource, /durationMs[\s\S]*(?:throw|process\.exit)/,
  'wall-clock duration must remain informational rather than a balance failure');

console.log('release candidate measurement structure tests passed');
