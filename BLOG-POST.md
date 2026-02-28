# My Download Folder Sorts Itself

I had 336 unsorted files in `~/Downloads`. Screenshots next to PDFs next to `.dmg` files next to CSVs from three weeks ago. Everyone has this problem. Nobody fixes it permanently because manual cleanup is Sisyphean — you clean it up, and a week later it's chaos again.

So I wrote a daemon. One file, zero dependencies, ~450 lines of Node.js. It watches `~/Downloads` and routes files to destinations based on rules I defined in JSON. It's been running on my Mac as a LaunchAgent for months. I never think about my Downloads folder anymore.

## How It Works

You create a `.download-rules.json` file with routing rules. Each rule has a name, glob patterns to match, and a destination:

```json
{
  "name": "Screenshots",
  "patterns": ["Screenshot*.png", "Screen Shot*.png"],
  "destination": "~/Pictures/Screenshots/"
}
```

The daemon watches for new files, waits 5 minutes (so downloads finish), and applies the first matching rule. You can add keyword filters (`contains`), exclusions (`exclude`), size thresholds (`size_gt`, `size_lt`), **time-based filters** (`age_gt`, `age_lt`), and choose between move, copy, or per-rule **conflict resolution** (`skip`, `rename`, or `overwrite`).

My rules file has 14 entries. The interesting ones use context-aware routing — a zip file containing "github" in the name goes to `~/Projects/`, while a large zip goes to `~/Downloads/Archives/`. Screenshots go to `~/Pictures/Screenshots/` while other PNGs go to `~/Pictures/`. Executables get quarantined with a desktop notification.

The time-based filters unlock a whole class of rules. A catch-all rule with `"age_gt": "30d"` archives anything older than a month. A rule with `"age_lt": "1h"` could notify you about very recent downloads without touching them. It turns a file router into a file lifecycle manager.

## Why Not Hazel / organize / etc?

I used [Hazel](https://www.noodlesoft.com/) ($42) for years. It's good. But it's macOS-only, closed source, and the rules are locked in its GUI. My rules file is JSON — I can version it, share it, edit it in any text editor, and it works anywhere Node.js runs.

The most popular open-source alternative is [organize](https://github.com/tfeldmann/organize) (Python, ~3K GitHub stars). It has great filter expressions, a rich rule engine, and 50+ filter types. But it has **no daemon mode**. There's an [8-year-old open issue](https://github.com/tfeldmann/organize/issues/8) requesting watch/daemon functionality. You have to run it manually or schedule it with cron. For a tool about automation, that's a strange gap.

[hazelnut](https://github.com/cbzehner/hazelnut) (Rust, ~180 stars) has watch mode but limited pattern matching. Most npm packages in this space are abandoned.

**download-router** fills the gap: true daemon mode, zero dependencies, cross-platform, and rules that are plain JSON.

## The Architecture

The whole thing is one file: `download-router.js`. No framework, no build step, no config directory. It uses Node's built-in `fs.watch` with `recursive: true` (Node 19+) for real-time monitoring and periodic `fs.readdirSync` scans as a safety net. Rules are loaded fresh on each scan (so you can edit them without restarting the daemon).

```
download-router --init      # Creates a starter rules file
download-router --dry-run   # Shows what would happen
download-router --status    # Routing stats — per-rule counts, recent activity
download-router --daemon    # Runs forever, watching for new files
```

The dual watch+interval approach means it catches both files that appear while the daemon is running and files that were downloaded while it was off. The `--status` command gives you a dashboard: how many files each rule has routed, when the last match happened, total files processed today.

### Conflict Resolution

Each rule can specify what happens when the destination already has a file with the same name:

```json
{
  "name": "Archive Old Files",
  "patterns": ["*"],
  "age_gt": "30d",
  "destination": "~/Downloads/Archive/",
  "on_conflict": "rename"
}
```

- `"skip"` (default): Leave the file where it is
- `"rename"`: Append a timestamp (e.g., `report-2026-02-27T103015.pdf`)
- `"overwrite"`: Replace the existing file

## What I Learned

**First-match-wins is the right rule engine.** I tried priority numbers, weighted matching, and category hierarchies. They're all worse than ordered rules where the first match wins. It's how `iptables` works, how CSS cascade works, and it turns out it's how file routing should work too. Put specific rules first, general rules last.

**5-minute minimum age is essential.** Without it, the daemon moves half-downloaded files. 300 seconds handles everything from Chrome downloads to large torrents.

**Copy is sometimes better than move.** For markdown files, I copy to my notes vault instead of moving from Downloads. The original stays in case I want to find it where I expect it.

**The quarantine rule is surprisingly useful.** Any `.exe`, `.bat`, or `.sh` that appears in Downloads gets moved to a Quarantine folder and triggers a notification. It's not security — it's awareness. "When did I download that?"

**Age-based archiving is the killer feature I didn't expect.** A single catch-all rule — `"patterns": ["*"], "age_gt": "30d", "destination": "~/Downloads/Archive/"` — handles the long tail. Specific rules catch the common patterns. The age rule sweeps everything else after a month. My Downloads folder never has more than ~20 recent files now.

**Zero dependencies is a real feature.** No `npm install` that pulls 200 packages. No binary that needs compilation. No `fswatch` or `chokidar` to install separately. Just Node.js, which is already on most developer machines. When someone asks "what do I need to install?", the answer is "nothing."

## Try It

```bash
npm install -g download-router
download-router --init
# edit ~/Downloads/.download-rules.json to your liking
download-router --dry-run
download-router --daemon
```

Repo: [github.com/peretzp/download-router](https://github.com/peretzp/download-router)

No dependencies. MIT license. Works anywhere Node.js 19+ runs (macOS, Linux, Windows).

---

*This is the first in a series of infrastructure tools I'm extracting from my personal setup and open-sourcing. Next up: crash-resilient session logging for LLM agents — SQLite + FTS5 for searchable, crash-proof AI conversation history.*
