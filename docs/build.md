# Build

```sh
git submodule update --init --recursive
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run test:boot
```

Bun 1.4.5 runs host TypeScript directly. The build checks the exact root Thistle pin, strict Code Guards and types, then generates the canonical executable test fixtures. Static website output is not produced by this source repository.

`bun run test` runs the Thistle integration suite. `bun run test:boot` starts an interactive CLI with a fresh overlay, checks `/bin/dd` and copies bytes with the installed GNU binary. The boot display regression compares 120 output hashes captured from the original C renderer.
