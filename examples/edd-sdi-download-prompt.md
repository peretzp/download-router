# EDD SDI Portal — Download All Inbox Documents

**Copy everything below the line into a fresh Claude browser extension session.**
**Before starting:** make sure you're logged into https://sdio.edd.ca.gov and on the Inbox/Message Center page.

---

## TASK

Download all 19 PDF documents from my EDD SDI Online inbox. I am Peretz Partensky, Claim ID DI-1014-230-142.

## RULES — READ THESE BEFORE DOING ANYTHING

### Navigation
- **NEVER reuse old page element references after navigating.** After every page load, use `find` or `read_page(interactive)` to get FRESH references. Old refs are stale and will click the wrong thing or do nothing.
- **Navigate through the portal UI ONLY.** Never type URLs directly — the portal uses ASP.NET ViewState and will log you out.
- **To go back to Inbox:** always click the "Inbox" or "Message Center" navigation link, then wait 3+ seconds, then get fresh refs.

### Downloading
- **Just click the "Link to Form" link normally.** It triggers a server-side PostBack that generates a PDF. The browser will download it automatically. Do NOT use fetch(), XMLHttpRequest, or JavaScript workarounds — just click the link.
- **After clicking "Link to Form", wait 8 seconds.** The server generates the PDF. The page will stay the same (this is expected — the server sends back a file download, not a page navigation).
- **If a message has "Supporting Documentation" links too**, download those as well (same method — just click each one, wait 8 seconds between clicks).
- **If "Link to Form" is empty or missing**, that message is text-only. Note it in the log and move on.

### Error handling
- **Ignore 503 errors from google-analytics, googletagmanager, or collect endpoints.** Those are ad trackers, not the EDD server. They don't affect your downloads.
- **If a real EDD server POST returns 503**, wait 30 seconds and try that one message again (once). If it fails twice, skip it and note it in the log.
- **If you get logged out**, STOP and tell me. Don't try to log back in.

### Progress tracking
- **Maintain a running log as a JavaScript console note.** After processing each message, run this in the console:

```javascript
console.log(`✓ MSG-${msgNum} | ${date} | ${subject} | ${status}`);
// status = "downloaded" or "text-only" or "failed:reason" or "skipped:reason"
```

## THE 19 MESSAGES TO DOWNLOAD

Work through these IN ORDER, top to bottom. For each one: click into it from Inbox, download the PDF, go back to Inbox, repeat.

| # | Date | Subject | Priority |
|---|------|---------|----------|
| 1 | 11-01-2025 | Additional Benefits for Disability Insurance Claimants | low (likely text-only) |
| 2 | 12-08-2025 | DE 429D, Notice of Computation | HIGH |
| 3 | 12-09-2025 | DE 2517-18, Notice of Claim Date Adjustment | HIGH |
| 4 | 12-19-2025 | DE 2517-01, Notice of Determination | HIGH |
| 5 | 01-15-2026 | Response to Your inquiry (Claim Update Response) | HIGH |
| 6 | 01-16-2026 | Electronic Benefit Payment DE 2500E | medium |
| 7 | 01-16-2026 | Electronic Benefit Payment DE 2500E | medium |
| 8 | 01-16-2026 | Electronic Benefit Payment DE 2500E | medium |
| 9 | 01-16-2026 | Electronic Benefit Payment DE 2500E | medium |
| 10 | 02-03-2026 | Electronic Benefit Payment DE 2500E | medium |
| 11 | 02-04-2026 | New Medical Information Received | medium |
| 12 | 02-10-2026 | Electronic Benefit Payment DE 2500E | medium |
| 13 | 02-11-2026 | Notice of Automatic Payment | medium |
| 14 | 02-18-2026 | Electronic Benefit Payment DE 2500E | medium |
| 15 | 03-03-2026 | Electronic Benefit Payment DE 2500E | medium |
| 16 | 03-17-2026 | Electronic Benefit Payment DE 2500E | medium |
| 17 | 03-31-2026 | Electronic Benefit Payment DE 2500E | HIGH (unviewed) |
| 18 | 04-02-2026 | Electronic Benefit Payment DE 2500E | medium |
| 19 | 04-03-2026 | DE 2525-A, Notice of Exhaustion | already downloaded |

## STEP-BY-STEP PROCEDURE (repeat for each message)

```
1. On Inbox page: read_page(interactive) to get fresh element refs
2. Find and click the message row for MSG-N
3. Wait 4 seconds for page load
4. Take screenshot to confirm message detail page loaded
5. read_page(interactive) to get fresh refs on the detail page
6. Look for "Link to Form" — if empty, log "text-only" and go to step 10
7. Click the "Link to Form" link
8. Wait 8 seconds (PDF is being generated and downloaded by browser)
9. Log success: console.log("✓ MSG-N downloaded")
10. Click "Inbox" navigation link to go back
11. Wait 3 seconds
12. Repeat from step 1 for next message
```

## ALSO CHECK

After downloading all messages, navigate to the **Claim Summary** page and:
- Take a screenshot
- Check if there's any response to the Claim Update Request submitted March 2-3, 2026 (effective date change to Sep 1)
- Report what you see

## WHEN FINISHED

Print a final summary table to the console:

```javascript
console.log("=== EDD SDI Download Summary ===");
console.log("MSG-01: [status]");
console.log("MSG-02: [status]");
// ... etc for all 19
console.log("Total downloaded: X / 19");
console.log("Failed: [list any failures]");
```

Then tell me the results so I can check my Downloads folder and run download-router to sort them.
