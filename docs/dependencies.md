# Dependencies

| Path | Release | Purpose |
| --- | --- | --- |
| `src/asm` | v2.1.1 | Assembler and binary tools |
| `thistlecc` | v2.1.1 | Compiler driver |
| `deps/thistle` | v2.2.1 | Thistle kernel |

KITTYX is inherited from the pinned upstream ancestry, not pinned separately in mikuOS. The selected kernel owns its own compiler dependencies. The exact gitlinks are recorded in `project.dependencies.json`; corresponding published releases are recorded in `upstream.releases.json`.

Initialise with `git submodule update --init --recursive`.

This branch uses direct Thistle source for the hosted TypeScript runtime. Teto binaries are not built or required by its default build. The branch-specific validation suite still needs to be adapted.
