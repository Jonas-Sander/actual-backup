#!/usr/bin/env bash
set -euo pipefail

# Automated update script for actual-backup:
# 1. Resolves latest (or specified) @actual-app/api version
# 2. Checks if update is needed and whether an open PR already exists
# 3. Creates/switches to a dedicated update branch
# 4. Updates version references in package.json, package-lock.json, actual-backup.nix, and README.md
# 5. Automatically recalculates npmDepsHash using prefetch-npm-deps
# 6. Verifies the package builds cleanly with 'nix build'
# 7. Commits changes, pushes branch, and opens a Pull Request using 'gh'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Default flags
CHECK_ONLY=false
DRY_RUN=false
COMMIT=true
CREATE_PR=true
PUSH=true
FORCE=false
SPECIFIED_VERSION=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] [VERSION]

Automates updating @actual-app/api to the latest (or specified) version.

Arguments:
  VERSION             Target version (e.g. 26.10.0). Defaults to latest on npm.

Options:
  -c, --check         Check if an update is available without making changes.
  -d, --dry-run       Check versions and print planned actions without modifying files.
  --no-commit         Update files, recalculate hash, test nix build, but do not git commit.
  --no-pr             Commit changes locally, but do not push or create a PR.
  --no-push           Do not push branch to origin. Implies --no-pr.
  -f, --force         Proceed even if a branch or open PR already exists.
  --undo [VERSION]    Undo an update: closes the open PR, deletes local & remote branches.
  -h, --help          Show this help message.

Examples:
  $(basename "$0")              # Full automatic update & PR creation to latest version
  $(basename "$0") 26.10.0       # Update to specific version and create PR
  $(basename "$0") --undo        # Revert/delete current update PR and branch
  $(basename "$0") --check       # Only check for new version (exit code 0 if up to date, 2 if update available)
  $(basename "$0") --no-commit   # Update files, recalculate hash, and test build, leave uncommitted
  $(basename "$0") --no-pr       # Update files, recalculate hash, test nix build, and commit locally
EOF
  exit 0
}

# Parse command line options
while [[ $# -gt 0 ]]; do
  case "$1" in
    --undo)
      shift
      exec "${REPO_ROOT}/undo-update.sh" "$@"
      ;;
    -h|--help)
      usage
      ;;
    -c|--check)
      CHECK_ONLY=true
      shift
      ;;
    -d|--dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-commit)
      COMMIT=false
      PUSH=false
      CREATE_PR=false
      shift
      ;;
    --no-pr)
      CREATE_PR=false
      shift
      ;;
    --no-push)
      PUSH=false
      CREATE_PR=false
      shift
      ;;
    -f|--force)
      FORCE=true
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      if [ -z "$SPECIFIED_VERSION" ]; then
        SPECIFIED_VERSION="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage
      fi
      shift
      ;;
  esac
done

# Helpers to invoke npm, node, prefetch-npm-deps even outside devenv / nix-shell
run_npm() {
  if command -v npm >/dev/null 2>&1; then
    npm "$@"
  elif command -v nix >/dev/null 2>&1; then
    nix shell nixpkgs#nodejs_22 -c npm "$@"
  elif command -v devenv >/dev/null 2>&1; then
    devenv shell npm "$@"
  else
    echo "Error: Neither npm, nix, nor devenv found in PATH." >&2
    exit 1
  fi
}

run_prefetch_npm_deps() {
  if command -v prefetch-npm-deps >/dev/null 2>&1; then
    prefetch-npm-deps "$@"
  elif command -v nix >/dev/null 2>&1; then
    nix run nixpkgs#prefetch-npm-deps -- "$@"
  else
    echo "Error: Neither prefetch-npm-deps nor nix found in PATH." >&2
    exit 1
  fi
}

# Resolve latest version
get_latest_npm_version() {
  local ver=""
  if command -v curl >/dev/null 2>&1; then
    ver="$(curl -sf --connect-timeout 5 https://registry.npmjs.org/@actual-app%2Fapi/latest 2>/dev/null \
      | grep -o '"version":"[^"]*"' | head -n1 | cut -d: -f2 | tr -d ' "' || true)"
  fi
  if [ -z "$ver" ]; then
    ver="$(run_npm view @actual-app/api version 2>/dev/null || true)"
  fi
  if [ -z "$ver" ]; then
    echo "Error: Could not resolve latest version for @actual-app/api from npm." >&2
    exit 1
  fi
  echo "$ver"
}

# Read current version from package.json
get_current_version() {
  local ver=""
  if [ -f "package.json" ]; then
    ver="$(grep -o '"@actual-app/api": *"[^"]*"' package.json | head -n1 | sed -E 's/.*"[~^<>= ]*([^"]+)".*/\1/' || true)"
  fi
  if [ -z "$ver" ]; then
    echo "Error: Could not find @actual-app/api in package.json." >&2
    exit 1
  fi
  echo "$ver"
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

current_version="$(get_current_version)"

if [ -n "$SPECIFIED_VERSION" ]; then
  target_version="$SPECIFIED_VERSION"
else
  target_version="$(get_latest_npm_version)"
fi

echo "Current version: ${current_version}"
echo "Target version:  ${target_version}"

if [ "${current_version}" = "${target_version}" ]; then
  echo "Already up to date: @actual-app/api is at ${current_version}."
  exit 0
fi

if [ "$CHECK_ONLY" = true ]; then
  echo "Update available: ${current_version} -> ${target_version}"
  exit 2
fi

branch_name="update-to-actual-${target_version}"

# Check for existing PR via gh if gh is available
if [ "$CREATE_PR" = true ] && command -v gh >/dev/null 2>&1; then
  existing_pr="$(gh pr list --head "${branch_name}" --state open --json url --jq '.[0].url' 2>/dev/null || true)"
  if [ -n "$existing_pr" ] && [ "$FORCE" = false ]; then
    echo "An open Pull Request already exists for ${branch_name}:"
    echo "  ${existing_pr}"
    echo "Use --force to recreate or update."
    exit 0
  fi
fi

if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Would update @actual-app/api from ${current_version} to ${target_version}."
  echo "[DRY-RUN] Branch: ${branch_name}"
  echo "[DRY-RUN] Steps to execute: update package.json, update package-lock.json, prefetch npmDepsHash, update actual-backup.nix, README.md, nix build"
  if [ "$COMMIT" = true ]; then
    echo "[DRY-RUN] Would commit changes to ${branch_name}."
  fi
  if [ "$CREATE_PR" = true ]; then
    echo "[DRY-RUN] Would push ${branch_name} and open a Pull Request via gh."
  fi
  exit 0
fi

# Ensure git working tree is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory has uncommitted changes. Please commit or stash them first." >&2
  git status --short
  exit 1
fi

echo "==> Creating / switching to branch: ${branch_name}"
current_branch="$(git branch --show-current 2>/dev/null || true)"
if [ "$current_branch" != "${branch_name}" ]; then
  git checkout -B "${branch_name}"
fi

echo "==> Updating package.json to ${target_version}..."
sed -i -E 's|("@actual-app/api": *")[^"]*"|\1'"${target_version}"'"|' package.json

echo "==> Updating package-lock.json..."
run_npm install --package-lock-only

echo "==> Computing new npmDepsHash using prefetch-npm-deps..."
new_hash="$(run_prefetch_npm_deps package-lock.json)"
if [[ ! "$new_hash" =~ ^sha256- ]]; then
  echo "Error: Failed to compute valid npmDepsHash. Output was: ${new_hash}" >&2
  exit 1
fi
echo "Calculated npmDepsHash: ${new_hash}"

echo "==> Updating actual-backup.nix..."
sed -i -E 's|version \? "[^"]*"|version ? "'"${target_version}"'"|' actual-backup.nix
sed -i -E 's|npmDepsHash \? "[^"]*"|npmDepsHash ? "'"${new_hash}"'"|' actual-backup.nix

echo "==> Updating README.md..."
sed -i -E 's|("@actual-app/api": *")[^"]*"|\1'"${target_version}"'"|g' README.md

echo "==> Updating any remaining version references across tracked files..."
old_esc="$(escape_sed "${current_version}")"
new_esc="$(escape_sed "${target_version}")"
git ls-files -z \
  | grep -z -v -E $'(^|/)package-lock\\.json$|(^|/)npm-shrinkwrap\\.json$|(^|/)pnpm-lock\\.yaml$|(^|/)yarn\\.lock$|(^|/)bun\\.lockb$|(^|/)flake\\.nix$' \
  | xargs -0 sed -i -e "s/${old_esc}/${new_esc}/g"

echo "==> Verifying package build with 'nix build --no-link'..."
if ! nix build --no-link; then
  echo "Error: nix build failed after updating to ${target_version}!" >&2
  echo "Reverting modified files..."
  git checkout .
  exit 1
fi
echo "==> Build verification successful!"

if [ "$COMMIT" = true ]; then
  # Configure git bot user if user.name is unset (e.g. CI environments)
  if [ -z "$(git config user.name 2>/dev/null || true)" ]; then
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
  fi

  echo "==> Committing changes..."
  git add -u
  git commit -m "Update to actual v${target_version}."

  if [ "$PUSH" = true ]; then
    echo "==> Pushing branch ${branch_name} to origin..."
    if [ "$FORCE" = true ]; then
      git push --force-with-lease -u origin "${branch_name}"
    else
      git push -u origin "${branch_name}"
    fi
  fi

  if [ "$CREATE_PR" = true ]; then
    if command -v gh >/dev/null 2>&1; then
      echo "==> Opening Pull Request with gh..."
      pr_body="Bumps \`@actual-app/api\` to \`v${target_version}\`.

### Changes
- Updated \`@actual-app/api\` to \`${target_version}\` in \`package.json\`
- Updated \`package-lock.json\`
- Updated \`npmDepsHash\` and \`version\` in \`actual-backup.nix\`
- Updated \`README.md\`
- Verified build with \`nix build\`

Release notes: https://github.com/actualbudget/actual/releases/tag/v${target_version}"

      pr_url="$(gh pr create \
        --title "Update to actual v${target_version}." \
        --body "$pr_body" \
        --base main \
        --head "${branch_name}" 2>&1 || true)"

      echo "==> Done!"
      echo "${pr_url}"
    else
      echo "Warning: 'gh' CLI not found. Branch ${branch_name} pushed, but PR could not be created automatically."
      echo "You can create a PR manually at https://github.com/Jonas-Sander/actual-backup/compare/${branch_name}?expand=1"
    fi
  else
    echo "==> Done! Changes committed to branch ${branch_name}."
  fi
else
  echo "==> Done! Files updated and verified with nix build. Changes left uncommitted in working directory."
fi
