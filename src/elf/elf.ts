import { Exe } from "../../thistle/thistle-asm/fmt.js";

const EI_NIDENT = 16;
const ET_EXEC = 2;
const EM_RISCV = 243;
const PT_LOAD = 1;
const PT_DYNAMIC = 2;
const PT_INTERP = 3;
const PT_PHDR = 6;
const PF_X = 1;
const PF_W = 2;
const PF_R = 4;
const MAX_MEM = 1024 * 1024 * 1024 * 1024;

// The shared shape is an inherited protocol; runtime identities and payload roles remain distinct.
export class ElfErr extends Error {
  constructor(message: string) { super(message); this.name = "ElfErr"; }
}

export interface ElfResult {
  exe: Exe | null;
  message: string | null;
}

const failure = (message: string): ElfResult => ({ exe: null, message });
const nat = (n: bigint): number => n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER) ? -1 : Number(n);

const pow2 = (n: number): boolean => {
  if (n <= 0 || !Number.isSafeInteger(n)) return false;
  const q = BigInt(n);
  return (q & (q - 1n)) === 0n;
};

export const isElf = (b: Uint8Array): boolean => b.length >= EI_NIDENT && (b[0] ?? null) === 0x7f && (b[1] ?? null) === 0x45 && (b[2] ?? null) === 0x4c && (b[3] ?? null) === 0x46;

/** Import a linked RV64 executable. Relocating an ELF at runtime is a different job, so dynamic files are refused here. */
export class Elf {
  run(b: Uint8Array, name = "a.out"): Exe {
    const result = this.parse(b, name), exe = result.exe;
    if (exe !== null) return exe;
    throw new ElfErr(result.message ?? "invalid ELF executable");
  }

  // This public parser boundary is shared by guest imports and the compatibility API.
  //@cg-expect-warning
  parse(b: Uint8Array, name = "a.out"): ElfResult {
    if (!isElf(b)) return failure(`${name}: not an ELF file`);
    if (b.length < 64) return failure(`${name}: truncated ELF header`);
    if ((b[4] ?? null) !== 2 || (b[5] ?? null) !== 1 || (b[6] ?? null) !== 1) return failure(`${name}: expected ELF64 little-endian version 1`);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (v.getUint16(16, true) !== ET_EXEC) return failure(`${name}: only linked ET_EXEC files can become THX`);
    if (v.getUint16(18, true) !== EM_RISCV) return failure(`${name}: expected a RISC-V executable`);
    if (v.getUint32(20, true) !== 1) return failure(`${name}: unsupported ELF version`);

    const entry = nat(v.getBigUint64(24, true)), phoff = nat(v.getBigUint64(32, true));
    if (entry < 0) return failure("ELF entry is outside Thistle's address range");
    if (phoff < 0) return failure("program header offset is outside Thistle's address range");
    const ehz = v.getUint16(52, true), phz = v.getUint16(54, true), phn = v.getUint16(56, true);
    if (ehz !== 64 || phz !== 56 || !phn || phoff + phz * phn > b.length) return failure(`${name}: bad ELF program header table`);

    const x = new Exe("thistle64");
    x.isa = "rv64gc";
    x.entry = entry;
    x.mem = MAX_MEM;
    x.phent = phz;
    x.phnum = phn;
    x.ident.push(`ELF64 RISC-V imported from ${name}`);
    let loads = 0;
    let end = 0;

    for (let i = 0; i < phn; i++) {
      const at = phoff + i * phz, typ = v.getUint32(at, true), fl = v.getUint32(at + 4, true);
      const off = nat(v.getBigUint64(at + 8, true));
      if (off < 0) return failure(`segment ${i} offset is outside Thistle's address range`);
      const va = nat(v.getBigUint64(at + 16, true));
      if (va < 0) return failure(`segment ${i} address is outside Thistle's address range`);
      const fz = nat(v.getBigUint64(at + 32, true));
      if (fz < 0) return failure(`segment ${i} file size is outside Thistle's address range`);
      const mz = nat(v.getBigUint64(at + 40, true));
      if (mz < 0) return failure(`segment ${i} memory size is outside Thistle's address range`);
      const al0 = nat(v.getBigUint64(at + 48, true));
      if (al0 < 0) return failure(`segment ${i} alignment is outside Thistle's address range`);
      if (typ === PT_INTERP || typ === PT_DYNAMIC) return failure(`${name}: dynamic ELF files are not self-contained`);
      if (typ === PT_PHDR) x.phdr = va;
      if (typ !== PT_LOAD || !mz) continue;
      if (fz > mz || off + fz > b.length || va < 0x10000 || va + mz > x.mem) return failure(`${name}: bad load segment ${i}`);
      if (al0 > 1 && !pow2(al0)) return failure(`${name}: segment ${i} alignment is not a power of two`);
      let al = Math.min(al0 || 1, 65536);
      while (al > 1 && va % al) al >>= 1;
      const flg = `${fl & PF_R ? "r" : ""}${fl & PF_W ? "w" : ""}${fl & PF_X ? "x" : ""}`;
      x.sec.push({ name: `.elf.${loads++}`, flg, align: al, data: b.slice(off, off + fz), size: mz, addr: va });
      end = Math.max(end, va + mz);
      if (!x.phdr && phoff >= off && phoff + phz * phn <= off + fz) x.phdr = va + phoff - off;
    }

    if (!loads || !x.sec.some(s => s.flg.includes("x") && entry >= s.addr && entry < s.addr + s.size)) return failure(`${name}: entry point is not in an executable load segment`);
    const phdrAt = Math.ceil(end / 16) * 16, phdrBytes = phz * phn;
    if (!x.phdr && phdrAt + phdrBytes > x.mem) return failure(`${name}: no address remains for the ELF program headers`);
    if (!x.phdr) {
      x.phdr = phdrAt;
      x.sec.push({ name: ".elf.phdr", flg: "r", align: 16, data: b.slice(phoff, phoff + phdrBytes), size: phdrBytes, addr: phdrAt });
    }
    return { exe: x, message: null };
  }
}

export const elf = new Elf();
