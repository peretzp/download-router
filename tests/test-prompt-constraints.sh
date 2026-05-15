#!/bin/bash
#
# test-prompt-constraints.sh — Verify the prompt still encodes every lesson
# learned from failed browser extension sessions.
#
# Each assertion maps to a real failure mode observed in production use.
# If a constraint is missing, the test fails with a description of the
# session that discovered the failure and what will break without it.
#
# This is the "institutional memory" of the system. Removing a constraint
# from the prompt without understanding why it was added will cause the
# same failure to recur in the next browser extension session.

set -euo pipefail

PROMPT="$(dirname "$0")/../examples/edd-sdi-download-prompt.md"
FAILURES=0
PASSED=0

assert_contains() {
  local pattern="$1"
  local session="$2"
  local consequence="$3"

  if grep -qi "$pattern" "$PROMPT"; then
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: prompt missing constraint"
    echo "  Pattern:     $pattern"
    echo "  Learned in:  $session"
    echo "  Without it:  $consequence"
    echo ""
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== Prompt Constraint Tests ==="
echo "Checking: $PROMPT"
echo ""

# --- Session 1 failures (194 steps) ---

assert_contains \
  "fetch\|XMLHttpRequest\|Blob" \
  "Session 1 (194 steps): used fetch() to download PDFs" \
  "EDD WAF detects non-browser requests and returns 'Access Denied', locking the session"

assert_contains \
  "fresh.*ref\|stale" \
  "Session 1 (194 steps): clicked stale refs after navigation" \
  "PostBack clicks silently fail or hit wrong elements, wasting 100+ steps"

assert_contains \
  "503.*google.*analytics\|analytics.*503\|ad.track\|tracker" \
  "Session 1 (194 steps): confused GA 503s with EDD server errors" \
  "Agent thinks downloads failed and enters retry loops that trigger WAF"

assert_contains \
  "page.*stays.*same\|page.*NOT.*navigate\|page.*will NOT" \
  "Session 1 (194 steps): expected page to change after download click" \
  "Agent thinks click failed because page didn't navigate, retries, triggers WAF"

# --- Session 2 failures (318 steps) ---

assert_contains \
  "dialog\|modal\|timeout.*warning\|log.*out.*warning" \
  "Session 2 (318 steps): invisible modal dialogs blocked all PostBack clicks" \
  "Clicks silently intercepted by modal overlay; agent spends 200+ steps retrying"

assert_contains \
  "Continue\|Cancel\|dismiss" \
  "Session 2 (318 steps): needed to dismiss dialogs before every click" \
  "Without proactive dismissal, every click after a timeout dialog fails"

assert_contains \
  "Supporting Documentation\|supporting doc" \
  "Session 2 (318 steps): clicked DE 1000A Appeal Form link, navigated to wizard" \
  "Supporting doc links can navigate to irreversible wizard pages, breaking flow"

assert_contains \
  "browser back\|back.forward\|ViewState" \
  "Session 2 (318 steps): used browser back, corrupted ASP.NET ViewState" \
  "ViewState corruption shows error page; session must be restarted from scratch"

# --- Structural requirements ---

assert_contains \
  "read_page.*interactive\|fresh.*ref" \
  "Both sessions: stale element refs caused majority of wasted steps" \
  "Single most common failure mode — must be called after every navigation"

assert_contains \
  "SDI Home\|Inbox" \
  "Session 2 (318 steps): nav bar Inbox link unreliable from detail pages" \
  "Without fallback navigation path, agent gets stuck on detail pages"

assert_contains \
  "Access Denied\|WAF\|blocked" \
  "Session 1: WAF triggered by automated-looking requests" \
  "Agent must stop immediately on WAF block, not retry (makes it worse)"

assert_contains \
  "wait.*[0-9].*second\|Wait.*[0-9]" \
  "Both sessions: rapid clicks overwhelmed the server and triggered WAF" \
  "Portal needs time between actions; too fast triggers rate limiting or WAF"

assert_contains \
  "click.*once\|NOT.*retry\|once.*download\|same link more than once" \
  "Session 1: retried download links 5+ times, triggered WAF" \
  "Each retry increases WAF risk; single click is sufficient for download"

echo "---"
echo "Passed: $PASSED"
echo "Failed: $FAILURES"
echo ""

if [[ $FAILURES -gt 0 ]]; then
  echo "The prompt is missing constraints learned from real failures."
  echo "Do not remove constraints without understanding the failure they prevent."
  exit 1
fi

echo "All constraints present. Institutional memory intact."
