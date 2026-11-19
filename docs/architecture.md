# System architecture

On `mikuOS-Thistle`, mikuOS supplies the distribution root, accounts, shell, commands, CLI and browser front ends, and persistence adapters. The exact `deps/thistle` pin supplies the complete canonical kernel: processes, scheduling, VFS, terminal line discipline, executable dispatch, RV64 execution and syscalls, WASI and host capability contracts.

| Path | Purpose |
| --- | --- |
| `deps/thistle` | Canonical kernel, imported directly |
| `src/main` | Distribution boot, CLI, browser and persistence adapters |
| `src/apps` | Built-in userland commands |
| `src/sh` | Userland shell and line editor |
| `.thistle.base` | Custom immutable base userland |

The default Thistle mode has no separate local kernel or interpreter. This branch rejects explicit Teto selection. Other mikuOS branches are outside this refactor. See [canonical integration](canonical-kernel.md) for pin verification and the interactive boot regression.
