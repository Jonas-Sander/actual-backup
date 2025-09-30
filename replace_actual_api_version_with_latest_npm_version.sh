#!/usr/bin/env bash
set -euo pipefail

# Simple, deterministic update:
# - fetch latest version from npm
# - read current version from package.json
# - replace the old version with the new one in ALL tracked files

# Requirements: npm, git, sed, node

# 1) Resolve latest version from the npm registry's "latest" dist-tag
latest="$(npm view @actual-app/api version)"
if [ -z "${latest}" ]; then
  echo "Error: could not get latest version from npm."
  exit 1
fi

# 2) Read current version from package.json dependency fields (no heuristics)
#    Strips leading range operators like ^ or ~ to get the plain SemVer.
old="$(
  node -e 'const fs=require("fs");
    const f="package.json";
    if(!fs.existsSync(f)) process.exit(2);
    const p=JSON.parse(fs.readFileSync(f,"utf8"));
    const g=(o)=>o && o["@actual-app/api"];
    let v=g(p.dependencies)||g(p.devDependencies)||g(p.resolutions)||g(p.overrides);
    if(!v) process.exit(3);
    v=String(v).trim().replace(/^[~^<>=\s]+/,"");
    console.log(v);
  ' 2>/dev/null || true
)"
if [ -z "${old}" ]; then
  echo "Error: could not find @actual-app/api in package.json (dependencies/devDependencies/resolutions/overrides)."
  exit 1
fi

if [ "${old}" = "${latest}" ]; then
  echo "Already up to date: ${old}"
  exit 0
fi

echo "Bumping @actual-app/api: ${old} -> ${latest}"

# Escape replacement text for sed (treat literally)
escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}
old_esc="$(escape_sed "${old}")"
new_esc="$(escape_sed "${latest}")"

# 3) Replace across all tracked files except lockfiles
git ls-files -z \
| grep -z -v -E $'(^|/)package-lock\\.json$|(^|/)npm-shrinkwrap\\.json$|(^|/)pnpm-lock\\.yaml$|(^|/)yarn\\.lock$|(^|/)bun\\.lockb$' \
| xargs -0 sed -i -e "s/${old_esc}/${new_esc}/g"

echo "Done: updated references from ${old} to ${latest}"
