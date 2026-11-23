# elf/elf

The ELF reader validates compatible static executable headers and loadable segments before constructing a THX executable. ISA, bounds and mapping checks still apply; reading an ELF file does not provide an arbitrary foreign syscall ABI.

Public names: `ElfErr`, `ElfResult`, `isElf`, `Elf`, `elf`.

`Elf.parse` returns an executable or a validation message. The guest importer uses that result directly; file-read failures retain their original kernel error. `Elf.run` preserves the throwing API used by existing host callers.
