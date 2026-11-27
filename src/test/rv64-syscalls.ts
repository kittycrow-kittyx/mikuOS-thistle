import assert from "node:assert/strict";
import { Exe, codec } from "../../thistle/thistle-asm/fmt.js";
import { emptyStart } from "../../thistle/src/core/kernel.js";
import type { Sys } from "../../thistle/src/core/sys.js";
import type { ProcCred } from "../../thistle/src/fs/vfs.js";
import { MemOut } from "../../thistle/src/io/stream.js";

/** A null argument forwards the register produced by the preceding syscall. */
export type GuestSyscall = readonly [number, readonly (bigint | null)[]];
export const GUEST_DATA = 0x300000n;

interface GuestResult {
  results: bigint[];
  data: DataView;
  credentials: ProcCred;
}

interface GuestProgram {
  image: Uint8Array;
  resultAt: number;
  outputLength: number;
}

// Each instruction reads arguments from a bounded data section and saves a0.
// Null forwards an existing register, allowing getpid followed by kill(pid, 0).
function syscallWords(calls: readonly GuestSyscall[], values: DataView, resultAt: number, outputLength: number): number[] {
  const words: number[] = [];
  let argumentAt = outputLength, result = resultAt;
  for (const [number, arguments_] of calls) {
    assert.ok(arguments_.length <= 6, "Linux syscalls accept at most six arguments");
    words.push(0x003002b7); // lui t0, 0x300
    let register = 10;
    for (const argument of arguments_) {
      if (argument !== null) {
        values.setBigInt64(argumentAt, argument, true);
        words.push((argumentAt << 20) | (5 << 15) | (3 << 12) | (register << 7) | 0x03);
      }
      register++;
      argumentAt += 8;
    }
    words.push((number << 20) | (17 << 7) | 0x13, 0x73, 0x003002b7);
    words.push(((result & 0xfe0) << 20) | (10 << 20) | (5 << 15) | (3 << 12) | ((result & 31) << 7) | 0x23);
    result += 8;
  }
  words.push(0x00100513, 0x003005b7, (outputLength << 20) | 0x613, 0x04000893, 0x73,
    0x00000513, 0x05d00893, 0x73);
  return words;
}

function guestProgram(calls: readonly GuestSyscall[], payload: Uint8Array): GuestProgram {
  const resultAt = Math.ceil(payload.length / 8) * 8;
  const outputLength = resultAt + calls.length * 8;
  const data = new Uint8Array(outputLength + calls.length * 6 * 8);
  assert.ok(data.length < 2048, "fixture offsets must fit an RV64 immediate");
  data.set(payload);
  const words = syscallWords(calls, new DataView(data.buffer), resultAt, outputLength);
  const code = new Uint8Array(words.length * 4), instructions = new DataView(code.buffer);
  words.forEach((word, index) => instructions.setUint32(index * 4, word, true));
  const exe = new Exe("thistle64");
  exe.isa = "rv64gc";
  exe.entry = 0x200000;
  exe.sec.push({ name: ".text", flg: "rx", align: 4096, addr: 0x200000, size: code.length, data: code });
  exe.sec.push({ name: ".data", flg: "rw", align: 4096, addr: Number(GUEST_DATA), size: data.length, data });
  return { image: codec.pack(exe), resultAt, outputLength };
}

// Execute through the public loader and return only a completed syscall trace.
// Guest memory and process records remain owned by the canonical kernel.
export async function runGuestSyscalls(s: Sys, calls: readonly GuestSyscall[], payload: Uint8Array): Promise<GuestResult> {
  const program = guestProgram(calls, payload);
  const path = "/tmp/rv64-syscall-probe.thx", output = new MemOut(), errors = new MemOut();
  s.writeb(path, program.image, false, 0o755);
  const child = s.start(path, [], { ...emptyStart(), io: { sin: null, sout: output, serr: errors } });
  assert.equal(child.native.memory, s.k.canonical.memory);
  assert.equal(await child.done, 0, errors.text());
  const credentials = child.cred;
  assert.equal(await s.wait(child.pid), 0);
  const bytes = output.bytes();
  assert.equal(bytes.length, program.outputLength, errors.text());
  const observed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: bigint[] = [];
  for (let offset = program.resultAt; offset < program.outputLength; offset += 8) results.push(observed.getBigInt64(offset, true));
  return { results, data: observed, credentials };
}
