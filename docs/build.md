# Build and generated files

```sh
git submodule update --init --recursive
bun install --frozen-lockfile --ignore-scripts
bun run build
```

Bun 1.4.5 or later runs the host TypeScript directly. Type-checking uses
`bun --bun tsc --noEmit`. Build assets and browser bundles are generated
under `build/` and `dist/web/`; no host JavaScript is emitted.

The build verifies the exact direct Thistle pin. Its native modules and shared helpers are imported directly from `deps/thistle/`; no kernel files are staged into mikuOS.

Strict Code Guards and the exact pin verification remain mandatory.
`bun run test` runs the hosted integration suite and explicitly reports
tests requiring compiled Teto as not applicable. 

Browser bundles still contain JavaScript because the browser executes it.

The RV64GC execution adapter calls the pinned Thistle native instruction core directly. The old locally implemented instruction decoder is removed; the host cannot select a second RV64GC engine. Host process, filesystem and syscall compatibility services still need migration to the upstream kernel boundary. This is an intermediate integration step, not complete kernel separation.
