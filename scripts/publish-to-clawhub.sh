#!/usr/bin/env bash
# Publish the skills in this repo to ClawHub.
#
# Scans each top-level directory for a SKILL.md, reads the version from the
# frontmatter, and calls `clawhub publish` for any skill whose local version
# is newer than what's on the registry. Scoped strictly to this repo — does
# NOT touch skills elsewhere on the maintainer's machine.
#
# Usage:
#   scripts/publish-to-clawhub.sh                 # interactive (prompts per skill)
#   scripts/publish-to-clawhub.sh --yes           # auto-publish all outdated
#   scripts/publish-to-clawhub.sh --dry-run       # show what would be published
#   scripts/publish-to-clawhub.sh --changelog "text"   # reuse one changelog for all
#
# Prerequisites:
#   - ClawHub CLI available (`npx clawhub` works out of the box)
#   - One-time `npx clawhub login` on this machine (stores token locally,
#     outside the repo)
#
# The repo is public. This script contains no credentials.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

YES=0
DRY_RUN=0
CHANGELOG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) YES=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --changelog) CHANGELOG="$2"; shift 2;;
    -h|--help)
      grep -E "^#" "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1;;
  esac
done

# Simple semver comparison: returns 0 if $1 > $2, 1 otherwise.
# Handles x.y.z only (no prerelease suffixes).
version_gt() {
  [[ "$1" == "$2" ]] && return 1
  local IFS=.
  local i a=($1) b=($2)
  for ((i=0; i<${#a[@]} || i<${#b[@]}; i++)); do
    local av=${a[i]:-0} bv=${b[i]:-0}
    if (( av > bv )); then return 0; fi
    if (( av < bv )); then return 1; fi
  done
  return 1
}

# Read `version: "x.y.z"` from a SKILL.md frontmatter.
read_local_version() {
  local skill_md="$1"
  # Expects a line like:   version: "1.3.0"
  grep -E '^[[:space:]]*version:' "$skill_md" | head -1 \
    | sed -E 's/^[[:space:]]*version:[[:space:]]*"?([^"]+)"?[[:space:]]*$/\1/'
}

# Call `clawhub inspect <slug>` and extract the Latest version. Returns an
# empty string if the skill isn't published yet or the call fails.
read_remote_version() {
  local slug="$1"
  npx --yes clawhub inspect "$slug" 2>/dev/null \
    | awk -F': ' '/^Latest:/ {print $2; exit}' \
    | tr -d '[:space:]'
}

prompt_changelog() {
  local slug="$1" local_v="$2" remote_v="$3"
  if [[ -n "$CHANGELOG" ]]; then
    echo "$CHANGELOG"
    return
  fi
  echo "" >&2
  echo "── $slug ── new version $local_v (was ${remote_v:-unpublished})" >&2
  read -r -p "Changelog (one line, ENTER for generic): " entered >&2 || true
  if [[ -z "$entered" ]]; then
    entered="Release $local_v."
  fi
  echo "$entered"
}

found_any=0
published_any=0
skipped=0

# Consider every top-level directory that contains a SKILL.md as a publishable skill.
for dir in */; do
  slug="${dir%/}"
  skill_md="$dir/SKILL.md"
  [[ -f "$skill_md" ]] || continue
  found_any=1

  local_v="$(read_local_version "$skill_md")"
  if [[ -z "$local_v" ]]; then
    echo "⚠ $slug: could not read version from SKILL.md — skipping" >&2
    skipped=$((skipped+1))
    continue
  fi

  remote_v="$(read_remote_version "$slug")"

  if [[ -z "$remote_v" ]]; then
    decision="NEW"
  elif version_gt "$local_v" "$remote_v"; then
    decision="UPDATE ${remote_v} → ${local_v}"
  elif [[ "$local_v" == "$remote_v" ]]; then
    echo "✓ $slug@$local_v already on ClawHub — skipping"
    skipped=$((skipped+1))
    continue
  else
    echo "⚠ $slug: local $local_v < remote $remote_v — skipping (bump the version first)" >&2
    skipped=$((skipped+1))
    continue
  fi

  if (( DRY_RUN )); then
    echo "[dry-run] would publish $slug@$local_v  ($decision)"
    continue
  fi

  if (( ! YES )); then
    read -r -p "Publish $slug@$local_v ($decision)? [y/N] " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo "  skipped"
      skipped=$((skipped+1))
      continue
    fi
  fi

  changelog="$(prompt_changelog "$slug" "$local_v" "$remote_v")"

  echo "  publishing $slug@$local_v ..."
  npx --yes clawhub publish "$REPO_ROOT/$slug" \
    --slug "$slug" \
    --version "$local_v" \
    --changelog "$changelog"
  published_any=$((published_any+1))
done

if (( ! found_any )); then
  echo "No skill directories found (expected a top-level folder with a SKILL.md)." >&2
  exit 1
fi

echo ""
echo "Done. Published: $published_any. Skipped/up-to-date: $skipped."
