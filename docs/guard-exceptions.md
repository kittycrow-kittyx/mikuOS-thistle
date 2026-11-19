# Checked guard exceptions

The build runs the pinned Code Guards engine over repository-owned TypeScript, including tests and host scripts. Canonical Thistle files and Git submodules remain available for type resolution and are checked in their owning repositories.

Each reviewed checked exception uses `//@cg-expect-warning` immediately before their source line. The runner resolves expectations after combining all guard results. An obsolete expectation fails strict mode, so exceptions must be reviewed when the relevant code or checker changes.

Type-reuse analysis excludes canonical Thistle's `App` contract slots from the shape of mikuOS-owned command classes. The [local scope adapter](modules/scripts/guard-scope.md) retains local members and leaves all other guards unchanged. Class-level expectations for the inherited contract are no longer necessary.

The retained contracts cover fixed WASM and WASI scalar signatures, compatible public constructors and composition points that bring kernel services together. Parser, terminal and filesystem checks keep their selected state or transaction scope where flattening would obscure the required ordering. Comments at these lines explain that scope.

The JSON parser, whitelisted dynamic host-module loader and isolated bundle-evaluation tests are explicit external typing boundaries. JSON consumers validate their concrete metadata formats before accessing them. Ordinary source values use checked access, complete records or explicit null alternatives.
