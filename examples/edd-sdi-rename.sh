#!/bin/bash
#
# edd-sdi-rename.sh -- Rename EDD SDI portal downloads to human-readable names
#
# After the Claude browser extension downloads all inbox PDFs, they'll land
# in ~/Downloads with server-chosen names (often duplicates with Chrome's
# (1), (2), (3) suffixes). This script reads each PDF's content with
# pdftotext, identifies the form type and document date, then renames and
# moves the file to the INBOX folder.
#
# Usage:
#   chmod +x edd-sdi-rename.sh
#   ./edd-sdi-rename.sh                    # dry run (default)
#   ./edd-sdi-rename.sh --apply            # actually rename and move
#   ./edd-sdi-rename.sh --dir ~/Desktop    # look in a different folder
#   ./edd-sdi-rename.sh --dest /path       # write to a different destination
#
# Output naming: YYYY-MM-DD_FORM-ID_Description.pdf
#   e.g. 2025-12-08_DE-429D_Notice-of-Computation.pdf
#        2026-01-16_DE-2500E_Electronic-Benefit-Payment.pdf
#
# When multiple files map to the same name (e.g. four DE-2500E payments on
# the same date), a sequence number is appended: _1, _2, _3.
#
# Portable across macOS (BSD tools) and Linux (GNU tools). Requires pdftotext
# (poppler-utils) for content-based identification; falls back to `strings`
# if pdftotext is missing.

set -euo pipefail

DOWNLOADS_DIR="${HOME}/Downloads"
DEST_DIR="${HOME}/Documents/Finances/Benefits/SDI appeal/INBOX"
DRY_RUN=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) DRY_RUN=false; shift ;;
    --dir)   DOWNLOADS_DIR="$2"; shift 2 ;;
    --dest)  DEST_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if $DRY_RUN; then echo "=== DRY RUN (use --apply to rename for real) ==="; echo ""; fi
echo "Source:      $DOWNLOADS_DIR"
echo "Destination: $DEST_DIR"
echo ""

if ! $DRY_RUN; then mkdir -p "$DEST_DIR"; fi

# --- Helpers -----------------------------------------------------------------

identify_pdf() {
  local file="$1"
  if command -v pdftotext >/dev/null 2>&1; then
    pdftotext -l 2 "$file" - 2>/dev/null || true
  else
    strings "$file" 2>/dev/null | head -200 || true
  fi
}

name_for_pdf() {
  local text="$1"
  if   echo "$text" | grep -qi 'DE 429D\|DE429D\|Notice of Computation';          then echo 'DE-429D_Notice-of-Computation'
  elif echo "$text" | grep -qi 'DE 2517-18\|DE2517-18\|Claim Date Adjustment';    then echo 'DE-2517-18_Notice-of-Claim-Date-Adjustment'
  elif echo "$text" | grep -qi 'DE 2517-01\|DE2517-01\|Notice of Determination';  then echo 'DE-2517-01_Notice-of-Determination'
  elif echo "$text" | grep -qi 'DE 2525.*A\|DE2525A\|Notice of Exhaustion';       then echo 'DE-2525A_Notice-of-Exhaustion'
  elif echo "$text" | grep -qi 'DE 2500.*E\|DE2500E\|Electronic Benefit Payment'; then echo 'DE-2500E_Electronic-Benefit-Payment'
  elif echo "$text" | grep -qi 'DE 2515PT\|DE2515PT\|Payment Table';              then echo 'DE-2515PT_Payment-Table'
  elif echo "$text" | grep -qi 'DE 2515P\|DE2515P\|Benefit Computation';          then echo 'DE-2515P_Benefit-Computation'
  elif echo "$text" | grep -qi 'DE 429DI\|DE429DI';                               then echo 'DE-429DI_Disability-Benefits-Info'
  elif echo "$text" | grep -qi 'Notice of Automatic Payment';                     then echo 'Notice-of-Automatic-Payment'
  elif echo "$text" | grep -qi 'New Medical Information';                         then echo 'New-Medical-Information-Received'
  elif echo "$text" | grep -qi 'Additional Benefits\|Paid Family Leave';          then echo 'Additional-Benefits-for-DI-Claimants'
  elif echo "$text" | grep -qi 'Response.*inquiry\|Claim Update';                 then echo 'Response-to-Inquiry'
  else                                                                                 echo 'UNKNOWN-EDD-Form'
  fi
}

# Convert "Month DD, YYYY" -> YYYY-MM-DD using awk (no GNU `date -d` needed)
month_name_to_iso() {
  awk 'BEGIN {
    m["January"]="01";  m["February"]="02"; m["March"]="03"; m["April"]="04";
    m["May"]="05";      m["June"]="06";     m["July"]="07";  m["August"]="08";
    m["September"]="09";m["October"]="10";  m["November"]="11"; m["December"]="12";
  } { gsub(",", ""); if ($1 in m) printf "%s-%s-%02d\n", $3, m[$1], $2; }'
}

date_from_pdf() {
  local file="$1" text="$2" d
  # MM/DD/YYYY
  d=$(echo "$text" | grep -Eo '[0-9]{2}/[0-9]{2}/[0-9]{4}' | head -1 || true)
  if [[ -n "$d" ]]; then echo "$d" | awk -F/ '{printf "%s-%s-%s\n", $3, $1, $2}'; return; fi
  # MM-DD-YYYY (EDD's preferred display format)
  d=$(echo "$text" | grep -Eo '[0-9]{2}-[0-9]{2}-[0-9]{4}' | head -1 || true)
  if [[ -n "$d" ]]; then echo "$d" | awk -F- '{printf "%s-%s-%s\n", $3, $1, $2}'; return; fi
  # "Month DD, YYYY"
  d=$(echo "$text" | grep -Eo '(January|February|March|April|May|June|July|August|September|October|November|December)[[:space:]]+[0-9]{1,2},?[[:space:]]+[0-9]{4}' | head -1 || true)
  if [[ -n "$d" ]]; then echo "$d" | month_name_to_iso; return; fi
  # Fallback: file mtime. `date -r FILE +FMT` works on both BSD and GNU.
  date -r "$file" +%Y-%m-%d 2>/dev/null || echo 'unknown-date'
}

is_edd_pdf() {
  local basename="$1" text="$2"
  if echo "$text" | grep -qi 'EDD\|Employment Development\|Disability Insurance\|DI-[0-9]\|DE [0-9]\|DE[0-9]\|Benefit Payment\|SDI Online'; then return 0; fi
  if echo "$basename" | grep -qiE 'DE[_ -]?[0-9]|EDD|SDI|ExternalUser|Benefit|Notice'; then return 0; fi
  return 1
}

# --- Main loop ---------------------------------------------------------------

# Names assigned during this run, used so dry-run sequence numbers match --apply.
# Use a string with delimiters (instead of associative arrays, which need bash 4+).
ASSIGNED_NAMES='|'
processed=0
skipped_non_edd=0

# Process substitution keeps the loop body in the parent shell so counters work.
# Lexical sort is portable and sufficient — Chrome's "(1)", "(2)" suffixes sort
# naturally, and same-day duplicates of the same form just get sequence numbers.
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  basename=$(basename "$file")
  text=$(identify_pdf "$file")

  if ! is_edd_pdf "$basename" "$text"; then
    skipped_non_edd=$((skipped_non_edd + 1))
    continue
  fi

  form_name=$(name_for_pdf "$text")
  form_date=$(date_from_pdf "$file" "$text")
  new_name="${form_date}_${form_name}.pdf"
  dest_path="${DEST_DIR}/${new_name}"

  # Conflict check: against the filesystem AND names already assigned this run.
  # The in-memory check is what makes dry-run output match --apply behavior.
  seq=0
  while [[ -f "$dest_path" ]] || [[ "$ASSIGNED_NAMES" == *"|${new_name}|"* ]]; do
    seq=$((seq + 1))
    new_name="${form_date}_${form_name}_${seq}.pdf"
    dest_path="${DEST_DIR}/${new_name}"
  done
  ASSIGNED_NAMES="${ASSIGNED_NAMES}${new_name}|"

  if $DRY_RUN; then
    printf "  %s\n    -> %s\n\n" "$basename" "$new_name"
  else
    mv "$file" "$dest_path"
    printf "  MOVED: %s -> %s\n" "$basename" "$new_name"
  fi
  processed=$((processed + 1))
done < <(find "$DOWNLOADS_DIR" -maxdepth 1 -name '*.pdf' -type f -mtime -14 2>/dev/null | sort)

echo ""
echo "Processed:       $processed EDD PDFs"
[[ $skipped_non_edd -gt 0 ]] && echo "Skipped non-EDD: $skipped_non_edd PDFs"
if $DRY_RUN; then
  echo ""
  echo "This was a dry run. Use --apply to rename and move files."
fi
