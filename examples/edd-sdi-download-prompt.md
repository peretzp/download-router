# EDD SDI Portal — Download All Inbox Documents (v3)

**Paste everything below the `---` line into a fresh Claude browser extension session.**
You should already be logged in and on the Inbox/Message Center page.

---

Download all 19 PDF documents from my EDD SDI Online portal inbox. I'm already logged in and on the Inbox/Message Center page. Claim ID DI-1014-230-142.

## CRITICAL RULES — READ ALL BEFORE DOING ANYTHING

### NEVER use JavaScript to download
- **NEVER use `fetch()`, `XMLHttpRequest`, `__doPostBack()`, or `Blob` downloads.**
  The EDD portal has a WAF that will block you with "Access Denied" if it detects these.
- **ONLY click links using the browser extension's native `click` action.**

### DISMISS MODAL DIALOGS BEFORE EVERY CLICK
This is the #1 issue from previous sessions. The EDD portal has TWO modal dialogs
that pop up silently and **block all clicks on the page beneath them**:

1. **"Automatic Log Out Warning"** — session timeout dialog with a "Continue" button
2. **"Confirm Navigation"** — appears after clicking external links, has "OK"/"Cancel"

**Before EVERY click you make** (navigation, download, anything), run this JavaScript
first to dismiss any visible dialogs. This is safe — it just clicks DOM buttons,
no network requests:

```javascript
document.querySelectorAll('a[id*="Continue"], a[id*="btnOK"], input[id*="Continue"], input[id*="btnOK"]').forEach(el => { if (el.offsetParent !== null) el.click(); });
```

If you skip this step, your clicks will silently fail and you'll waste dozens of
steps wondering why nothing happens. The dialogs are invisible in screenshots but
they block the PostBack JavaScript from executing.

### Navigation — fresh refs after EVERY page load
- **After EVERY navigation**, call `read_page(interactive)` to get FRESH refs.
  Old refs are STALE and will silently fail.
- **Navigate through the portal UI ONLY.** Never type URLs — ASP.NET ViewState will break.
- **NEVER use browser back/forward.** It corrupts ViewState and shows error pages.
  Always use the portal's own Inbox/Home links.

### Going back to Inbox
Getting back to the Inbox from a detail page is tricky. The nav bar "Inbox" link
(href="#") sometimes works and sometimes doesn't. Use this reliable method:

1. Run the dialog-dismiss JS snippet above
2. Click the "SDI Home" link in the left sidebar or nav bar
3. Wait 5 seconds, get fresh refs
4. Click the "Inbox [ New: X, Total: 19 ]" link in the page body (NOT the nav bar)
5. Wait 5 seconds, get fresh refs

If a direct "Inbox" click works (you land on the Message Center), great. If not,
use the SDI Home → body Inbox link path as a reliable fallback.

### Downloading — click and wait
- Click **only the "Link to Form" link**. The page stays the same after clicking
  — this is normal. The server sends back a PDF file download silently.
- **Wait 8 seconds** after clicking Link to Form. Then move on.
- **SKIP all "Supporting Documentation" links.** Do NOT click them. They are either:
  - Generic public pamphlets from edd.ca.gov (not claim-specific)
  - Dangerous navigation links (like "DE 1000A Appeal Form") that take you to a
    wizard page and break your flow. A previous session hit this exact trap.
- If "Link to Form" is empty, the message is text-only. Log it and move on.

### Pacing
- **Wait at least 5 seconds between any two clicks.**
- **Do NOT click the same link more than once.** One click = one download.
- **Do NOT retry a download.** If it seems to fail, log "possible-fail" and move on.

### Error handling
- **503 from google-analytics/collect endpoints**: IGNORE. Normal ad tracker noise.
- **503 from sdio.edd.ca.gov**: Download may still have worked. Log "possible-503", move on.
- **"Access Denied" page**: STOP IMMEDIATELY. Tell me. WAF blocked you.
- **Session timeout / login page**: STOP. Tell me. I need to re-authenticate.
- **Error page saying "click Next to restart"**: Click Next, navigate to SDI Home,
  then to Inbox, and continue where you left off. Do NOT use browser back.

### Progress log
After each message, log to console (this is safe — just a log, no network requests):

```javascript
console.log(`MSG-${String(N).padStart(2,'0')} | ${date} | ${subject} | ${status}`);
```

Status: `downloaded`, `text-only`, `failed`, `skipped`

## THE 19 MESSAGES

| MSG | Date | Subject | Notes |
|-----|------|---------|-------|
| 01 | 2025-11-01 | Additional Benefits for DI Claimants | Text-only (no PDF) — SKIP |
| 02 | 2025-12-08 | DE 429D, Notice of Computation | SKIP supporting docs |
| 03 | 2025-12-09 | DE 2517-18, Notice of Claim Date Adjustment | |
| 04 | 2025-12-19 | DE 2517-01, Notice of Determination | SKIP supporting docs |
| 05 | 2026-01-15 | Response to Your inquiry | |
| 06 | 2026-01-16 | Electronic Benefit Payment DE 2500E | |
| 07 | 2026-01-16 | Electronic Benefit Payment DE 2500E | |
| 08 | 2026-01-16 | Electronic Benefit Payment DE 2500E | |
| 09 | 2026-01-16 | Electronic Benefit Payment DE 2500E | |
| 10 | 2026-02-03 | Electronic Benefit Payment DE 2500E | |
| 11 | 2026-02-04 | New Medical Information Received | |
| 12 | 2026-02-10 | Electronic Benefit Payment DE 2500E | |
| 13 | 2026-02-11 | Notice of Automatic Payment | |
| 14 | 2026-02-18 | Electronic Benefit Payment DE 2500E | |
| 15 | 2026-03-03 | Electronic Benefit Payment DE 2500E | |
| 16 | 2026-03-17 | Electronic Benefit Payment DE 2500E | |
| 17 | 2026-03-31 | Electronic Benefit Payment DE 2500E | |
| 18 | 2026-04-02 | Electronic Benefit Payment DE 2500E | |
| 19 | 2026-04-03 | DE 2525-A, Notice of Exhaustion | Already downloaded — SKIP |

## PROCEDURE (repeat for each message)

```
 1. DISMISS DIALOGS: run the dialog-dismiss JS snippet
 2. INBOX PAGE: read_page(interactive) for fresh refs
 3. Click the message row for MSG-N
 4. Wait 5 seconds
 5. Check: did the page change to a detail view?
    - YES → continue to step 6
    - NO → run dialog-dismiss JS, get fresh refs, try clicking once more.
           If still no → log "failed" and move to next message.
 6. DETAIL PAGE: read_page(interactive) for fresh refs
 7. Read "Link to Form" field
    - Empty → log "text-only", go to step 10
    - Has link → continue to step 8
 8. Run dialog-dismiss JS, then click "Link to Form" (native click)
 9. Wait 8 seconds. Page stays the same — this means the download worked.
10. Navigate back to Inbox:
    a. Run dialog-dismiss JS
    b. Click "SDI Home" link, wait 5 seconds
    c. Get fresh refs
    d. Click body "Inbox" link, wait 5 seconds
11. Go to step 1 for next message
```

## AFTER ALL MESSAGES

1. Navigate to **Claim Summary** page
2. Take a screenshot
3. Check: any response to the Claim Update Request from March 2-3, 2026?
4. Report what you see

## FINAL SUMMARY

When done, tell me in chat:
- How many downloaded successfully
- Which ones failed or were text-only
- Whether the Claim Summary shows anything about the March 2026 update request

I'll check ~/Downloads for the PDFs and rename them afterward.
