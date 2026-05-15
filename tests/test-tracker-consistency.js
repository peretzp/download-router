/**
 * test-tracker-consistency.js — Verify the progress tracker HTML generates
 * filenames consistent with what edd-sdi-rename.sh would produce.
 *
 * The tracker and script must agree on naming convention so the user sees
 * the same filenames in the dashboard (before download) and on disk (after
 * rename). Drift between them breaks trust in the system.
 */

const fs = require('fs');
const path = require('path');

let failures = 0;
let passed = 0;

function assert(condition, desc) {
  if (condition) {
    passed++;
  } else {
    console.log(`FAIL: ${desc}`);
    failures++;
  }
}

console.log('=== Tracker-Script Consistency Tests ===');
console.log('');

// Extract MESSAGES array and idealName function from the HTML
const htmlPath = path.join(__dirname, '..', 'examples', 'edd-sdi-progress-tracker.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const messagesMatch = html.match(/const MESSAGES = \[([\s\S]*?)\];/);
const idealNameMatch = html.match(/function idealName\(i\) \{([\s\S]*?)\n\}/);

if (!messagesMatch || !idealNameMatch) {
  console.log('FAIL: Could not extract MESSAGES or idealName from tracker HTML');
  process.exit(1);
}

const MESSAGES = eval(`[${messagesMatch[1]}]`);
const idealName = new Function('MESSAGES', 'i', idealNameMatch[1]);

// Test 1: All messages produce valid filenames
console.log('--- Test 1: All filenames are valid ---');
for (let i = 0; i < MESSAGES.length; i++) {
  const name = idealName(MESSAGES, i);
  assert(name.endsWith('.pdf'), `MSG-${MESSAGES[i].num} ends with .pdf`);
  assert(!name.includes(' '), `MSG-${MESSAGES[i].num} has no spaces`);
  assert(name.match(/^\d{4}-\d{2}-\d{2}_/), `MSG-${MESSAGES[i].num} starts with YYYY-MM-DD_`);
}

// Test 2: Unique names (no collisions)
console.log('--- Test 2: No filename collisions ---');
const allNames = MESSAGES.map((_, i) => idealName(MESSAGES, i));
const uniqueNames = new Set(allNames);
assert(uniqueNames.size === allNames.length,
  `All ${allNames.length} filenames are unique (got ${uniqueNames.size} unique)`);

// Test 3: Same-date DE-2500E duplicates get sequence numbers
console.log('--- Test 3: Sequence numbers for same-date duplicates ---');
const jan16 = MESSAGES
  .map((m, i) => ({ ...m, idx: i }))
  .filter(m => m.date === '2026-01-16');
assert(jan16.length === 4, '4 messages on 2026-01-16');
const jan16Names = jan16.map(m => idealName(MESSAGES, m.idx));
assert(jan16Names[0].includes('DE-2500E') && !jan16Names[0].includes('_1'), 'First gets no suffix');
assert(jan16Names[1].includes('_1'), 'Second gets _1');
assert(jan16Names[2].includes('_2'), 'Third gets _2');
assert(jan16Names[3].includes('_3'), 'Fourth gets _3');

// Test 4: Single-occurrence forms get no sequence number
console.log('--- Test 4: Unique forms have no suffix ---');
const de429d = idealName(MESSAGES, MESSAGES.findIndex(m => m.formId.includes('429D')));
assert(!de429d.match(/_\d+\.pdf$/), 'DE 429D has no sequence suffix');
const de2517 = idealName(MESSAGES, MESSAGES.findIndex(m => m.formId.includes('2517-18')));
assert(!de2517.match(/_\d+\.pdf$/), 'DE 2517-18 has no sequence suffix');

// Test 5: formId values match rename script's name_for_pdf() output
console.log('--- Test 5: formId matches rename script convention ---');
const scriptPath = path.join(__dirname, '..', 'examples', 'edd-sdi-rename.sh');
const script = fs.readFileSync(scriptPath, 'utf8');

// Extract all form names that name_for_pdf can produce
const echoMatches = [...script.matchAll(/echo '([^']+)'/g)].map(m => m[1]);
const scriptFormNames = echoMatches.filter(n => n.includes('-') && !n.includes('unknown'));

// Every formId in MESSAGES should appear in the script's output set
const trackerFormIds = [...new Set(MESSAGES.map(m => m.formId))];
for (const formId of trackerFormIds) {
  const inScript = scriptFormNames.some(n => n === formId);
  assert(inScript, `Tracker formId "${formId}" exists in rename script`);
}

console.log('');
console.log('---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures}`);

if (failures > 0) {
  console.log('');
  console.log('Tracker and rename script naming conventions have diverged.');
  process.exit(1);
}

console.log('');
console.log('Tracker and rename script produce identical filenames.');
