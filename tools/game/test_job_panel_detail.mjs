import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../../src/components/JobPanel.tsx', import.meta.url), 'utf8');
const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');

assert.match(panelSource, /useState<JobId \| null>\(null\)/,
  'job rows open a persistent detail assignment view');
assert.match(panelSource, /onReassign\(job, ['"]idle['"]\)/,
  'the original minus button still moves one worker back to the unemployed pool');
assert.match(panelSource, /onReassign\(['"]idle['"], job\)/,
  'the original plus button still assigns one unemployed resident immediately');
assert.match(panelSource, /data-tut=\{`job-plus-\$\{job\}`\}/,
  'the original quick-assignment tutorial anchor remains on the plus button');
assert.match(panelSource, /resident\.skills\[job\] \?\? 0/,
  'each resident row reads skill for the selected job rather than the current job');
assert.match(panelSource, /\{residentDisplayAge\(resident\)\}세/,
  'detail rows show resident age');
assert.match(panelSource, /현재 \{JOB_NAMES\[selectedJob\]\}/);
assert.match(panelSource, />무직자</);
assert.match(panelSource, /onSetResidentJobs\(\[\.\.\.selectedAssignedIds\], ['"]idle['"]\)/,
  'checked workers can move down into the unemployed pool');
assert.match(panelSource, /onSetResidentJobs\(\[\.\.\.selectedIdleIds\], selectedJob\)/,
  'checked unemployed residents can move up into the selected job');
assert.match(panelSource, /assignmentBlockReason\(resident, selectedJob\)/,
  'ineligible unemployed residents remain visible with disabled reasons');
assert.match(panelSource, /jobSkill\(right, job\) - jobSkill\(left, job\)/,
  'candidate lists put the most experienced residents first');
assert.match(sessionSource, /for \(const residentId of residentIds\) setResidentJob/,
  'batch assignment updates every checked resident before one UI refresh');
assert.match(sessionSource, /onReassign=\{handleReassignJob\}/,
  'the session wires quick assignment alongside detailed assignment');

console.log('job panel detail tests passed');
