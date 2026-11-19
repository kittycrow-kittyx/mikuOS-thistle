#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
root="$PWD"
scope="$(mktemp -d)"
trap 'rm -rf -- "$scope"' EXIT

# Preserve source and document ownership. Submodule directories remain
# symlinks for type resolution, never an input to the guard suite.
git ls-files --cached --others --exclude-standard -z | sort -zu > "$scope/.guard-files"
while IFS= read -r -d '' file; do
    mkdir -p "$scope/$(dirname "$file")"
    if [[ -d "$file" ]]; then
        ln -s "$root/$file" "$scope/$file"
    else
        case "$file" in
            *.ts|*.tsx|*.mts|*.cts|*.json|*.md|*.yaml|*.yml|*.sh|*.toml)
                cp -a -- "$file" "$scope/$file" ;;
            *)
                ln -s "$root/$file" "$scope/$file" ;;
        esac
    fi
done < "$scope/.guard-files"

ln -s "$root/node_modules" "$scope/node_modules"
mkdir -p logs
# Set the native runtime opt-out before Bun loads ONNX Runtime.
export ORT_DISABLE_TELEMETRY=1
bun "$root/scripts/ci/guards.mts" "$scope" | tee logs/code-guards.json
