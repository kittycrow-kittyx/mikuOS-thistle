# Canonical Thistle integration

The `thistle` gitlink records the kernel revision. `project.dependencies.json` records the same commit. mikuOS imports the kernel classes and operations from that checkout.

`Os` composes the pinned `Kern` with distribution configuration, installed userland applications, terminal endpoints and persistence. Its root is the custom `.thistle.base` plus a separate writable overlay. The immutable base is never used as the writable root.

Canonical Thistle owns RV64 syscall integration, sparse guest memory, event polling and execution. RV64 instructions run only in its native core. Hosted file mappings reserve ranges in the same canonical address-space tables; shared data is flushed before release. WASI and network host capabilities are supplied explicitly.

## Verification

`bun run build` verifies the clean kernel pin and checks architecture, types and browser packaging. `bun src/test/all.ts --hosted-only` checks userspace semantics, actual GNU binaries and kernel object identity. `bun run test:boot` starts the real CLI in a pseudo-terminal, waits for the prompt, runs `which dd`, verifies `/bin/dd`, and copies bytes with the installed GNU dd. It uses the custom base with a fresh temporary overlay.

The boot check runs in CI after the full build and again from a clean checkout. No timing benchmark is involved.

The boot capability contract reuses Thistle's `KernelOptions` and receives explicit resource limits from `hostLimits()` in the host adapter. mikuOS defines no substitute options contract or default provider. Resource discovery is outside the boot graph.

The integration branch pins the exact consolidated Thistle candidate. Its process credentials, descriptor slots, filesystem namespace and guest memory live in canonical native state. Tests change filesystem identity through the native ABI and observe the permission change through mikuOS, then execute RV64 syscall fixtures in that same memory. Object-constructor identity alone is not used as proof.

During startup the login process stays at the root directory until restoration and optional package installation finish. Its configured working directory is then resolved in the restored namespace. This avoids holding an old home-directory inode across a root replacement. Shell redirections retain and restore descriptors through canonical duplication rather than reinstalling expired descriptor views.

The current milestone is complete Bake lowering of the canonical kernel and mikuOS userspace. Kernel-only lowering, hosted boot and passing behaviour tests are separate evidence. Transpilation, compilation and performance assessment remain later roadmap stages.
