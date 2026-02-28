#!/usr/bin/env node
/**
 * download-router — Self-organizing file router
 *
 * Watches a directory and routes files to destinations based on JSON rules.
 * Zero external dependencies. Uses Node's built-in fs.watch for file events.
 *
 * Usage:
 *   download-router                    # One-time scan of ~/Downloads
 *   download-router --daemon           # Watch continuously
 *   download-router --dry-run          # Show what would happen
 *   download-router --status           # Show routing stats
 *   download-router --dir ~/Desktop    # Watch a different directory
 *   download-router --rules rules.json # Use a specific rules file
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE || '';

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DAEMON_MODE = args.includes('--daemon');

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const WATCH_DIR = path.resolve(expandPath(getArg('--dir', '~/Downloads')));
const RULES_FILE = path.resolve(expandPath(getArg('--rules', path.join(WATCH_DIR, '.download-rules.json'))));
const LOG_FILE = expandPath(getArg('--log', '~/.download-router.log'));
const STATS_FILE = expandPath('~/.download-router-stats.json');

function expandPath(p) {
  return p.replace(/^~/, HOME);
}

function log(msg) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}`;
  console.log(logLine);
  try {
    fs.appendFileSync(LOG_FILE, logLine + '\n');
  } catch {}
}

function loadConfig() {
  if (!fs.existsSync(RULES_FILE)) {
    console.error(`Rules file not found: ${RULES_FILE}`);
    console.error('');
    console.error('Create one with: download-router --init');
    console.error('Or specify a path with: download-router --rules /path/to/rules.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(RULES_FILE, 'utf8');
  return JSON.parse(raw);
}

// --- Stats tracking ---

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { total_routed: 0, by_rule: {}, by_day: {}, started: new Date().toISOString() };
  }
}

function saveStats(stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2) + '\n');
  } catch {}
}

function recordRouted(ruleName) {
  const stats = loadStats();
  stats.total_routed = (stats.total_routed || 0) + 1;
  stats.by_rule[ruleName] = (stats.by_rule[ruleName] || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  stats.by_day[today] = (stats.by_day[today] || 0) + 1;
  stats.last_routed = new Date().toISOString();
  saveStats(stats);
}

function showStatus() {
  const stats = loadStats();
  const config = loadConfig();

  console.log('download-router status');
  console.log('='.repeat(40));
  console.log(`Watching:       ${WATCH_DIR}`);
  console.log(`Rules file:     ${RULES_FILE}`);
  console.log(`Rules loaded:   ${config.rules.length}`);
  console.log(`Total routed:   ${stats.total_routed || 0}`);
  console.log(`Tracking since: ${stats.started || 'unknown'}`);
  console.log(`Last routed:    ${stats.last_routed || 'never'}`);
  console.log('');

  if (stats.by_rule && Object.keys(stats.by_rule).length > 0) {
    console.log('By rule:');
    const sorted = Object.entries(stats.by_rule).sort((a, b) => b[1] - a[1]);
    for (const [rule, count] of sorted) {
      console.log(`  ${String(count).padStart(4)}  ${rule}`);
    }
    console.log('');
  }

  // Show last 7 days
  if (stats.by_day && Object.keys(stats.by_day).length > 0) {
    console.log('Last 7 days:');
    const days = Object.entries(stats.by_day).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    for (const [day, count] of days) {
      console.log(`  ${day}  ${count} files`);
    }
  }

  // Count files currently in watch dir
  try {
    const files = fs.readdirSync(WATCH_DIR).filter(f => !f.startsWith('.'));
    console.log('');
    console.log(`Files in ${path.basename(WATCH_DIR)}: ${files.length}`);
  } catch {}
}

// --- Matching ---

function matchesPattern(filename, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return regex.test(filename);
}

function getFileSize(filepath) {
  try {
    return fs.statSync(filepath).size;
  } catch {
    return 0;
  }
}

function getFileAgeDays(filepath) {
  try {
    const stats = fs.statSync(filepath);
    return (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
  } catch {
    return 0;
  }
}

function parseSizeString(sizeStr) {
  const match = sizeStr.match(/^(\d+)(KB|MB|GB)?$/i);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = (match[2] || '').toUpperCase();

  const multipliers = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  return value * (multipliers[unit] || 1);
}

function parseAgeString(ageStr) {
  // Accepts: "7d", "30d", "1h", "24h", "60m"
  const match = ageStr.match(/^(\d+)(m|h|d)?$/i);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = (match[2] || 'd').toLowerCase();

  const multipliers = { m: 1 / (60 * 24), h: 1 / 24, d: 1 };
  return value * (multipliers[unit] || 1);
}

function matchesRule(filename, filepath, rule) {
  const patternMatch = rule.patterns.some(p => matchesPattern(filename, p));
  if (!patternMatch) return false;

  // Keyword contains
  if (rule.contains && rule.contains.length > 0) {
    const hasMatch = rule.contains.some(keyword =>
      filename.toLowerCase().includes(keyword.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  // Keyword exclude
  if (rule.exclude && rule.exclude.length > 0) {
    const hasExclude = rule.exclude.some(keyword =>
      filename.toLowerCase().includes(keyword.toLowerCase())
    );
    if (hasExclude) return false;
  }

  // Size constraints
  if (rule.size_gt) {
    if (getFileSize(filepath) <= parseSizeString(rule.size_gt)) return false;
  }
  if (rule.size_lt) {
    if (getFileSize(filepath) >= parseSizeString(rule.size_lt)) return false;
  }

  // Age constraints (file modification time)
  if (rule.age_gt) {
    if (getFileAgeDays(filepath) <= parseAgeString(rule.age_gt)) return false;
  }
  if (rule.age_lt) {
    if (getFileAgeDays(filepath) >= parseAgeString(rule.age_lt)) return false;
  }

  return true;
}

// --- Actions ---

function notify(title, message) {
  try {
    if (process.platform === 'darwin') {
      execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
    } else if (process.platform === 'linux') {
      execSync(`notify-send "${title}" "${message}" 2>/dev/null`);
    }
  } catch {}
}

function applyRule(filepath, rule, config) {
  const filename = path.basename(filepath);
  const dest = expandPath(rule.destination);
  let destPath = path.join(dest, filename);

  // Create destination if needed
  if (config.defaults.create_destinations && !fs.existsSync(dest)) {
    if (DRY_RUN) {
      log(`[DRY RUN] Would create directory: ${dest}`);
    } else {
      fs.mkdirSync(dest, { recursive: true });
      log(`Created directory: ${dest}`);
    }
  }

  // Conflict resolution
  if (fs.existsSync(destPath)) {
    const onConflict = rule.on_conflict || 'skip';
    if (onConflict === 'skip') {
      log(`SKIP: ${filename} → ${dest} (already exists)`);
      return;
    } else if (onConflict === 'rename') {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      destPath = path.join(dest, `${base}-${ts}${ext}`);
    }
    // 'overwrite' falls through to the action
  }

  const action = rule.action || 'move';

  if (DRY_RUN) {
    log(`[DRY RUN] Would ${action}: ${filename} → ${dest} (rule: ${rule.name})`);
    return;
  }

  try {
    if (action === 'move') {
      fs.renameSync(filepath, destPath);
      log(`MOVED: ${filename} → ${dest} (rule: ${rule.name})`);
    } else if (action === 'copy') {
      fs.copyFileSync(filepath, destPath);
      log(`COPIED: ${filename} → ${dest} (rule: ${rule.name})`);
    }

    recordRouted(rule.name);

    if (rule.notify) {
      notify('Download Router', `${filename} → ${path.basename(dest)}`);
    }
  } catch (err) {
    log(`ERROR: Failed to ${action} ${filename}: ${err.message}`);
  }
}

function processFile(filepath) {
  const filename = path.basename(filepath);

  if (filename.startsWith('.')) return;
  if (!fs.existsSync(filepath)) return;

  try {
    if (fs.statSync(filepath).isDirectory()) return;
  } catch {
    return;
  }

  // Don't move files that might still be downloading
  const config = loadConfig();
  const minAge = config.defaults.min_age_seconds || 300;
  const stats = fs.statSync(filepath);
  const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;

  if (ageSeconds < minAge) return;

  // First matching rule wins
  for (const rule of config.rules) {
    if (matchesRule(filename, filepath, rule)) {
      applyRule(filepath, rule, config);
      return;
    }
  }
}

function scanDirectory() {
  log(`Scanning ${WATCH_DIR}...`);

  const files = fs.readdirSync(WATCH_DIR);
  let moved = 0;
  let skipped = 0;

  for (const file of files) {
    const filepath = path.join(WATCH_DIR, file);
    try {
      const before = fs.existsSync(filepath);
      processFile(filepath);
      const after = fs.existsSync(filepath);
      if (before && !after) moved++;
      else skipped++;
    } catch (err) {
      log(`ERROR processing ${file}: ${err.message}`);
    }
  }

  log(`Scan complete. ${moved} routed, ${skipped} unchanged.`);
}

// --- Watcher (zero dependencies — uses Node's built-in fs.watch) ---

function startWatcher() {
  log('Starting file system watcher (fs.watch)...');

  const debounce = new Map(); // filepath → timeout

  try {
    fs.watch(WATCH_DIR, { recursive: false }, (eventType, filename) => {
      if (!filename || filename.startsWith('.')) return;

      const filepath = path.join(WATCH_DIR, filename);

      // Debounce: wait 3 seconds after last change before processing
      if (debounce.has(filepath)) {
        clearTimeout(debounce.get(filepath));
      }

      debounce.set(filepath, setTimeout(() => {
        debounce.delete(filepath);
        try {
          if (fs.existsSync(filepath)) {
            processFile(filepath);
          }
        } catch (err) {
          log(`ERROR: ${err.message}`);
        }
      }, 3000));
    });

    log(`Watching ${WATCH_DIR} for changes...`);
  } catch (err) {
    log(`WARNING: fs.watch failed (${err.message}). Falling back to interval-only polling.`);
  }
}

// --- Init ---

function initRules() {
  const sampleRules = {
    version: '1.0',
    description: 'File routing rules — edit to match your workflow',
    rules: [
      {
        name: 'Documents',
        patterns: ['*.pdf', '*.doc', '*.docx', '*.txt'],
        destination: '~/Documents/',
        action: 'move'
      },
      {
        name: 'Images',
        patterns: ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.heic'],
        destination: '~/Pictures/',
        action: 'move'
      },
      {
        name: 'Videos',
        patterns: ['*.mp4', '*.mov', '*.avi', '*.mkv'],
        destination: '~/Movies/',
        action: 'move'
      },
      {
        name: 'Audio',
        patterns: ['*.mp3', '*.m4a', '*.wav', '*.flac'],
        destination: '~/Music/',
        action: 'move'
      },
      {
        name: 'Archives',
        patterns: ['*.zip', '*.tar.gz', '*.rar', '*.7z'],
        destination: '~/Downloads/Archives/',
        action: 'move'
      },
      {
        name: 'Installers',
        patterns: ['*.dmg', '*.pkg', '*.exe', '*.msi'],
        destination: '~/Downloads/Installers/',
        action: 'move'
      }
    ],
    defaults: {
      min_age_seconds: 300,
      check_interval_seconds: 60,
      create_destinations: true,
      log_file: '~/.download-router.log'
    }
  };

  if (!fs.existsSync(WATCH_DIR)) {
    fs.mkdirSync(WATCH_DIR, { recursive: true });
  }

  const dest = path.join(WATCH_DIR, '.download-rules.json');
  if (fs.existsSync(dest)) {
    console.log(`Rules file already exists: ${dest}`);
    process.exit(0);
  }

  fs.writeFileSync(dest, JSON.stringify(sampleRules, null, 2) + '\n');
  console.log(`Created rules file: ${dest}`);
  console.log('Edit the rules, then run: download-router --daemon');
}

function showHelp() {
  console.log(`
download-router — Self-organizing file router

Routes files from a watched directory to destinations based on JSON rules.
Zero external dependencies.

USAGE
  download-router                     One-time scan (default: ~/Downloads)
  download-router --daemon            Watch continuously + periodic scans
  download-router --dry-run           Show what would happen without moving
  download-router --status            Show routing stats and current state
  download-router --init              Create a starter rules file
  download-router --dir ~/Desktop     Watch a different directory
  download-router --rules rules.json  Use a specific rules file
  download-router --log file.log      Log to a specific file

RULES FORMAT
  Rules live in .download-rules.json inside the watched directory.
  Each rule has:

    name          Human-readable label
    patterns      Glob patterns to match (e.g., "*.pdf", "Screenshot*.png")
    contains      Optional: filename must contain one of these strings
    exclude       Optional: filename must NOT contain any of these
    size_gt       Optional: minimum file size (e.g., "100MB")
    size_lt       Optional: maximum file size (e.g., "10MB")
    age_gt        Optional: minimum file age (e.g., "7d", "24h", "60m")
    age_lt        Optional: maximum file age (e.g., "30d")
    destination   Where to send matching files (~ expands to home)
    action        "move" (default) or "copy"
    on_conflict   "skip" (default), "rename", or "overwrite"
    notify        true to get a desktop notification

  First matching rule wins. Order matters.

EXAMPLES
  # Route work documents
  { "name": "Work Docs", "patterns": ["*.pdf"], "contains": ["invoice"],
    "destination": "~/Documents/Work/" }

  # Archive files older than 30 days
  { "name": "Old Files", "patterns": ["*"], "age_gt": "30d",
    "destination": "~/Downloads/Archive/" }

  # Quarantine executables
  { "name": "Suspicious", "patterns": ["*.exe", "*.bat"],
    "destination": "~/Downloads/Quarantine/", "notify": true }
`);
}

// --- Main ---

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (args.includes('--init')) {
  initRules();
  process.exit(0);
}

if (args.includes('--status')) {
  showStatus();
  process.exit(0);
}

process.on('SIGINT', () => {
  log('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...');
  process.exit(0);
});

log('='.repeat(50));
log(`download-router ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
log(`Watching: ${WATCH_DIR}`);
log(`Rules:   ${RULES_FILE}`);
log('='.repeat(50));

const config = loadConfig();
log(`Loaded ${config.rules.length} rules`);

scanDirectory();

if (DAEMON_MODE) {
  const interval = (config.defaults.check_interval_seconds || 60) * 1000;
  setInterval(scanDirectory, interval);
  startWatcher();
} else {
  process.exit(0);
}
