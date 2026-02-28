# download-router

Self-organizing file router. Watches a directory and automatically moves files to the right place based on rules you define in JSON.

No dependencies. No config files in weird places. Just one script, one rules file, and your downloads folder stays clean forever.

## The Problem

Your `~/Downloads` folder is chaos. PDFs mixed with screenshots mixed with `.dmg` files mixed with that CSV from three weeks ago. You could clean it up manually. Again. Or you could write rules once and never think about it.

## How It Works

1. You create a `.download-rules.json` file with routing rules
2. `download-router` watches your Downloads folder (or any folder)
3. When a file matches a rule, it gets moved (or copied) to the destination
4. First matching rule wins. Order matters.
5. Files younger than 5 minutes are skipped (still downloading)

## Install

```bash
npm install -g download-router
```

Or clone and link:

```bash
git clone https://github.com/peretzp/download-router.git
cd download-router
npm link
```

**Requires**: Node.js 16+ and [fswatch](https://github.com/emcrisostomo/fswatch) for daemon mode.

```bash
# macOS
brew install fswatch

# Linux
apt install fswatch
```

## Quick Start

```bash
# Create a starter rules file in ~/Downloads
download-router --init

# See what would happen (without moving anything)
download-router --dry-run

# Run once
download-router

# Run continuously (watches for new files)
download-router --daemon
```

## Rules Format

Rules live in `.download-rules.json` inside the watched directory. Each rule:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Human-readable label (shows in logs) |
| `patterns` | yes | Glob patterns to match: `"*.pdf"`, `"Screenshot*.png"` |
| `destination` | yes | Where to send files (`~` expands to home) |
| `action` | no | `"move"` (default) or `"copy"` |
| `contains` | no | Filename must contain one of these strings |
| `exclude` | no | Filename must NOT contain any of these |
| `size_gt` | no | Minimum file size: `"100MB"`, `"1GB"` |
| `size_lt` | no | Maximum file size: `"10MB"` |
| `notify` | no | `true` for a desktop notification on match |

### Example: Route Work Documents

```json
{
  "name": "Work Docs",
  "patterns": ["*.pdf", "*.docx"],
  "contains": ["report", "invoice", "contract"],
  "destination": "~/Documents/Work/",
  "action": "move"
}
```

This matches PDFs and Word docs whose filename contains "report", "invoice", or "contract" — and moves them to `~/Documents/Work/`.

### Example: Quarantine Executables

```json
{
  "name": "Suspicious",
  "patterns": ["*.exe", "*.bat"],
  "destination": "~/Downloads/Quarantine/",
  "notify": true
}
```

### Example: Keep Screenshots Separate from Photos

```json
[
  {
    "name": "Screenshots",
    "patterns": ["Screenshot*.png", "Screen Shot*.png"],
    "destination": "~/Pictures/Screenshots/"
  },
  {
    "name": "Photos",
    "patterns": ["*.jpg", "*.jpeg", "*.png", "*.heic"],
    "exclude": ["Screenshot", "Screen Shot"],
    "destination": "~/Pictures/"
  }
]
```

Order matters — screenshots match the first rule and skip the second.

## Full Rules File

```json
{
  "version": "1.0",
  "description": "My download routing rules",
  "rules": [
    { "name": "...", "patterns": ["..."], "destination": "~/..." }
  ],
  "defaults": {
    "min_age_seconds": 300,
    "check_interval_seconds": 60,
    "create_destinations": true,
    "log_file": "~/.download-router.log"
  }
}
```

| Default | Description |
|---------|-------------|
| `min_age_seconds` | Don't touch files newer than this (default: 300 = 5 min) |
| `check_interval_seconds` | How often to re-scan in daemon mode (default: 60) |
| `create_destinations` | Auto-create destination dirs if missing (default: true) |
| `log_file` | Where to write the log (default: `~/.download-router.log`) |

See `examples/` for complete rules files.

## CLI Options

```
download-router                     One-time scan (default: ~/Downloads)
download-router --daemon            Watch continuously + periodic scans
download-router --dry-run           Show what would happen without moving
download-router --init              Create a starter rules file
download-router --dir ~/Desktop     Watch a different directory
download-router --rules rules.json  Use a specific rules file
download-router --log file.log      Log to a specific file
download-router --help              Show help
```

## Run on Startup (macOS)

Create `~/Library/LaunchAgents/com.download-router.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.download-router</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/bin/download-router</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/download-router.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/download-router.log</string>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/com.download-router.plist`

## Run on Startup (Linux)

Create a systemd service at `~/.config/systemd/user/download-router.service`:

```ini
[Unit]
Description=Download Router

[Service]
ExecStart=/usr/bin/node /usr/local/bin/download-router --daemon
Restart=always

[Install]
WantedBy=default.target
```

Then: `systemctl --user enable --now download-router`

## Origin

I built this because I was drowning in 336 unsorted files in my Downloads folder. I wrote 14 rules, pointed the daemon at it, and never thought about it again. It's been running as a LaunchAgent on my Mac for months.

Zero dependencies. One file. ~300 lines. It just works.

## License

MIT
