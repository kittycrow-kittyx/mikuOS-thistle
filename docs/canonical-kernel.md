# Canonical Thistle integration

The `deps/thistle` gitlink records the kernel revision. `project.dependencies.json` records the same commit. mikuOS imports the kernel classes and operations from that checkout.

`Os` composes the pinned `Kern` with distribution configuration, installed userland applications, terminal endpoints and persistence. Its root is the custom `.thistle.base` plus a separate writable overlay. The immutable base is never used as the writable root.

Canonical Thistle owns RV64 syscall integration, sparse guest memory, event polling and execution. RV64 instructions run only in its native core. Hosted file mappings reserve ranges in the same canonical address-space tables; shared data is flushed before release. WASI and network host capabilities are supplied explicitly.

## Verification

`bun run build` verifies the clean kernel pin and checks architecture, types and browser packaging. `bun src/test/all.ts --hosted-only` checks userspace semantics, actual GNU binaries and kernel object identity. `bun run test:boot` starts the real CLI in a pseudo-terminal, waits for the prompt, runs `which dd`, verifies `/bin/dd`, and copies bytes with the installed GNU dd. It uses the custom base with a fresh temporary overlay.

The boot check runs in CI after the full build and again from a clean checkout. No timing benchmark is involved.
