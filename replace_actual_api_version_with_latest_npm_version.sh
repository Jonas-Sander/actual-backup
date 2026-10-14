#!/usr/bin/env bash
set -euo pipefail

# Legacy script entry point - forwards to the comprehensive update.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Forwarding to update.sh..."
exec "${SCRIPT_DIR}/update.sh" "$@"
