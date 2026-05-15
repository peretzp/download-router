/**
 * test-dialog-snippet.js — Verify the dialog-dismiss JavaScript snippet
 * from the browser extension prompt behaves correctly.
 *
 * Tests the exact snippet that gets pasted into browser extension sessions.
 * Each test case maps to a real dialog observed on the EDD SDI portal.
 *
 * The snippet must:
 * - Click visible "Continue" buttons (extends session timeout)
 * - Click visible "Cancel" buttons (dismisses navigation confirmation)
 * - NOT click "OK" buttons (would proceed with unwanted navigation)
 * - NOT click hidden buttons (display:none dialogs are dismissed already)
 * - NOT click regular page buttons (Submit, Next, etc.)
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

// Extract the snippet from the actual prompt file to test the real thing
const promptPath = path.join(__dirname, '..', 'examples', 'edd-sdi-download-prompt.md');
const prompt = fs.readFileSync(promptPath, 'utf8');
const snippetMatch = prompt.match(/```javascript\n\(\(\) => \{[\s\S]*?\}\)\(\);\n```/);
if (!snippetMatch) {
  console.log('FAIL: Could not extract dialog-dismiss snippet from prompt');
  process.exit(1);
}
const snippet = snippetMatch[0].replace(/```javascript\n/, '').replace(/\n```$/, '');

// --- Mock DOM ---

function makeButton(tag, labelField, labelValue, visible) {
  const el = {
    _tag: tag,
    _clicked: false,
    offsetParent: visible ? {} : null,
    textContent: '',
    value: '',
    click() { this._clicked = true; },
    getAttribute(name) { return null; },
  };
  el[labelField] = labelValue;
  return el;
}

function runSnippet(buttons) {
  buttons.forEach(b => { b._clicked = false; });

  const mockGetComputedStyle = () => ({ visibility: 'visible' });
  const mockDocument = {
    querySelectorAll: () => buttons,
  };

  const fn = new Function('document', 'getComputedStyle',
    `return ${snippet}`
  );
  const result = fn(mockDocument, mockGetComputedStyle);
  return result;
}

// --- Test cases ---

console.log('=== Dialog Snippet Tests ===');
console.log('');

// Test 1: Session timeout dialog (Session 2, step ~45)
console.log('--- Test 1: Session timeout "Continue" button ---');
const timeoutBtn = makeButton('a', 'textContent', 'Continue', true);
const result1 = runSnippet([timeoutBtn]);
assert(timeoutBtn._clicked, 'Clicks visible Continue button');
assert(result1.includes('1'), 'Reports 1 button dismissed');

// Test 2: Navigation confirmation dialog (Session 2, step ~80)
console.log('--- Test 2: Navigation confirmation "Cancel" button ---');
const cancelBtn = makeButton('button', 'textContent', 'Cancel', true);
const okBtn = makeButton('a', 'textContent', 'OK', true);
runSnippet([cancelBtn, okBtn]);
assert(cancelBtn._clicked, 'Clicks Cancel (stay on page)');
assert(!okBtn._clicked, 'Does NOT click OK (would navigate away)');

// Test 3: Hidden dialog (already dismissed)
console.log('--- Test 3: Hidden dialog buttons not clicked ---');
const hiddenContinue = makeButton('input', 'value', 'Continue', false);
const hiddenCancel = makeButton('button', 'textContent', 'Cancel', false);
runSnippet([hiddenContinue, hiddenCancel]);
assert(!hiddenContinue._clicked, 'Does not click hidden Continue');
assert(!hiddenCancel._clicked, 'Does not click hidden Cancel');

// Test 4: Regular page buttons (not dialog-related)
console.log('--- Test 4: Regular page buttons not clicked ---');
const submitBtn = makeButton('button', 'textContent', 'Submit', true);
const nextBtn = makeButton('a', 'textContent', 'Next', true);
const linkToForm = makeButton('a', 'textContent', 'DE 429D, Notice of Computation', true);
runSnippet([submitBtn, nextBtn, linkToForm]);
assert(!submitBtn._clicked, 'Does not click Submit');
assert(!nextBtn._clicked, 'Does not click Next');
assert(!linkToForm._clicked, 'Does not click Link to Form');

// Test 5: Both dialogs present simultaneously
console.log('--- Test 5: Both dialogs at once ---');
const both = [
  makeButton('a', 'textContent', 'Continue', true),
  makeButton('button', 'textContent', 'Cancel', true),
  makeButton('a', 'textContent', 'OK', true),
  makeButton('button', 'textContent', 'Submit', true),
];
const result5 = runSnippet(both);
assert(both[0]._clicked, 'Clicks Continue');
assert(both[1]._clicked, 'Clicks Cancel');
assert(!both[2]._clicked, 'Skips OK');
assert(!both[3]._clicked, 'Skips Submit');
assert(result5.includes('2'), 'Reports 2 dismissed');

// Test 6: Case insensitivity
console.log('--- Test 6: Case insensitive matching ---');
const upperContinue = makeButton('input', 'value', 'CONTINUE', true);
const mixedCancel = makeButton('button', 'textContent', 'cancel', true);
runSnippet([upperContinue, mixedCancel]);
assert(upperContinue._clicked, 'Clicks CONTINUE (uppercase)');
assert(mixedCancel._clicked, 'Clicks cancel (lowercase)');

// Test 7: Button with whitespace in label
console.log('--- Test 7: Whitespace in labels ---');
const spacedBtn = makeButton('a', 'textContent', '  Continue  ', true);
runSnippet([spacedBtn]);
assert(spacedBtn._clicked, 'Clicks button with padded whitespace');

// Test 8: Empty page (no buttons)
console.log('--- Test 8: No buttons on page ---');
const result8 = runSnippet([]);
assert(result8.includes('0'), 'Reports 0 dismissed on empty page');

console.log('');
console.log('---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failures}`);
console.log('');

if (failures > 0) {
  console.log('Dialog snippet behavior does not match requirements.');
  process.exit(1);
}

console.log('All tests passed.');
