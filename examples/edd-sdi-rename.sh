#!/bin/bash
#
# edd-sdi-rename.sh — Rename EDD SDI portal downloads to human-readable names
#
# After the Claude browser extension downloads all inbox PDFs, they'll land
# in ~/Downloads with server-chosen names (often duplicates with Chrome's
# (1), (2), (3) suffixes). This script renames them based on their content
# and moves them to the INBOX folder.
#
# Usage:
#   chmod +x edd-sdi-rename.sh
#   ./edd-sdi-rename.sh                    # dry run (default)
#   ./edd-sdi-rename.sh --apply            # actually rename and move
#   ./edd-sdi-rename.sh --dir ~/Desktop    # look in a different folder
#
# Naming convention: YYYY-MM-DD_FORM-ID_Description.pdf
#   e.g. 2025-12-08_DE-429D_Notice-of-Computation.pdf
#        2026-01-16_DE-2500E_Electronic-Benefit-Payment.pdf

set -euo pipefail

DOWNLOADS_DIR="${HOME}/Downloads"
DEST_DIR="${HOME}/Documents/Finances/Benefits/SDI appeal/INBOX"
DRY_RUN=true
CLAIM_ID="DI-1014-230-142"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) DRY_RUN=false; shift ;;
    --dir) DOWNLOADS_DIR="$2"; shift 2 ;;
    --dest) DEST_DIR="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if $DRY_RUN; then
  echo "=== DRY RUN (use --apply to rename for real) ==="
  echo ""
fi

echo "Source:      $DOWNLOADS_DIR"
echo "Destination: $DEST_DIR"
echo ""

# Create destination if needed
if ! $DRY_RUN; then
  mkdir -p "$DEST_DIR"
fi

# Counter for files processed
processed=0
skipped=0
errors=0

# Function to extract text from a PDF (first page) for identification
identify_pdf() {
  local file="$1"
  local text=""

  # Try pdftotext first (poppler-utils)
  if command -v pdftotext &>/dev/null; then
    text=$(pdftotext -l 1 "$file" - 2>/dev/null || true)
  # Fall back to strings
  elif command -v strings &>/dev/null; then
    text=$(strings "$file" 2>/dev/null | head -100 || true)
  fi

  echo "$text"
}

# Function to determine the proper name for a PDF based on its content
name_for_pdf() {
  local file="$1"
  local text
  text=$(identify_pdf "$file")

  # Match known EDD form types by content
  if echo "$text" | grep -qi "DE 429D\|Notice of Computation"; then
    echo "DE-429D_Notice-of-Computation"
  elif echo "$text" | grep -qi "DE 2517-18\|Claim Date Adjustment"; then
    echo "DE-2517-18_Notice-of-Claim-Date-Adjustment"
  elif echo "$text" | grep -qi "DE 2517-01\|Notice of Determination"; then
    echo "DE-2517-01_Notice-of-Determination"
  elif echo "$text" | grep -qi "DE 2525.*A\|Notice of Exhaustion"; then
    echo "DE-2525A_Notice-of-Exhaustion"
  elif echo "$text" | grep -qi "DE 2500.*E\|Electronic Benefit Payment\|Benefit Payment"; then
    echo "DE-2500E_Electronic-Benefit-Payment"
  elif echo "$text" | grep -qi "DE 2515P[^T]\|Benefit Computation"; then
    echo "DE-2515P_Benefit-Computation"
  elif echo "$text" | grep -qi "DE 2515PT\|Payment Table"; then
    echo "DE-2515PT_Payment-Table"
  elif echo "$text" | grep -qi "DE 429DI\|Disability Benefits"; then
    echo "DE-429DI_Disability-Benefits-Info"
  elif echo "$text" | grep -qi "Notice of Automatic Payment"; then
    echo "Notice-of-Automatic-Payment"
  elif echo "$text" | grep -qi "New Medical Information"; then
    echo "New-Medical-Information-Received"
  elif echo "$text" | grep -qi "Additional Benefits\|Paid Family Leave"; then
    echo "Additional-Benefits-for-DI-Claimants"
  elif echo "$text" | grep -qi "Response.*inquiry\|Claim Update"; then
    echo "Response-to-Inquiry"
  else
    echo "UNKNOWN-EDD-Form"
  fi
}

# Function to extract a date from the PDF content
date_from_pdf() {
  local file="$1"
  local text
  text=$(identify_pdf "$file")

  # Look for dates in various formats
  # MM/DD/YYYY
  local date
  date=$(echo "$text" | grep -oP '\d{2}/\d{2}/\d{4}' | head -1 || true)
  if [[ -n "$date" ]]; then
    # Convert MM/DD/YYYY to YYYY-MM-DD
    echo "$date" | awk -F/ '{printf "%s-%s-%s", $3, $1, $2}'
    return
  fi

  # Month DD, YYYY
  date=$(echo "$text" | grep -oP '(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}' | head -1 || true)
  if [[ -n "$date" ]]; then
    date -d "$date" +%Y-%m-%d 2>/dev/null || echo "unknown-date"
    return
  fi

  # Fall back to file modification time
  date -r "$file" +%Y-%m-%d 2>/dev/null || echo "unknown-date"
}

# Find all PDFs in Downloads that look like EDD documents
echo "Scanning for EDD PDFs..."
echo ""

# Look for common EDD download filenames and recent PDFs
find "$DOWNLOADS_DIR" -maxdepth 1 -name "*.pdf" -newer "$DOWNLOADS_DIR" -mtime -7 -type f 2>/dev/null | sort | while read -r file; do
  basename=$(basename "$file")
  text=$(identify_pdf "$file")

  # Check if this looks like an EDD document
  is_edd=false
  if echo "$text" | grep -qi "EDD\|Employment Development\|Disability Insurance\|${CLAIM_ID}\|DE [0-9]\|Benefit Payment\|SDI Online"; then
    is_edd=true
  fi
  # Also check filename
  if echo "$basename" | grep -qi "DE[_ -]*[0-9]\|EDD\|SDI\|ExternalUser\|Benefit\|Notice"; then
    is_edd=true
  fi

  if ! $is_edd; then
    continue
  fi

  # Determine proper name
  form_name=$(name_for_pdf "$file")
  form_date=$(date_from_pdf "$file")
  new_name="${form_date}_${form_name}.pdf"

  # Handle duplicates — append a sequence number
  dest_path="${DEST_DIR}/${new_name}"
  if [[ -f "$dest_path" ]] || { $DRY_RUN && echo "$new_name" | grep -q "DE-2500E"; }; then
    seq=1
    while [[ -f "${DEST_DIR}/${form_date}_${form_name}_${seq}.pdf" ]]; do
      ((seq++))
    done
    new_name="${form_date}_${form_name}_${seq}.pdf"
    dest_path="${DEST_DIR}/${new_name}"
  fi

  if $DRY_RUN; then
    echo "  ${basename}"
    echo "    → ${new_name}"
    echo ""
  else
    mv "$file" "$dest_path"
    echo "  MOVED: ${basename} → ${new_name}"
  fi
  ((processed++)) || true

done

echo ""
echo "Processed: $processed files"
if $DRY_RUN; then
  echo ""
  echo "This was a dry run. Use --apply to rename and move files."
fi
