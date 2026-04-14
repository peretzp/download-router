# EDD SDI Portal — Download All Inbox Documents (v2)

**Copy everything below the `---` line into a fresh Claude browser extension session.**

**Pre-flight checklist:**
1. You are logged into https://sdio.edd.ca.gov and see the Inbox/Message Center
2. Your Chrome Downloads folder is the default (`~/Downloads`)
3. You have NOT been blocked by EDD's security system in the last hour

---

## TASK

Download all 19 PDF documents from my EDD SDI Online inbox.
I am Peretz Partensky, Claim ID DI-1014-230-142.

## CRITICAL RULES — READ ALL BEFORE DOING ANYTHING

### NEVER use JavaScript to download
- **NEVER use `fetch()`, `XMLHttpRequest`, `__doPostBack()`, or `Blob` downloads.**
  The EDD portal has a WAF (Web Application Firewall) that detects these as suspicious
  automated requests. It WILL block you with an "Access Denied" page and lock the session.
  A previous session triggered this exact error.
- **ONLY click links using the browser extension's native `click` action.** That's it.
  No JavaScript workarounds. No programmatic form submissions. Just click.

### Navigation — fresh refs after EVERY page load
- **After EVERY navigation** (clicking a message, going back to Inbox, any page change),
  you MUST call `read_page(interactive)` to get FRESH element references.
  Old refs are STALE and will silently fail or click the wrong element.
- This was the #1 source of wasted steps in the previous session. Don't skip this.
- **Navigate through the portal UI ONLY.** Never type URLs. The portal uses ASP.NET
  ViewState — direct URL navigation will log you out.

### Downloading — click and wait
- Click "Link to Form" using the native click action. It triggers a server-side
  PostBack that returns a PDF as a file download. The page will NOT navigate —
  it stays on the same message detail page. This is normal and expected.
- **Wait 12 seconds after each click** before doing anything else. The server
  needs time to generate the PDF, and you need to avoid overwhelming it.
- If the message also has "Supporting Documentation" links, download those too
  (same method — click, wait 12 seconds, next click).
- If "Link to Form" is empty or missing, the message is text-only. Log it and move on.

### Pacing — go slow to avoid the WAF
- **Wait at least 5 seconds between any two clicks** (navigation, downloads, anything).
- **Do NOT click the same link more than once.** If you clicked it and the page
  stayed the same, the download happened silently. Move on.
- **Do NOT retry a download more than once.** If it fails, log it and move on.
  Retrying aggressively is what triggers the WAF.

### Handling errors
- **503 from google-analytics/googletagmanager/collect endpoints**: IGNORE. These are
  ad tracker errors, not EDD server errors. They happen constantly and are harmless.
- **503 from sdio.edd.ca.gov on a POST**: The download may still have succeeded if the
  page didn't change. Note it in the log as "possible-503" and move on. Do NOT retry.
- **"Access Denied" page**: STOP IMMEDIATELY. Tell me. Do not click anything else.
  The WAF has blocked you. I need to wait and log in fresh.
- **Session timeout / login page**: STOP. Tell me. I need to re-authenticate.

### File naming
- The EDD server chooses the download filename (via Content-Disposition header).
  You CANNOT control it — and you must NOT try to rename files via JavaScript.
- Many files (especially the 13 DE 2500E payment notices) will download with
  the SAME filename. Chrome will auto-append ` (1)`, ` (2)`, etc. This is fine.
- **Your job is to track which download corresponds to which message** so I can
  rename them afterward. Record this in your progress log (see below).

### Progress log — maintain this throughout
After processing each message, run this ONE console.log (this is safe — it's
just logging, not making network requests):

```javascript
console.log(`MSG-${String(N).padStart(2,'0')} | ${date} | ${subject} | ${status} | downloaded_as: ${filename_if_known_or_'unknown'}`);
```

Where status is one of: `downloaded`, `text-only`, `failed`, `skipped`, `possible-503`

## THE 19 MESSAGES

Work through IN ORDER. For each: open from Inbox → download → back to Inbox → next.

| MSG | Date | Subject | Notes |
|-----|------|---------|-------|
| 01 | 2025-11-01 | Additional Benefits for DI Claimants | Likely text-only (no PDF) |
| 02 | 2025-12-08 | DE 429D, Notice of Computation | Has supporting docs too |
| 03 | 2025-12-09 | DE 2517-18, Notice of Claim Date Adjustment | |
| 04 | 2025-12-19 | DE 2517-01, Notice of Determination | |
| 05 | 2026-01-15 | Response to Your inquiry | Claim Update Response |
| 06 | 2026-01-16 | Electronic Benefit Payment DE 2500E | |
| 07 | 2026-01-16 | Electronic Benefit Payment DE 2500E | Same date as 06 |
| 08 | 2026-01-16 | Electronic Benefit Payment DE 2500E | Same date as 06 |
| 09 | 2026-01-16 | Electronic Benefit Payment DE 2500E | Same date as 06 |
| 10 | 2026-02-03 | Electronic Benefit Payment DE 2500E | |
| 11 | 2026-02-04 | New Medical Information Received | |
| 12 | 2026-02-10 | Electronic Benefit Payment DE 2500E | |
| 13 | 2026-02-11 | Notice of Automatic Payment | |
| 14 | 2026-02-18 | Electronic Benefit Payment DE 2500E | |
| 15 | 2026-03-03 | Electronic Benefit Payment DE 2500E | |
| 16 | 2026-03-17 | Electronic Benefit Payment DE 2500E | |
| 17 | 2026-03-31 | Electronic Benefit Payment DE 2500E | Was unviewed |
| 18 | 2026-04-02 | Electronic Benefit Payment DE 2500E | |
| 19 | 2026-04-03 | DE 2525-A, Notice of Exhaustion | Already downloaded — skip |

## STEP-BY-STEP PROCEDURE (repeat for each message)

```
 1. INBOX PAGE: call read_page(interactive) → get fresh refs
 2. Find the message row for MSG-N. Click it.
 3. Wait 5 seconds.
 4. DETAIL PAGE: call read_page(interactive) → get fresh refs
 5. Take screenshot to confirm you're on the right message.
 6. Read the "Link to Form" field.
    - If empty → log "text-only", go to step 11.
    - If present → continue to step 7.
 7. Click the "Link to Form" link (native click, NOT JavaScript).
 8. Wait 12 seconds. Page stays the same — this is normal.
 9. If the message has "Supporting Documentation" links:
    - Click each one, waiting 12 seconds between clicks.
10. Log the result: console.log("MSG-NN | date | subject | downloaded")
11. Click the "Inbox" / "Message Center" nav link to go back.
12. Wait 5 seconds.
13. Go to step 1 for the next message.
```

**IMPORTANT:** Steps 1 and 4 (get fresh refs) are NOT optional. Skipping them
is what caused the previous session to waste 100+ steps clicking stale elements.

## AFTER ALL MESSAGES

1. Navigate to the **Claim Summary** page.
2. Take a screenshot.
3. Check: is there any response to the Claim Update Request submitted March 2-3, 2026
   (requesting effective date change to Sep 1)?
4. Report what you see.

## FINAL SUMMARY

When done, print this to the console AND tell me in chat:

```javascript
console.log("=== EDD SDI Download Summary ===");
// For each message:
console.log("MSG-01 | 2025-11-01 | Additional Benefits        | text-only");
console.log("MSG-02 | 2025-12-08 | DE 429D                    | downloaded | filename.pdf");
// ... all 19 ...
console.log("Total downloaded: X / 19");
console.log("Skipped: [list]");
console.log("Failed: [list]");
```

I will then use a rename script to give the downloaded files proper names like:
`2025-12-08_DE-429D_Notice-of-Computation.pdf`

So the filename tracking in your log is essential — it's how I'll match downloads to messages.
