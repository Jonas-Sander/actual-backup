#!/usr/bin/env bash
set -euo pipefail

# Undo script for actual update:
# 1. Closes any open Pull Request for the update branch via 'gh'
# 2. Switches back to main branch
# 3. Deletes local branch update-to-actual-<version>
# 4. Deletes remote branch on origin

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

target_version="${1:-}"

# Auto-detect version if not provided
if [ -z "$target_version" ]; then
  current_branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ "$current_branch" =~ ^update-to-actual-(.+)$ ]]; then
    target_version="${BASH_REMATCH[1]}"
  else
    if command -v curl >/dev/null 2>&1; then
      target_version="$(curl -sf --connect-timeout 5 https://registry.npmjs.org/@actual-app%2Fapi/latest 2>/dev/null \
        | grep -o '"version":"[^"]*"' | head -n1 | cut -d: -f2 | tr -d ' "' || true)"
    fi
  fi
fi

if [ -z "$target_version" ]; then
  echo "Error: Could not determine version to undo. Usage: $(basename "$0") [VERSION]" >&2
  exit 1
fi

branch_name="update-to-actual-${target_version}"
echo "==> Reverting update for version ${target_version} (branch: ${branch_name})"

# 1. Close open PR if gh is available
if command -v gh >/dev/null 2>&1; then
  open_pr="$(gh pr list --head "${branch_name}" --state open --json number --jq '.[0].number' 2>/dev/null || true)"
  if [ -n "$open_pr" ]; then
    echo "==> Closing PR #${open_pr} via gh..."
    gh pr close "$open_pr" --comment "Update undone for retesting."
  else
    echo "==> No open PR found for branch ${branch_name}."
  fi
fi

# 2. Switch back to main
current_branch="$(git branch --show-current 2>/dev/null || true)"
if [ "$current_branch" = "${branch_name}" ]; then
  echo "==> Switching back to main branch..."
  git checkout .
  git checkout main
fi

# 3. Delete local branch
if git show-ref --verify --quiet "refs/heads/${branch_name}"; then
  echo "==> Deleting local branch ${branch_name}..."
  git branch -D "${branch_name}"
fi

# 4. Delete remote branch
if git ls-remote --exit-code --heads origin "${branch_name}" >/dev/null 2>&1; then
  echo "==> Deleting remote branch origin/${branch_name}..."
  git push origin --delete "${branch_name}"
fi

echo "==> Successfully undone update for ${target_version}."
