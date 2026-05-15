#!/bin/bash
#
# test-rename.sh — End-to-end tests for the EDD SDI rename script.
#
# Creates synthetic PDFs with known content, runs the rename script in
# both dry-run and --apply modes, and verifies output filenames match
# expected naming convention.
#
# Tests are derived from the actual EDD inbox (19 messages, 13 of which
# are DE 2500E payment notices that download with identical filenames).

set -euo pipefail

SCRIPT="$(dirname "$0")/../examples/edd-sdi-rename.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

SRC="$WORK/downloads"
DEST="$WORK/inbox"
mkdir -p "$SRC" "$DEST"

FAILURES=0
PASSED=0

assert_file_exists() {
  local path="$1"
  local desc="$2"
  if [[ -f "$path" ]]; then
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: $desc"
    echo "  Expected file: $path"
    echo "  Contents of $(dirname "$path"):"
    ls -1 "$(dirname "$path")" 2>/dev/null | sed 's/^/    /'
    echo ""
    FAILURES=$((FAILURES + 1))
  fi
}

assert_file_missing() {
  local path="$1"
  local desc="$2"
  if [[ ! -f "$path" ]]; then
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: $desc"
    echo "  File should not exist: $path"
    echo ""
    FAILURES=$((FAILURES + 1))
  fi
}

assert_output_contains() {
  local output="$1"
  local pattern="$2"
  local desc="$3"
  if echo "$output" | grep -q "$pattern"; then
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: $desc"
    echo "  Expected output to contain: $pattern"
    echo ""
    FAILURES=$((FAILURES + 1))
  fi
}

# --- Create synthetic PDFs ---

make_pdf() {
  local file="$1"
  local content="$2"
  # Minimal valid-ish PDF with searchable text
  printf '%%PDF-1.4\n%s\n%%%%EOF\n' "$content" > "$file"
}

echo "=== Rename Script Tests ==="
echo "Working dir: $WORK"
echo ""

# --- Test 1: Form identification ---
echo "--- Test 1: Form identification ---"

make_pdf "$SRC/doc1.pdf" "DE 429D Notice of Computation. Issue Date: 12/08/2025"
make_pdf "$SRC/doc2.pdf" "DE 2517-18 Notice of Claim Date Adjustment. Date: 12/09/2025"
make_pdf "$SRC/doc3.pdf" "DE 2517-01 Notice of Determination. Date: 12/19/2025"
make_pdf "$SRC/doc4.pdf" "DE 2525-A Notice of Exhaustion of Benefits. Date: 04/03/2026"

OUTPUT=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT" "DE-429D_Notice-of-Computation" "Identifies DE 429D"
assert_output_contains "$OUTPUT" "DE-2517-18_Notice-of-Claim-Date-Adjustment" "Identifies DE 2517-18"
assert_output_contains "$OUTPUT" "DE-2517-01_Notice-of-Determination" "Identifies DE 2517-01"
assert_output_contains "$OUTPUT" "DE-2525A_Notice-of-Exhaustion" "Identifies DE 2525-A"

# --- Test 2: Date extraction formats ---
echo "--- Test 2: Date extraction formats ---"

assert_output_contains "$OUTPUT" "2025-12-08" "Parses MM/DD/YYYY date"
assert_output_contains "$OUTPUT" "2025-12-09" "Parses second MM/DD/YYYY date"
assert_output_contains "$OUTPUT" "2026-04-03" "Parses third MM/DD/YYYY date"

rm -f "$SRC"/*.pdf
make_pdf "$SRC/month.pdf" "DE 429D Notice of Computation. Date: January 15, 2026"
OUTPUT2=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT2" "2026-01-15" "Parses 'Month DD, YYYY' date"

rm -f "$SRC"/*.pdf
make_pdf "$SRC/dash.pdf" "DE 429D Notice of Computation. Date: 03-17-2026"
OUTPUT3=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT3" "2026-03-17" "Parses MM-DD-YYYY date"

# --- Test 3: Duplicate handling ---
echo "--- Test 3: Duplicate handling ---"

rm -f "$SRC"/*.pdf "$DEST"/*.pdf
for i in 1 2 3 4; do
  make_pdf "$SRC/payment_$i.pdf" "DE 2500E Electronic Benefit Payment. Date: 01/16/2026"
done

OUTPUT4=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT4" "DE-2500E_Electronic-Benefit-Payment.pdf" "First duplicate has no suffix"
assert_output_contains "$OUTPUT4" "DE-2500E_Electronic-Benefit-Payment_1.pdf" "Second duplicate gets _1"
assert_output_contains "$OUTPUT4" "DE-2500E_Electronic-Benefit-Payment_2.pdf" "Third duplicate gets _2"
assert_output_contains "$OUTPUT4" "DE-2500E_Electronic-Benefit-Payment_3.pdf" "Fourth duplicate gets _3"

# --- Test 4: Dry-run matches --apply ---
echo "--- Test 4: Dry-run matches --apply ---"

rm -f "$DEST"/*.pdf
DRY=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1 | grep '^\s*->' | sed 's/.*-> //' | sort)
bash "$SCRIPT" --apply --dir "$SRC" --dest "$DEST" >/dev/null 2>&1
ACTUAL=$(ls -1 "$DEST" | sort)

if [[ "$DRY" == "$ACTUAL" ]]; then
  ((PASSED++))
  echo "  Dry-run output matches --apply result"
else
  echo "FAIL: Dry-run output differs from --apply result"
  echo "  Dry-run predicted:"
  echo "$DRY" | sed 's/^/    /'
  echo "  --apply produced:"
  echo "$ACTUAL" | sed 's/^/    /'
  echo ""
  ((FAILURES++))
fi

# --- Test 5: Non-EDD PDFs skipped ---
echo "--- Test 5: Non-EDD PDFs skipped ---"

rm -f "$SRC"/*.pdf "$DEST"/*.pdf
make_pdf "$SRC/grocery.pdf" "Receipt for groceries. Total: \$42.00"
make_pdf "$SRC/meeting.pdf" "Q3 planning meeting notes. Attendees: Alice, Bob"
make_pdf "$SRC/edd.pdf" "DE 429D Notice of Computation. Date: 12/08/2025"

bash "$SCRIPT" --apply --dir "$SRC" --dest "$DEST" >/dev/null 2>&1
assert_file_exists "$DEST/2025-12-08_DE-429D_Notice-of-Computation.pdf" "EDD PDF moved"
assert_file_exists "$SRC/grocery.pdf" "Non-EDD grocery PDF stays in source"
assert_file_exists "$SRC/meeting.pdf" "Non-EDD meeting PDF stays in source"

# --- Test 6: Counter accuracy ---
echo "--- Test 6: Counter accuracy ---"

rm -f "$SRC"/*.pdf "$DEST"/*.pdf
make_pdf "$SRC/a.pdf" "DE 429D Notice of Computation. Date: 12/08/2025"
make_pdf "$SRC/b.pdf" "DE 2500E Electronic Benefit Payment. Date: 01/16/2026"
make_pdf "$SRC/skip.pdf" "Receipt from coffee shop. Latte x2. Total: \$11.50"

OUTPUT6=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT6" "Processed:.*2 EDD" "Counter reports 2 (not 0, not 3)"
assert_output_contains "$OUTPUT6" "Skipped non-EDD:.*1" "Reports 1 skipped"

# --- Test 7: Empty directory ---
echo "--- Test 7: Empty directory ---"

rm -f "$SRC"/*.pdf "$DEST"/*.pdf
OUTPUT7=$(bash "$SCRIPT" --dir "$SRC" --dest "$DEST" 2>&1)
assert_output_contains "$OUTPUT7" "Processed:.*0" "Handles empty directory gracefully"

# --- Test 8: Chrome duplicate filenames ---
echo "--- Test 8: Chrome duplicate filenames ---"

rm -f "$SRC"/*.pdf "$DEST"/*.pdf
make_pdf "$SRC/DE2500E.pdf" "DE 2500E Electronic Benefit Payment. Date: 02/03/2026"
make_pdf "$SRC/DE2500E (1).pdf" "DE 2500E Electronic Benefit Payment. Date: 02/10/2026"
make_pdf "$SRC/DE2500E (2).pdf" "DE 2500E Electronic Benefit Payment. Date: 02/18/2026"

bash "$SCRIPT" --apply --dir "$SRC" --dest "$DEST" >/dev/null 2>&1
# Each has a DIFFERENT date, so they should get different date prefixes
assert_file_exists "$DEST/2026-02-03_DE-2500E_Electronic-Benefit-Payment.pdf" "Different-date dup 1"
assert_file_exists "$DEST/2026-02-10_DE-2500E_Electronic-Benefit-Payment.pdf" "Different-date dup 2"
assert_file_exists "$DEST/2026-02-18_DE-2500E_Electronic-Benefit-Payment.pdf" "Different-date dup 3"

echo ""
echo "---"
echo "Passed: $PASSED"
echo "Failed: $FAILURES"

if [[ $FAILURES -gt 0 ]]; then
  exit 1
fi

echo "All tests passed."
