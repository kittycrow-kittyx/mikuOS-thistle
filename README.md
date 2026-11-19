# MIKU

**MIKU**: MIKU Is Not the Kernel; it's Userspace.

mikuOS (初音ミクOS) provides a Unix-like userspace with a common root image,
accounts, shell, command set and THX executable support. Release 0.3 is styled
**v｡三**.

## Kernel branch

`mikuOS-Thistle` pins [Thistle v2.2.1](https://github.com/kittycrow-kittyx/thistle/releases/tag/v2.2.1) at `76932c85c4db2eb481345aafe8611e6f53de9d85`.

This branch uses the pinned Thistle native RV64GC instruction core for hosted execution. Teto binaries are not built or required by its default build. Hosted validation runs directly with Bun; compiled Teto checks are not applicable.

## Build

```sh
git submodule update --init --recursive
bun install --frozen-lockfile --ignore-scripts
bun run build
```

The build verifies the pinned Thistle source and type-checks direct imports from it and prepares the static browser files. See [build and generated files](docs/build.md).

## Run

```sh
bun mikuos.ts --kernel=thistle
```

The CLI and browser default to Thistle. This checkout does not include a Teto binary.

A host directory can be selected with `--root PATH`. `--bin PATH NAME`
loads a supported guest executable into the running system.

Build and preview the static site:

```sh
bun run web
bun run serve:web
```

Static files are written to `dist/web/`.

The CLI initialises its writable root from `.thistle.base/`.
The default shell is `/bin/thsh`; `/bin/bash` is an installed
alternative. See [root image and userland](docs/userland.md).

## Documentation

- [Source module index](docs/index.md)
- [System architecture](docs/architecture.md)
- [Build and generated files](docs/build.md)
- [Dependencies](docs/dependencies.md)
- [Root image and userland](docs/userland.md)
- [Static browser build](docs/web.md)
- [Userland migration plan](docs/userland-migration.md)

## Licence

[MIT](LICENSE) for original code. Bundled software retains its upstream
licences; see [third-party software](THIRD_PARTY.md).

The RV64GC execution adapter calls the pinned Thistle native instruction core directly. The old locally implemented instruction decoder is removed; the host cannot select a second RV64GC engine. Host process, filesystem and syscall compatibility services still need migration to the upstream kernel boundary. This is an intermediate integration step, not complete kernel separation.
