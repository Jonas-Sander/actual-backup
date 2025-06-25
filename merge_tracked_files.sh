#!/bin/bash

# --- Configuration ---
DEFAULT_OUTPUT_FILE="merged_code.txt"
SEPARATOR_PREFIX="### File: "
SEPARATOR_SUFFIX=" ###"

# --- Argument Handling ---
OUTPUT_FILE="${1:-$DEFAULT_OUTPUT_FILE}" # Use first argument as output file, or default

# --- Pre-checks ---
# Check if inside a Git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: This script must be run from within a Git repository." >&2
  exit 1
fi

# Check if file command exists (optional, for basic binary check)
# Basic check to see if file command is available for mime type check
# file_cmd_exists=$(command -v file)

echo "Gathering tracked files..."

# --- Core Logic ---
# Clear the output file initially
> "$OUTPUT_FILE" || { echo "Error: Could not write to output file '$OUTPUT_FILE'." >&2; exit 1; }

processed_count=0
skipped_count=0

# Use git ls-files to get all tracked files (respects .gitignore)
# Use process substitution <(...) or a pipe |
# Use IFS= and read -r to handle filenames with spaces/special chars correctly
while IFS= read -r filename; do
  # Ensure the file path reported by git actually exists and is a file
  # (Handles edge cases like deleted files before script runs cat)
  if [[ -f "$filename" && -r "$filename" ]]; then

    # --- Optional Binary File Check ---
    # Uncomment the following block if you want to attempt to skip binary files.
    # Requires the 'file' command to be installed.
    # if [[ -n "$file_cmd_exists" ]]; then
    #   if file --mime-encoding "$filename" | grep -q 'binary'; then
    #     echo "--- Skipping binary file: $filename ---" >> "$OUTPUT_FILE"
    #     skipped_count=$((skipped_count + 1))
    #     continue # Skip to the next file
    #   fi
    # fi
    # --- End Optional Binary Check ---

    echo "Processing: $filename"
    # Append separator with filename
    echo "${SEPARATOR_PREFIX}${filename}${SEPARATOR_SUFFIX}" >> "$OUTPUT_FILE"
    # Append file content
    cat "$filename" >> "$OUTPUT_FILE"
    # Append a newline for visual separation between file contents
    echo "" >> "$OUTPUT_FILE"
    processed_count=$((processed_count + 1))
  else
    # Log if a file listed by git isn't found/readable (unlikely but possible)
    echo "--- Warning: Skipping '$filename' (Not found or not readable) ---" >> "$OUTPUT_FILE"
    skipped_count=$((skipped_count + 1))
  fi
done < <(git ls-files) # Use process substitution to feed the loop

echo "-------------------------------------"
echo "Done."
echo "Processed ${processed_count} files."
if [ "$skipped_count" -gt 0 ]; then
  echo "Skipped ${skipped_count} files (check warnings above)."
fi
echo "Merged content written to '$OUTPUT_FILE'."

exit 0