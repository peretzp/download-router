# My Download Folder Sorts Itself

I had 336 unsorted files in `~/Downloads`. Screenshots next to PDFs next to `.dmg` files next to CSVs from three weeks ago. Everyone has this problem. Nobody fixes it permanently because manual cleanup is Sisyphean — you clean it up, and a week later it's chaos again.

So I wrote a daemon. One file, zero dependencies, 300 lines of Node.js. It watches `~/Downloads` and routes files to destinations based on rules I defined in JSON. It's been running on my Mac as a LaunchAgent for months. I never think about my Downloads folder anymore.

## How It Works

You create a `.download-rules.json` file with routing rules. Each rule has a name, glob patterns to match, and a destination:

```json
{
  "name": "Screenshots",
  "patterns": ["Screenshot*.png", "Screen Shot*.png"],
  "destination": "~/Pictures/Screenshots/"
}
```

The daemon watches for new files, waits 5 minutes (so downloads finish), and applies the first matching rule. You can add keyword filters (`contains`), exclusions (`exclude`), size thresholds (`size_gt`), and choose between move and copy.

My rules file has 14 entries. The interesting ones use context-aware routing — a zip file containing "github" in the name goes to `~/Projects/`, while a large zip goes to `~/Downloads/Archives/`. Screenshots go to `~/Pictures/Screenshots/` while other PNGs go to `~/Pictures/`. Executables get quarantined with a desktop notification.

## Why Not Hazel / organize-cli / etc?

I used Hazel for years. It's good. But it's macOS-only, $42, closed source, and the rules are locked in its GUI. My rules file is JSON — I can version it, share it, edit it in any text editor, and it works anywhere Node.js runs.

There are also CLI tools like `organize-cli` (Python) and various npm packages, but they're either overengineered (YAML configs with 30 options) or abandoned. I wanted something I could read in full in 5 minutes and understand completely.

## The Architecture

The whole thing is one file: `download-router.js`. No framework, no build step, no config directory. It uses `fs.readdirSync` for scanning and shells out to `fswatch` for real-time monitoring. Rules are loaded fresh on each scan (so you can edit them without restarting the daemon).

```
download-router --init      # Creates a starter rules file
download-router --dry-run   # Shows what would happen
download-router --daemon    # Runs forever, watching for new files
```

The scan-on-interval + fswatch-for-events approach means it catches both files that appear while the daemon is running and files that were downloaded while it was off.

## What I Learned

**First-match-wins is the right rule engine.** I tried priority numbers, weighted matching, and category hierarchies. They're all worse than ordered rules where the first match wins. It's how `iptables` works, how CSS cascade works, and it turns out it's how file routing should work too. Put specific rules first, general rules last.

**5-minute minimum age is essential.** Without it, the daemon moves half-downloaded files. 300 seconds handles everything from Chrome downloads to large torrents.

**Copy is sometimes better than move.** For markdown files, I copy to my notes vault instead of moving from Downloads. The original stays in case I want to find it where I expect it.

**The quarantine rule is surprisingly useful.** Any `.exe`, `.bat`, or `.sh` that appears in Downloads gets moved to a Quarantine folder and triggers a notification. It's not security — it's awareness. "When did I download that?"

## Try It

```bash
npm install -g download-router
download-router --init
# edit ~/Downloads/.download-rules.json to your liking
download-router --dry-run
download-router --daemon
```

Repo: [github.com/peretzp/download-router](https://github.com/peretzp/download-router)

No dependencies. MIT license. Works anywhere Node.js and fswatch run.

---

*This is the first in a series of infrastructure tools I'm extracting from my personal setup and open-sourcing. Next up: crash-resilient session logging for LLM agents.*
