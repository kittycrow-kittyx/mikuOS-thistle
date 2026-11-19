# Checked guard exceptions

The build runs the pinned Code Guards engine over repository-owned TypeScript, including tests and host scripts. Canonical Thistle files and Git submodules remain available for type resolution and are checked in their owning repositories.

Checked exceptions use `//@cg-expect-warning` immediately before their source line. The runner resolves expectations after combining all guard results. An obsolete expectation fails strict mode, so exceptions must be reviewed when the relevant code or checker changes.

The declaration of `Ls` in `src/apps/fs.ts` is a narrow exception: the semantic type-reuse finding for its intentional implementation of `App` has appeared and disappeared across CI runners with identical source and checker pins. Until upstream semantic inference is reproducible, `//@cg-ignore` suppresses diagnostics on that declaration line only. The method bodies and every other checked expectation remain subject to strict analysis.

The retained contracts cover fixed WASM and WASI scalar signatures, compatible public constructors, distinct commands implementing `App`, and composition points that bring kernel services together. Parser, terminal and filesystem checks keep their selected state or transaction scope where flattening would obscure the required ordering. Comments at these lines explain that scope.

The JSON parser, whitelisted dynamic host-module loader and isolated bundle-evaluation tests are explicit external typing boundaries. JSON consumers validate their concrete metadata formats before accessing them. Ordinary source values use checked access, complete records or explicit null alternatives.
