# Dependencies

| Path | Purpose |
| --- | --- |
| `thistle` | Canonical kernel, pinned to Thistle v2.2.2 |
| `thistle/thistle-asm` | Assembler and binary tools inherited through Thistle |
| `thistlecc` | Guest compiler driver |

`project.dependencies.json` records direct gitlinks. `upstream.releases.json` records their published archives. Initialise all inherited dependencies with `git submodule update --init --recursive`.
