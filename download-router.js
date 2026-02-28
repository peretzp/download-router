#!/usr/bin/env node
/**
 * download-router — Self-organizing file router
 *
 * Watches a directory and routes files to destinations based on JSON rules.
 * Uses fswatch for file system events, applies rules after files stabilize.
 *
 * Usage:
 *   download-router                    # One-time scan of ~/Downloads
 *   download-router --daemon           # Watch continuously
 *   download-router --dry-run          # Show what would happen
 *   download-router --dir ~/Desktop    # Watch a different directory
 *   download-router --rules rules.json # Use a specific rules file
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

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

function matchesPattern(filename, pattern) {
  // Convert glob pattern to regex
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

function parseSizeString(sizeStr) {
  const match = sizeStr.match(/^(\d+)(KB|MB|GB)?$/i);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = (match[2] || '').toUpperCase();

  const multipliers = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  return value * (multipliers[unit] || 1);
}

function matchesRule(filename, filepath, rule) {
  // Check pattern match
  const patternMatch = rule.patterns.some(p => matchesPattern(filename, p));
  if (!patternMatch) return false;

  // Check contains (filename must contain one of these strings)
  if (rule.contains && rule.contains.length > 0) {
    const hasMatch = rule.contains.some(keyword =>
      filename.toLowerCase().includes(keyword.toLowerCase())
    );
    if (!hasMatch) return false;
  }

  // Check exclude (filename must NOT contain any of these)
  if (rule.exclude && rule.exclude.length > 0) {
    const hasExclude = rule.exclude.some(keyword =>
      filename.toLowerCase().includes(keyword.toLowerCase())
    );
    if (hasExclude) return false;
  }

  // Check size constraints
  if (rule.size_gt) {
    const fileSize = getFileSize(filepath);
    const minSize = parseSizeString(rule.size_gt);
    if (fileSize <= minSize) return false;
  }

  if (rule.size_lt) {
    const fileSize = getFileSize(filepath);
    const maxSize = parseSizeString(rule.size_lt);
    if (fileSize >= maxSize) return false;
  }

  return true;
}

function notify(title, message) {
  try {
    if (process.platform === 'darwin') {
      execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
    }
    // Linux: could add notify-send here
    // Windows: could add PowerShell toast here
  } catch {}
}

function applyRule(filepath, rule, config) {
  const filename = path.basename(filepath);
  const dest = expandPath(rule.destination);
  const destPath = path.join(dest, filename);

  // Create destination if needed
  if (config.defaults.create_destinations && !fs.existsSync(dest)) {
    if (DRY_RUN) {
      log(`[DRY RUN] Would create directory: ${dest}`);
    } else {
      fs.mkdirSync(dest, { recursive: true });
      log(`Created directory: ${dest}`);
    }
  }

  // Check if dest file already exists
  if (fs.existsSync(destPath)) {
    log(`SKIP: ${filename} → ${dest} (already exists)`);
    return;
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

    if (rule.notify) {
      notify('Download Router', `${filename} → ${path.basename(dest)}`);
    }
  } catch (err) {
    log(`ERROR: Failed to ${action} ${filename}: ${err.message}`);
  }
}

function processFile(filepath) {
  const filename = path.basename(filepath);

  // Skip hidden files and the rules file itself
  if (filename.startsWith('.')) return;

  // Skip if file no longer exists (moved by another rule or process)
  if (!fs.existsSync(filepath)) return;

  // Skip directories
  try {
    if (fs.statSync(filepath).isDirectory()) return;
  } catch {
    return;
  }

  // Check file age (don't move files that might still be downloading)
  const config = loadConfig();
  const minAge = config.defaults.min_age_seconds || 300;
  const stats = fs.statSync(filepath);
  const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;

  if (ageSeconds < minAge) {
    return; // Silently skip recent files
  }

  // Try to match against rules (first match wins)
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

function startWatcher() {
  // Check for fswatch
  try {
    execSync('which fswatch', { stdio: 'ignore' });
  } catch {
    console.error('fswatch not found. Install it:');
    console.error('  macOS:  brew install fswatch');
    console.error('  Linux:  apt install fswatch');
    console.error('');
    console.error('Or run without --daemon for one-time scan mode.');
    process.exit(1);
  }

  log('Starting file system watcher...');

  const fswatch = spawn('fswatch', ['-r', '-l', '5', WATCH_DIR]);

  fswatch.stdout.on('data', (data) => {
    const changedFiles = data.toString().trim().split('\n');
    for (const filepath of changedFiles) {
      if (filepath && fs.existsSync(filepath)) {
        setTimeout(() => {
          try {
            processFile(filepath);
          } catch (err) {
            log(`ERROR: ${err.message}`);
          }
        }, 2000); // Wait 2 seconds for file to stabilize
      }
    }
  });

  fswatch.stderr.on('data', (data) => {
    log(`fswatch error: ${data}`);
  });

  fswatch.on('close', (code) => {
    log(`fswatch exited with code ${code}`);
    process.exit(code);
  });

  log(`Watching ${WATCH_DIR} for changes...`);
}

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

USAGE
  download-router                     One-time scan (default: ~/Downloads)
  download-router --daemon            Watch continuously + periodic scans
  download-router --dry-run           Show what would happen without moving
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
    destination   Where to send matching files (~ expands to home)
    action        "move" (default) or "copy"
    notify        true to get a desktop notification

  First matching rule wins. Order matters.

EXAMPLES
  # Route work documents to a work folder
  {
    "name": "Work Docs",
    "patterns": ["*.pdf", "*.docx"],
    "contains": ["report", "invoice", "contract"],
    "destination": "~/Documents/Work/",
    "action": "move"
  }

  # Quarantine executables with notification
  {
    "name": "Suspicious",
    "patterns": ["*.exe", "*.bat"],
    "destination": "~/Downloads/Quarantine/",
    "action": "move",
    "notify": true
  }
`);
}

// Main
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (args.includes('--init')) {
  initRules();
  process.exit(0);
}

// Handle signals gracefully
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

// Initial scan
scanDirectory();

if (DAEMON_MODE) {
  const interval = (config.defaults.check_interval_seconds || 60) * 1000;
  setInterval(scanDirectory, interval);
  startWatcher();
} else {
  process.exit(0);
}
