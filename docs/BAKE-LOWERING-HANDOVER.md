# Canonical mikuOS Bake lowering handover

Updated: 27 November 2026. This is a continuation checkpoint, not a completion claim.

## Objective and acceptance

Lower the complete canonical mikuOS boot graph with Bake: one Thistle kernel implementation, the existing mikuOS shell and applications, and the custom `.thistle.base` userspace. Acceptance requires zero errors, zero warnings and actual emitted files. A kernel-only pass does not satisfy whole-system acceptance. Preserve real boot to interactive input, `which dd` resolving `/bin/dd`, and actual dd execution.

Transpilation to modular WAT and compilation to WASM are later milestones. Do not create a second source tree, substitute kernel, reduced rescue-only userspace, diagnostic suppression, or a permissive acceptance configuration to obtain a green result. Code Guards remains strict. No performance benchmarks are required.

## Repository boundaries

- Work on `kittycrow-kittyx/mikuOS-thistle`, branch `fix/single-kernel-integration`, draft PR 2, based on `fix/bake-lowering-mikuos`.
- Canonical kernel consolidation is on `kittycrow-kittyx/thistle`, branch `refactor/single-canonical-kernel`, draft PR 4. The user-invoked single-kernel consolidation handover authorises that isolated branch. It does not authorise edits to published main or release tags.
- Bake, Baguette, ThistleASM and other compiler dependencies are immutable for this task. Do not patch submodules or change dependency pins to conceal failures. Do not edit the original mikuOS Pages repository.
- Production pins and releases remain unchanged. Integration candidate pins must identify real committed kernel source and agree with dependency receipts.
- Equal Teto and mikuOS release SHAs are not the identity criterion. They must use the same canonical kernel implementation. Test the native kernel entry set at the exact candidate used by mikuOS.

## Recovered and verified starting checkpoint

The earlier local worktrees disappeared, but published progress survived. On 27 November the integration was recovered from GitHub at mikuOS `b9fb7b803e105868219ecc5f77ced5c369358acf`, pinning Thistle `d8dce8e05cbe902eebaeb84200f812b0e008fa51`. The only unfinished batch was a host transport ownership refactor which had not been published. Never describe all earlier work as lost.

Exact Bake revision: `ce02403e8f3e506d0339449b5886dad4f0549f60`. Bun: 1.4.5.

| Check at the starting checkpoint | Result |
| --- | --- |
| Full boot graph, `tsconfig.bake.json` | 30 errors, 967 warnings, 0 emitted files |
| Native kernel control, `tsconfig.bake-kernel.json` | 0 errors, 0 warnings, 30 emitted files |
| mikuOS hosted and real RV64 tests | 69 passing |
| Actual CLI boot | `.thistle.base`, interactive prompt, `/bin/dd`, successful byte copy |
| OS validation run 45978258704 | Passed |
| Full Bake run 45978258700 | Failed as expected; reports uploaded |
| Thistle validation run 45971019888 | Passed, including 94 kernel tests |
| Thistle compiler validation run 45971019825 | Passed |

The full report was reproduced locally at those exact commits during this continuation. Diagnostic counts: 27 BK1002 errors, 2 BK1102 errors, 1 BK2003 error, 967 BK3001 warnings. Of the warnings, 105 are in mikuOS-owned files and 862 in imported Thistle host, compatibility and tooling files. All 30 errors are in that imported graph. This is not evidence that the native kernel-only control fails.

Evidence: [mikuOS PR 2](https://github.com/kittycrow-kittyx/mikuOS-thistle/pull/2), [Thistle PR 4](https://github.com/kittycrow-kittyx/thistle/pull/4), [OS validation](https://github.com/kittycrow-kittyx/mikuOS-thistle/actions/runs/45978258704), [full lowering](https://github.com/kittycrow-kittyx/mikuOS-thistle/actions/runs/45978258700).

## Existing implementation to preserve

The integration uses native kernel process, credential, descriptor and VFS state through non-owning host views. Root restoration uses the canonical root authority. Login cwd is retained only after root restoration. Tests await OS readiness. Shell redirection retains native descriptors through duplication and releases backups. RV64 syscall tests execute actual guest programmes through the loader and canonical memory, rather than invoking private methods with replacement memory.

The kernel candidate fixes unused hart ownership, initialising unused process slots to the invalid sentinel, and corrects vfork attachment lifetime checks. The userspace checkpoint includes checked argument helpers, bounded test-expression operands, preference validation, shell command PATH restoration, text command fixes and reuse of Thistle's FnApp adapter. Do not discard those published changes.

## Remaining work and diagnostic meaning

1. Replace the two global WeakMap registries in `thistle/src/host/backing.ts` and `devices.ts` with external transport services owned by each host memory instance. Kernel permission, inode, process and descriptor state must remain in canonical native memory. Test isolation of two kernel instances and stale inode/descriptor rejection. Do not use a global strong Map instead.
2. Remove the unsupported async closure in `thistle/src/vm/rv64.ts` using an explicit method with the originating session and hart. Preserve asynchronous error propagation and resume behaviour.
3. Resolve unknown catch bindings with typed operations and explicit error contracts. Do not disable strict TypeScript or misrepresent arbitrary exceptions as typed values.
4. Remove undefined-sensitive and effectful nullish reads by establishing actual bounds, nullable values and single evaluation. Prefer existing native accessors and shared helpers. Preserve missing-input behaviour and lazy fallbacks.
5. Review imported assembler and compatibility execution dependencies. They must retain functionality. Moving a host capability is valid only with an explicit contract and working composition; hiding source behind declaration files or dropping installed commands is not whole-system lowering.
6. Re-run full graph and independent kernel control after each substantive batch. Keep actual JSON evidence, test outcomes and exact source commits together.

## Reproduction

Use a clean recursive checkout of the integration branch and the exact Bake revision above. Install the locked dependencies with Bun 1.4.5. The CI workflow `.github/workflows/canonical-lowering.yml` is the authoritative invocation.

```sh
bun --bun tsc --noEmit -p tsconfig.json
bun --bun tsc --noEmit -p tsconfig.tools.json
bun src/test/all.ts --hosted-only
bun scripts/ci/test-canonical-boot.ts
bun ../bake/src/cli.ts --project tsconfig.bake-kernel.json --out-dir build/lowering/kernel/source --target wasm --engine host --fail-on-warnings --report build/lowering/kernel/bake-report.json
bun ../bake/src/cli.ts --project tsconfig.bake.json --out-dir build/lowering/source --target wasm --engine host --fail-on-warnings --report build/lowering/bake-report.json
```

Strict Code Guards is `bun run guards:verified` after pin verification. Local partial deterministic checks are development feedback only, never a replacement for full strict CI.

## Continuation and persistence rules

Publish every substantive batch through the GitHub connector with an expected-head lease. Verify the resulting branch head. Record the commit, exact diagnostic report and validation result. Keep incomplete work in an explicitly identified draft branch, never only in a temporary workspace. Update this handover before ending a turn and provide its GitHub link. Do not claim success from a missing report, zero emitted files, stale CI, or only the kernel control.

The next agent should first read the latest revision of this document and the current PR heads. Resume the remaining work instead of repeating completed migrations. The first source batch is committed to Thistle at `2da874937d18b855df98ec51f3afd0f1bb5d3126`. The integration pin in this checkpoint selects it. The full report is now **27 errors, 734 warnings, 0 emitted files**, down from 30/967. All 69 mikuOS tests and the actual CLI boot/dd test passed locally against that exact kernel. Kernel tests increased to 96 and all passed; type checking and local deterministic guards passed. Full kernel CI is running in runs 46029251461 and 46029251525.

Changes: memory-owned backing/device transports replace WeakMap registries; the host write closure becomes a named method; Linux syscall operands are captured from the native hart with `thistleHartGetX` instead of 227 repeated nullable register reads. Two new tests prove byte/device transport isolation between instances. A trial that broadened generic checked-value helpers to accept undefined was rejected by strict guards and discarded before publication. Do not reinstate that trial.
