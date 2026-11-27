# apps/index

The command registry constructs built-in applications and describes their rescue paths and compiler infrastructure. Generated manifest data reflects the registered applications used by image creation and recovery commands.

Public names: `BUILTIN_RESCUE_ROOT`, `BUILTIN_MANIFEST`, `COMPILER_MANIFEST`, `refreshBuiltinRescues`, `apps`.

Root rescue setup inspects names through public directory listings and uses kernel namespace operations for all changes.
