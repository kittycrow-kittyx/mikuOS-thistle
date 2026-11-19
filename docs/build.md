# Build

```sh
git submodule update --init --recursive
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run test:boot
```

Bun 1.4.5 runs host TypeScript directly. The build checks the exact root Thistle pin, strict Code Guards and types, then packages the browser runtime and custom base userland. Browser JavaScript is generated under `dist/web/`.

`bun run test` runs the Thistle integration suite. `bun run test:boot` starts an interactive CLI with a fresh overlay, checks `/bin/dd` and copies bytes with the installed GNU binary. The boot display regression compares 120 output hashes captured from the original C renderer.
