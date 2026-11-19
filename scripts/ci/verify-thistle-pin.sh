#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
upstream="$PWD/deps/thistle"
recorded="$(git ls-tree HEAD deps/thistle | awk '$1 == "160000" && $2 == "commit" {print $3}')"
[[ "$recorded" =~ ^[0-9a-f]{40}$ ]]
test "$(git -C "$upstream" rev-parse --show-toplevel)" = "$upstream"
test "$(git -C "$upstream" rev-parse HEAD)" = "$recorded"
git -C "$upstream" diff --quiet
git -C "$upstream" diff --cached --quiet
if git -C "$upstream" submodule status --recursive | grep -Eq '^[+-U]'; then
  echo "Thistle ancestry is not at the recorded pins" >&2
  exit 1
fi
test -z "$(git ls-files -- src/teto/image-range.ts src/core/rv64-decode.ts src/teto/abi.ts src/teto/kernel.ts src/teto/vfs.ts src/teto/thx.ts src/teto/start.ts src/teto/types.ts src/teto/memory.ts src/teto/word.ts src/core/native-types.ts src/core/rv64-arithmetic.ts src/core/rv64-branch.ts src/core/rv64-fclass.ts src/core/rv64-immediate-op.ts src/core/rv64-numbers.ts src/core/rv64-register.ts src/core/rv64-word.ts src/vm/rv64-immediate.ts)"
printf 'Verified canonical Thistle %s; imports resolve directly to its checkout.\n' "$recorded"
