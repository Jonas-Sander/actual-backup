#!/bin/bash

# --- Configuration ---
DEFAULT_OUTPUT_FILE="merged_code.txt"
SEPARATOR_PREFIX="### File: "
SEPARATOR_SUFFIX=" ###"

# --- Inclusion/Exclusion Globs ---
# Add patterns here to *only* include files matching these globs.
# If this array is empty, all non-excluded files are included.
# Globs are Bash patterns (e.g., *.py, src/**/*.js, data?.txt)
# Ensure 'shopt -s globstar' is enabled below if using **
INCLUDE_GLOBS=(
  # "*.sh"
  # "*.py"
  # "src/**/*.go"
  # "lib/**"
)

# Add patterns here to *exclude* files matching these globs.
# Exclusion takes precedence over inclusion.
# Common examples: build artifacts, logs, vendor directories.
EXCLUDE_GLOBS=(
  "*.ppd"
  ".lock"
  ".git/*" # Exclude the git directory itself if ls-files somehow lists it
  # Add project-specific exclusions here:
  # "docs/*"
  # "testdata/*"
)

# Enable extended globbing features like ** (matches zero or more directories)
shopt -s globstar

# --- Argument Handling ---
OUTPUT_FILE="${1:-$DEFAULT_OUTPUT_FILE}" # Use first argument as output file, or default

# --- Pre-checks ---
# Check if inside a Git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: This script must be run from within a Git repository." >&2
  exit 1
fi

echo "Gathering tracked files..."
echo "Output file: $OUTPUT_FILE"
echo "Include Globs: ${INCLUDE_GLOBS[@]}"
echo "Exclude Globs: ${EXCLUDE_GLOBS[@]}"
echo "---"


# --- Core Logic ---
# Clear the output file initially
> "$OUTPUT_FILE" || { echo "Error: Could not write to output file '$OUTPUT_FILE'." >&2; exit 1; }

processed_count=0
skipped_count=0

# Use git ls-files to get all tracked files (respects .gitignore)
# Use process substitution <(...)
# Use IFS= and read -r to handle filenames with spaces/special chars correctly
while IFS= read -r filename; do
  # --- Filtering Logic ---
  excluded=false
  included=false # Assume not included by default if INCLUDE_GLOBS is used

  # 1. Check Exclusions first
  for pattern in "${EXCLUDE_GLOBS[@]}"; do
      # Use Bash's extended glob matching [[ string == pattern ]]
      if [[ "$filename" == $pattern ]]; then
          excluded=true
          # echo "Debug: '$filename' matches exclude pattern '$pattern'" # Uncomment for debugging
          break # No need to check other exclude patterns
      fi
  done

  if $excluded; then
      echo "Skipping (excluded): $filename"
      skipped_count=$((skipped_count + 1))
      continue # Move to the next file
  fi

  # 2. Check Inclusions (only if INCLUDE_GLOBS is not empty)
  if [ ${#INCLUDE_GLOBS[@]} -gt 0 ]; then
      # If INCLUDE_GLOBS is defined, the file MUST match one of them
      for pattern in "${INCLUDE_GLOBS[@]}"; do
          if [[ "$filename" == $pattern ]]; then
              included=true
              # echo "Debug: '$filename' matches include pattern '$pattern'" # Uncomment for debugging
              break # Found a matching include pattern
          fi
      done
  else
      # If INCLUDE_GLOBS is empty, and the file wasn't excluded, include it by default.
      included=true
  fi

  if ! $included; then
      echo "Skipping (not included): $filename"
      skipped_count=$((skipped_count + 1))
      continue # Move to the next file
  fi

  # --- File Processing ---
  # Ensure the file still exists and is readable after filtering
  if [[ -f "$filename" && -r "$filename" ]]; then
    echo "Processing: $filename"
    # Append separator with filename
    echo "${SEPARATOR_PREFIX}${filename}${SEPARATOR_SUFFIX}" >> "$OUTPUT_FILE"
    # Append file content
    cat "$filename" >> "$OUTPUT_FILE"
    # Append a newline for visual separation between file contents
    echo "
    " >> "$OUTPUT_FILE"
    processed_count=$((processed_count + 1))
  else
    # Log if a file listed by git isn't found/readable (unlikely but possible)
    echo "--- Warning: Skipping '$filename' (Not found or not readable after filtering) ---" # Modified warning
    skipped_count=$((skipped_count + 1))
  fi

done < <(git ls-files) # Use process substitution to feed the loop

echo "-------------------------------------"
echo "Done."
echo "Processed ${processed_count} files."
echo "Skipped ${skipped_count} files based on inclusion/exclusion rules or read errors."
echo "Merged content written to '$OUTPUT_FILE'."

exit 0