// This module composes kernel, toolchain or integration-test boundaries and intentionally imports their contracts.
//@cg-expect-warning
import { BootRenderer } from "../boot/display.js";
import { Elf, ElfErr } from "../elf/elf.js";
import { createHash } from "node:crypto";
import { parseJson } from "../core/json.js";
import { defaultPrefs, parsePrefs } from "../sh/prefs.js";
import assert from "node:assert/strict";
import { hostModule } from "../main/host-module.js";
import { withValue } from "../../thistle/src/core/err.js";
import { requireValue } from "../../thistle/src/core/err.js";
import { runInNewContext } from "node:vm";
import { boot } from "../main/host-boot.js";
import { ROOT_IMAGE_VERSION } from "../main/image.js";
import { FnApp } from "../../thistle/src/apps/base.js";
import { Rm } from "../apps/fs.js";
import type { Ch, Os } from "../main/boot.js";
import { KErr } from "../../thistle/src/core/err.js";
import { dec, enc } from "../../thistle/src/io/stream.js";
import { Net, NetDev } from "../../thistle/src/net/net.js";
import type { DReq, DRes } from "../../thistle/src/net/net.js";
import { Asm } from "../../thistle/thistle-asm/asm.js";
import { Link } from "../../thistle/thistle-asm/link.js";
import { Exe, Obj, codec } from "../../thistle/thistle-asm/fmt.js";
import type { Tree, TreeEnt } from "../../thistle/src/fs/tree.js";
import { DirTree } from "../main/dir.js";
import { Mem64 } from "../../thistle/src/vm/mem64.js";
import { Rv64 } from "../../thistle/src/vm/rv64.js";
import { Sys } from "../../thistle/src/core/sys.js";
import { Kern } from "../../thistle/src/core/kernel.js";
import { Proc } from "../../thistle/src/core/proc.js";
import { Vfs } from "../../thistle/src/fs/vfs.js";
import { Tty } from "../../thistle/src/io/tty.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import { DEFAULT_CONFIG as CANONICAL_CONFIG } from "../../thistle/src/core/config.js";
import { IDENTITY } from "../core/identity.js";
import { LineEditor } from "../sh/editor.js";
import { hostConfig, mergeConfig } from "../main/config.js";
import { sourceReleaseName } from "../core/release.js";
import { rv64Branch } from "../../thistle/src/core/rv64-branch.js";
import { rv64RegisterWordValid, rv64RegisterWordValue, rv64ImmediateWordValid, rv64ImmediateWordValue } from "../../thistle/src/core/rv64-word.js";
import { rv64ImmediateOpValid, rv64ImmediateOpValue } from "../../thistle/src/core/rv64-immediate-op.js";
import { rv64RegisterValid, rv64RegisterValue } from "../../thistle/src/core/rv64-register.js";
import { rv64FloatClass } from "../../thistle/src/core/rv64-fclass.js";
import {
  rv64DivideSigned,
  rv64DivideUnsigned,
  rv64MulHighSigned,
  rv64MulHighSignedUnsigned,
  rv64MulHighUnsigned,
  rv64RemainderSigned,
  rv64RemainderUnsigned,
} from "../../thistle/src/core/rv64-arithmetic.js";
import {
  rv64CompressedJump,
  rv64ImmediateB,
  rv64ImmediateI,
  rv64ImmediateJ,
  rv64ImmediateS,
  rv64ImmediateU,
} from "../../thistle/src/vm/rv64-immediate.js";
import { localSessionPlan, superviseLocalLogin } from "../main/session.js";
import { WebSession } from "../main/websession.js";
import { WebTree } from "../main/webtree.js";

class TestNet extends NetDev {
  seen: DReq[] = [];

  override async req(r: DReq, sig: AbortSignal): Promise<DRes> {
    if (sig.aborted) throw new KErr("EINTR", "test request aborted");
    this.seen.push(r);
    const u = new URL(r.url);
    if (u.pathname === "/go") return { url: r.url, status: 302, text: "Found", hdr: { location: "/file" }, body: new Uint8Array() };
    if (u.pathname === "/gone") return { url: r.url, status: 404, text: "Not Found", hdr: {}, body: enc("missing") };
    const body = r.method === "POST" ? r.body ?? new Uint8Array() : enc("network payload\n");
    if (body.length > r.max) throw new KErr("EFBIG", "test response is too large");
    return { url: r.url, status: 200, text: "OK", hdr: { "content-type": "text/plain", "content-length": String(body.length) }, body };
  }
}

class Rig {
  os: Os;
  out = "";
  err = "";

  constructor(net: Net | null = null, setId = false) {
    this.os = boot({"halt": null, "tree": null, "requireTree": null, "pkg": null, "config": null, "account": null, "onBootProgress": null, put: (s, ch: Ch) => { if (ch === "err") this.err += s; else this.out += s; },
      setId,
    }, net);
  }

  async run(s: string): Promise<{ code: number; out: string; err: string }> {
    this.out = ""; this.err = "";
    const code = await this.os.run(s);
    return { code, out: this.out, err: this.err };
  }
}

class MemTree implements Tree {
  readonly label = "test host directory";
  ent: TreeEnt[] | null = null;
  imageVersion = 0;
  async pull(): Promise<TreeEnt[] | null> { return withValue(this.ent ?? null, value => value.map(x => ({ ...x, ...(x.data ? {data: x.data.slice() } : {}) }))) ?? null; }
  async push(ent: TreeEnt[], imageVersion: number | null = this.imageVersion): Promise<void> {
    imageVersion ??= this.imageVersion;
    this.ent = ent.map(x => ({ ...x, ...(x.data ? {data: x.data.slice() } : {}) }));
    this.imageVersion = imageVersion;
  }
}

const tests: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>): void => { tests.push([name, fn]); };
test("preference validation reports input errors without mutating existing settings", () => {
  const initial = defaultPrefs();
  initial.historySize = 17;
  initial.completionListLimit = 9;
  const parsed = parsePrefs("historySize=-1\ncompletionListLimit=0\ncolour=perhaps\ndefaultScriptLang=other\nfutureSetting='retained'", initial);
  assert.deepEqual(parsed.warnings, [
    "line 1: historySize: expected 0..1000000",
    "line 2: completionListLimit: expected 1..100000",
    "line 3: colour: expected true or false",
    "line 4: defaultScriptLang: expected thsh or bash",
  ]);
  assert.equal(parsed.prefs.historySize, 17);
  assert.equal(parsed.prefs.completionListLimit, 9);
  assert.equal(parsed.prefs.colour, initial.colour);
  assert.equal(parsed.prefs.defaultScriptLang, initial.defaultScriptLang);
  assert.equal(parsed.unknown.get("futureSetting") ?? null, "retained");
  const valid = parsePrefs("historySize=0\ncompletionListLimit=100000\ncolour=off\ndefaultScriptLang=bash", initial);
  assert.deepEqual(valid.warnings, []);
  assert.equal(valid.prefs.historySize, 0);
  assert.equal(valid.prefs.completionListLimit, 100000);
  assert.equal(valid.prefs.colour, false);
  assert.equal(valid.prefs.defaultScriptLang, "bash");
  assert.equal(initial.historySize, 17);
  assert.equal(initial.completionListLimit, 9);
});
const show = <T>(value: T): string => JSON.stringify(value, <V>(_key: string, item: V) => typeof item === "bigint" ? `${item}n` : item) ?? String(value);

test("TypeScript boot display preserves original terminal output", async () => {
  const fixture = await (await import("node:fs/promises")).readFile(new URL("./fixtures/boot-parity.json", import.meta.url), "utf8");
  const cases = parseJson(fixture) as Array<{ op: "start" | "update" | "tick" | "resize" | "finish"; args: number[]; sha256: string }>;
  let output = "";
  const renderer = new BootRenderer(text => { output += text; });
  for (const row of cases) {
    output = "";
    const a = row.args[0] ?? 0, b = row.args[1] ?? 0, c = row.args[2] ?? 0;
    switch (row.op) {
      case "start": renderer.start(a, b); break;
      case "update": renderer.update(a, b, c); break;
      case "tick": renderer.tick(); break;
      case "resize": renderer.resize(a, b); break;
      case "finish": renderer.finish(); break;
    }
    assert.equal(createHash("sha256").update(output).digest("hex"), row.sha256, row.op);
  }
});

test("mikuOS composes the actual canonical kernel objects", async () => {
  const r = new Rig();
  await r.os.ready;
  assert.equal(r.os.k.constructor, Kern);
  assert.equal(r.os.p.constructor, Proc);
  assert.equal(r.os.s.constructor, Sys);
  assert.equal(r.os.k.fs.constructor, Vfs);
});

test("canonical RV64 FCLASS distinguishes every IEEE-754 category", () => {
  const values: Array<[bigint, number, bigint]> = [
    [0xff800000n, 32, 1n], [0xbf800000n, 32, 2n],
    [0x80000001n, 32, 4n], [0x80000000n, 32, 8n],
    [0n, 32, 16n], [1n, 32, 32n],
    [0x3f800000n, 32, 64n], [0x7f800000n, 32, 128n],
    [0x7f800001n, 32, 256n], [0x7fc00000n, 32, 512n],
    [0xfff0000000000000n, 64, 1n], [0xbff0000000000000n, 64, 2n],
    [0x8000000000000001n, 64, 4n], [0x8000000000000000n, 64, 8n],
    [0n, 64, 16n], [1n, 64, 32n],
    [0x3ff0000000000000n, 64, 64n], [0x7ff0000000000000n, 64, 128n],
    [0x7ff0000000000001n, 64, 256n], [0x7ff8000000000000n, 64, 512n],
  ];
  for (const [raw, bits, category] of values) assert.equal(rv64FloatClass(raw, bits), category);
});

test("canonical RV64 word operations preserve 32-bit sign extension and legality", () => {
  const signed32 = (n: bigint): bigint => BigInt.asIntN(32, n);
  const unsigned32 = (n: bigint): bigint => BigInt.asUintN(32, n);
  const values = [-(1n << 63n), -2147483648n, -1n, 0n, 1n, 2147483647n, (1n << 63n) - 1n];
  for (const top of [0, 1, 0x20, 7]) for (let funct3 = 0; funct3 < 8; funct3++) {
    const valid = top === 1 ? [0, 4, 5, 6, 7].includes(funct3) :
      (funct3 === 0 || funct3 === 5) ? top === 0 || top === 0x20 : funct3 === 1 && top === 0;
    assert.equal(rv64RegisterWordValid(funct3, top), valid ? 1 : 0);
    if (!valid) continue;
    for (const left of values) for (const right of values) {
      const actual = rv64RegisterWordValue(funct3, top, left, right);
      assert.equal(actual, signed32(actual), "register word result is not sign-extended");
      const shift = unsigned32(right) & 31n;
      switch (true) {
case !!(top === 1 && funct3 === 0): { assert.equal(actual, signed32(signed32(left) * signed32(right)));
break; }
case !!(top !== 1 && funct3 === 0): { assert.equal(actual, signed32(top === 0 ? left + right : left - right));
break; }
case !!(top !== 1 && funct3 === 1): { assert.equal(actual, signed32(signed32(left) << shift));
break; }
case !!(top !== 1 && funct3 === 5): { assert.equal(actual, signed32(top === 0 ? unsigned32(left) >> shift : signed32(left) >> shift));
break; }
}
    }
  }
  for (const instruction of [0, -1, 0x40005013, 0x00001013, 0x00105013, 0x80000013]) {
    for (let funct3 = 0; funct3 < 8; funct3++) {
      const top = instruction >>> 25;
      const valid = funct3 === 0 || funct3 === 1 && top === 0 || funct3 === 5 && (top === 0 || top === 0x20);
      assert.equal(rv64ImmediateWordValid(funct3, instruction), valid ? 1 : 0);
      if (!valid) continue;
      for (const left of values) assert.equal(rv64ImmediateWordValue(funct3, instruction, left),
        signed32(rv64ImmediateWordValue(funct3, instruction, left)));
    }
  }
});

test("canonical RV64 immediate instructions preserve signed and unsigned values", () => {
  const signed = (n: bigint): bigint => BigInt.asIntN(64, n);
  const unsigned = (n: bigint): bigint => BigInt.asUintN(64, n);
  const values = [-(1n << 63n), -1n, 0n, 1n, (1n << 63n) - 1n];
  for (const instruction of [0, 0xffffffff, 0x40005013, 0x00001013, 0x00105013, 0x80000013, 0x40000013]) {
    for (let funct3 = 0; funct3 < 8; funct3++) {
      const top = instruction >>> 26;
      const valid = funct3 === 1 ? top === 0 : funct3 === 5 ? top === 0 || top === 0x10 : true;
      assert.equal(rv64ImmediateOpValid(funct3, instruction), valid ? 1 : 0);
      if (!valid) continue;
      const immediate = BigInt.asIntN(12, BigInt(instruction >>> 20));
      const shift = BigInt(instruction >>> 20 & 63);
      for (const left of values) {
        const actual = rv64ImmediateOpValue(funct3, instruction, left);
        assert.equal(actual, signed(actual), "immediate result not truncated to 64 bits");
        switch (true) {
case !!(funct3 === 0): { assert.equal(actual, signed(left + immediate));
break; }
case !!(funct3 === 1): { assert.equal(actual, signed(unsigned(left) << shift));
break; }
case !!(funct3 === 2): { assert.equal(actual, left < immediate ? 1n : 0n);
break; }
case !!(funct3 === 3): { assert.equal(actual, unsigned(left) < unsigned(immediate) ? 1n : 0n);
break; }
case !!(funct3 === 4): { assert.equal(actual, left ^ immediate);
break; }
case !!(funct3 === 5): { assert.equal(actual, signed(top === 0 ? unsigned(left) >> shift : left >> shift));
break; }
case !!(funct3 === 6): { assert.equal(actual, left | immediate);
break; }
case !!(funct3 === 7): { assert.equal(actual, left & immediate);
break; }
}
      }
    }
  }
});

test("canonical RV64 register operations preserve validity and 64-bit results", () => {
  const values = [-(1n << 63n), -(1n << 31n), -1n, 0n, 1n, 2n, (1n << 31n), (1n << 63n) - 1n];
  const signed = (n: bigint): bigint => BigInt.asIntN(64, n);
  const unsigned = (n: bigint): bigint => BigInt.asUintN(64, n);
  for (const top of [0, 1, 0x20, 2, 0xff]) for (let funct3 = 0; funct3 < 8; funct3++) {
    const valid = top === 0 || top === 1 || top === 0x20 && (funct3 === 0 || funct3 === 5);
    assert.equal(rv64RegisterValid(funct3, top), valid ? 1 : 0);
    if (!valid) continue;
    for (const left of values) for (const right of values) {
      const actual = rv64RegisterValue(funct3, top, left, right);
      assert.equal(actual, signed(actual), "register operation did not truncate to 64 bits");
      if (top !== 0 && top !== 0x20) continue;
      const shift = unsigned(right) & 63n;
      if (funct3 === 0) assert.equal(actual, signed(top === 0 ? left + right : left - right));
      if (funct3 === 1) assert.equal(actual, signed(unsigned(left) << shift));
      if (funct3 === 2) assert.equal(actual, left < right ? 1n : 0n);
      if (funct3 === 3) assert.equal(actual, unsigned(left) < unsigned(right) ? 1n : 0n);
      if (funct3 === 4) assert.equal(actual, left ^ right);
      if (funct3 === 5) assert.equal(actual, signed(top === 0 ? unsigned(left) >> shift : left >> shift));
      if (funct3 === 6) assert.equal(actual, left | right);
      if (funct3 === 7) assert.equal(actual, left & right);
    }
  }
});

test("canonical Thistle RV64 multiplication and M-extension division preserve edge cases", () => {
  const low = -(1n << 63n);
  const high = (1n << 63n) - 1n;
  const unsigned = (n: bigint): bigint => BigInt.asUintN(64, n);
  const signed = (n: bigint): bigint => BigInt.asIntN(64, n);
  const values = [low, low + 1n, -65537n, -2n, -1n, 0n, 1n, 2n, 65537n, high - 1n, high];
  for (const left of values) for (const right of values) {
    assert.equal(rv64MulHighUnsigned(unsigned(left), unsigned(right)),
      unsigned(unsigned(left) * unsigned(right) >> 64n));
    assert.equal(rv64MulHighSigned(left, right), signed(left * right >> 64n));
    assert.equal(rv64MulHighSignedUnsigned(left, unsigned(right)), signed(left * unsigned(right) >> 64n));
    for (const bits of [32, 64]) {
      const a = BigInt.asIntN(bits, left);
      const b = BigInt.asIntN(bits, right);
      const ua = BigInt.asUintN(bits, left);
      const ub = BigInt.asUintN(bits, right);
      const min = -(1n << BigInt(bits - 1));
      const divide = b === 0n ? -1n : a === min && b === -1n ? min : a / b;
      const remainder = b === 0n ? a : a === min && b === -1n ? 0n : a % b;
      assert.equal(rv64DivideSigned(left, right, bits), BigInt.asIntN(bits, divide));
      assert.equal(rv64RemainderSigned(left, right, bits), BigInt.asIntN(bits, remainder));
      assert.equal(rv64DivideUnsigned(unsigned(left), unsigned(right), bits),
        ub === 0n ? (1n << BigInt(bits)) - 1n : ua / ub);
      assert.equal(rv64RemainderUnsigned(unsigned(left), unsigned(right), bits),
        ub === 0n ? ua : ua % ub);
    }
  }
});

test("canonical RV64 immediate decoders retain Thistle's signed arithmetic", () => {
  const original = (value: number, width: number): number =>
    Number(BigInt.asIntN(width, BigInt(value)));
  let word = 0x12345678;
  const instructions = [0, -1, 0x80000000, 0x7fffffff, 0x000fffff, 0xfff00000, 0x00000800];
  for (let index = 0; index < 10000; index++) {
    word = Math.imul(word, 1664525) + 1013904223 | 0;
    instructions.push(word);
  }
  for (const instruction of instructions) {
    assert.equal(rv64ImmediateI(instruction), original(instruction >>> 20, 12));
    assert.equal(rv64ImmediateS(instruction), original((instruction >>> 25) << 5 | instruction >>> 7 & 31, 12));
    assert.equal(rv64ImmediateB(instruction), original((instruction >>> 31) << 12 | (instruction >>> 7 & 1) << 11 |
      (instruction >>> 25 & 63) << 5 | (instruction >>> 8 & 15) << 1, 13));
    assert.equal(rv64ImmediateU(instruction), original(instruction & 0xfffff000, 32));
    assert.equal(rv64ImmediateJ(instruction), original((instruction >>> 31) << 20 | (instruction >>> 12 & 255) << 12 |
      (instruction >>> 20 & 1) << 11 | (instruction >>> 21 & 1023) << 1, 21));
    assert.equal(rv64CompressedJump(instruction), original((instruction >>> 1 & 0x800) | (instruction << 2 & 0x400) |
      (instruction >>> 1 & 0x300) | (instruction << 1 & 0x80) | (instruction >>> 1 & 0x40) |
      (instruction << 3 & 0x20) | (instruction >>> 7 & 0x10) | (instruction >>> 2 & 0xe), 12));
  }
});

test("Thistle's shared RV64 branches preserve 64-bit signed and unsigned conditions", () => {
  const values = [
    -(1n << 63n), -2n, -1n, 0n, 1n, 2n, (1n << 63n) - 1n,
  ];
  for (const left of values) {
    for (const right of values) {
      const signedLess = left < right;
      const unsignedLess = BigInt.asUintN(64, left) < BigInt.asUintN(64, right);
      assert.equal(rv64Branch(0, left, right), Number(left === right));
      assert.equal(rv64Branch(1, left, right), Number(left !== right));
      assert.equal(rv64Branch(4, left, right), Number(signedLess));
      assert.equal(rv64Branch(5, left, right), Number(!signedLess));
      assert.equal(rv64Branch(6, left, right), Number(unsignedLess));
      assert.equal(rv64Branch(7, left, right), Number(!unsignedLess));
    }
  }
  for (const funct3 of [2, 3]) assert.equal(rv64Branch(funct3, 0n, 0n), -1);
});

test("thistle64 byte stores keep low bits above JS integer precision", () => {
  const m = new Mem64(1024n * 1024n, 65536);
  m.set8(0x10000n, 0x00bf762de49b5209n);
  assert.equal(m.u8(0x10000n), 9);
});

test("thistle64 scalar memory handles sparse and page-crossing values", () => {
  const m = new Mem64(1024n * 1024n, 8 * 65536);
  m.set32(0x10020n, 0x89abcdef); assert.equal(m.u32(0x10020n), 0x89abcdef);
  m.set64(0x10028n, 0xfedcba9876543210n); assert.equal(m.u64(0x10028n), 0xfedcba9876543210n);
  m.set16(0x1ffffn, 0xa1b2); assert.equal(m.u16(0x1ffffn), 0xa1b2);
  m.set32(0x2fffen, 0xc3d4e5f6); assert.equal(m.u32(0x2fffen), 0xc3d4e5f6);
  m.set64(0x3fffcn, 0x1020304050607080n); assert.equal(m.u64(0x3fffcn), 0x1020304050607080n);
  m.setF64(0x4fffcn, -12.5); assert.equal(m.f64(0x4fffcn), -12.5);
  m.setF32(0x60000n, -0); assert.ok(Object.is(m.f32(0x60000n), -0), "negative zero lost its sign");
});

test("thistle64 releases full pages and clears partial unmaps", () => {
  const m = new Mem64(1024n * 1024n, 4 * 65536);
  m.set32(0x10000n, 0x11223344); m.set32(0x20010n, 0x55667788);
  assert.equal(m.used, 2 * 65536);
  m.drop(0x10000n, 65536); assert.equal(m.used, 65536); assert.equal(m.u32(0x10000n), 0);
  m.drop(0x20011n, 2); assert.equal(m.used, 65536); assert.equal(m.u32(0x20010n), 0x55000088);
});

test("RV64 shared mappings flush on msync, munmap and exit", async () => {
  interface HFs { readFile(p: URL): Promise<Uint8Array>; }

  const fs = await hostModule("node:fs/promises") as HFs;
  const r = new Rig(), bin = new Uint8Array(await fs.readFile(new URL("../../assets/mmap-shared.thx", import.meta.url)));
  r.os.load("mmap-shared.thx", bin);
  const x = await r.run("/tmp/mmap-shared.thx");
  assert.equal(x.code, 0, x.err); assert.equal(x.err, "");
  const b = r.os.s.readb("/tmp/mmap-shared.out"), at = (n: number, s: string): void => assert.equal(dec(b.slice(n, n + s.length)), s);
  at(0, "flushed-at-exit"); at(4096, "flushed-by-msync"); at(8192, "flushed-by-munmap");
});

test(".thx and .39 are byte-identical header-selected THX aliases", async () => {
  interface HFs { readFile(path: URL): Promise<Uint8Array>; }

  const fs = await hostModule("node:fs/promises") as HFs;
  const [assetThx, asset39, webThx, web39] = await Promise.all([
    fs.readFile(new URL("../../assets/hello.thx", import.meta.url)),
    fs.readFile(new URL("../../assets/hello.39", import.meta.url)),
    fs.readFile(new URL("../../dist/web/assets/hello.thx", import.meta.url)),
    fs.readFile(new URL("../../dist/web/assets/hello.39", import.meta.url)),
  ]);
  const same = (a: Uint8Array, b: Uint8Array): boolean =>
    a.length === b.length && a.every((value, index) => value === (b[index] ?? null));
  assert.ok(same(assetThx, asset39), "generated .thx and .39 assets differ");
  assert.ok(same(assetThx, webThx) && same(asset39, web39), "static packaging changed THX alias bytes");
  assert.equal(dec(asset39.slice(0, 4)), "THX2");

  const r = new Rig(), s = r.os.s;
  const installedThx = s.readb("/usr/bin/hello.thx");
  const installed39 = s.readb("/usr/bin/hello.39");
  assert.ok(same(installedThx, installed39), "installed .thx and .39 aliases resolve to different bytes");
  assert.equal(s.stat("/usr/bin/hello.thx").mode, 0o755);
  assert.equal(s.stat("/usr/bin/hello.39").mode, 0o755);

  const thx = await r.run("/usr/bin/hello.thx");
  const thirtyNine = await r.run("/usr/bin/hello.39");
  assert.equal(`${thx.code}:${thx.out}:${thx.err}`, `${thirtyNine.code}:${thirtyNine.out}:${thirtyNine.err}`);
  assert.equal(thx.code, 0);

  s.writeb("/tmp/renamed.thx", installedThx); s.chmod("/tmp/renamed.thx", 0o755);
  let result = await r.run("mv /tmp/renamed.thx /tmp/renamed.39; /tmp/renamed.39");
  assert.equal(result.code, 0); assert.equal(result.out, thx.out);
  result = await r.run("mv /tmp/renamed.39 /tmp/renamed.thx; /tmp/renamed.thx");
  assert.equal(result.code, 0); assert.equal(result.out, thx.out);

  s.writeb("/tmp/no-extension", installedThx); s.chmod("/tmp/no-extension", 0o755);
  result = await r.run("/tmp/no-extension");
  assert.equal(result.code, 0, "a valid THX header depended on a filename extension");
  s.write("/tmp/not-thx.39", "not a THX executable\n", false, 0o755);
  s.chmod("/tmp/not-thx.39", 0o755);
  result = await r.run("/tmp/not-thx.39");
  assert.equal(result.code, 126, "the .39 suffix bypassed THX header validation");

  result = await r.run("ld -o /tmp/linked.39 /usr/share/thistle/examples/hello.to && /tmp/linked.39");
  assert.equal(result.code, 0); assert.equal(result.out, thx.out);
  const completion = r.os.complete("/usr/bin/hello.3");
  assert.equal(completion.line, "/usr/bin/hello.39 ");
  assert.equal(completion.list.join("\n"), "/usr/bin/hello.39");
});

test("thsh completion includes executable PATH entries and excludes nonexecutables", () => {
  const r = new Rig(), sys = r.os.s;
  sys.mkfile("/tmp/kittyprompt-test", "#!/bin/thsh\n", 0o755);
  sys.mkfile("/tmp/kittyprompt-private", "not executable", 0o644);
  sys.setenv("PATH", "/tmp:/bin");
  const hit = r.os.complete("kittyprompt-te");
  assert.equal(hit.line, "kittyprompt-test ");
  assert.equal(hit.list.join(","), "kittyprompt-test");
  assert.equal(r.os.complete("kittyprompt-private").list.length, 0,
    "non-executable files must not appear in completion");

  sys.setenv("PATH", "/bin");
  assert.equal(r.os.complete("kittyprompt-te").list.length, 0,
    "commands outside PATH must not be suggested");

  sys.setenv("PATH", "/tmp:/tmp:/bin");
  assert.equal(r.os.complete("kittyprompt-te").list.length, 1,
    "repeated PATH directories must not duplicate suggestions");
});

test("local session policy selects direct, prompted and named login safely", () => {
  const direct = localSessionPlan(DEFAULT_CONFIG);
  assert.equal(direct.kind, "direct");
  assert.equal(direct.account.name, "root");
  assert.equal(direct.command, null);

  const promptConfig = mergeConfig({ sessions: { local: { mode: "login" } } });
  const prompt = localSessionPlan(promptConfig);
  assert.equal(prompt.kind, "login");
  assert.equal(prompt.account.cred.uid, 0);
  assert.equal(prompt.command, "/bin/login");

  const selected = localSessionPlan(mergeConfig({
    sessions: { local: { mode: "login", account: "alice" } },
  }));
  assert.equal(selected.command, "/bin/login alice");

  const unsafe = localSessionPlan(mergeConfig({
    sessions: { local: { mode: "login", account: "root; reboot" } },
  }));
  assert.equal(unsafe.command, "/bin/login", "unsafe selected account reached the shell command");

  let rejected = false;
  try {
    localSessionPlan(mergeConfig({
      accounts: { cli: { cred: { uid: 1000 } } },
      sessions: { local: { mode: "login" } },
    }));
  } catch (caughtValue) { const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
    rejected = error instanceof Error && error.message.includes("UID 0");
  }
  assert.ok(rejected, "login mode accepted a non-root supervisor account");
});

test("supervised session commands do not enter root shell history", async () => {
  const r = new Rig();
  const before = r.os.sh.hist.join("\n");
  const result = await r.os.run("echo supervised", [], false);
  assert.equal(result, 0);
  assert.equal(r.os.sh.hist.join("\n"), before);
});

test("local login supervision restarts sessions and stops on a missing binary", async () => {
  const plan = localSessionPlan(mergeConfig({
    sessions: { local: { mode: "login", account: "alice" } },
  }));
  const results = [1, 0, 127];
  const commands: string[] = [];
  let unavailable = 0;

  await superviseLocalLogin(plan, {
    live: () => results.length > 0,
    run: async command => {
      commands.push(command);
      return requireValue(results.shift() ?? null, "src/test/all.ts:1954");
    },
    unavailable: () => { unavailable++; },
  });

  assert.equal(commands.join("\n"), "/bin/login alice\n/bin/login alice\n/bin/login alice");
  assert.equal(unavailable, 1);
});

test("canonical mikuOS release metadata stays aligned", async () => {
  interface HFs { readFile(path: URL, encoding: "utf8"): Promise<string>; }

  const fs = await hostModule("node:fs/promises") as HFs;
  const root = new URL("../../", import.meta.url);
  const [packageText, configText, manifest, page, ignore, mikuosEntry, thistleEntry] = await Promise.all([
    fs.readFile(new URL("package.json", root), "utf8"),
    fs.readFile(new URL("mikuos.config.json", root), "utf8"),
    fs.readFile(new URL("mikuos.yaml", root), "utf8"),
    fs.readFile(new URL("index.html", root), "utf8"),
    fs.readFile(new URL(".gitignore", root), "utf8"),
    fs.readFile(new URL("mikuos.ts", root), "utf8"),
    fs.readFile(new URL("thistle.ts", root), "utf8"),
  ]);
  const pkg = parseJson(packageText) as { name: string | null; version: string | null; scripts: Record<string, string> | null };
  const fileConfig = parseJson(configText) as { os: { version: string | null } | null; kernel: { version: string | null } | null };
  const loaded = await hostConfig(new URL("mikuos.config.json", root));

  assert.equal(pkg.name, "mikuos");
  assert.equal(pkg.version, "0.3.0");
  assert.equal((withValue(pkg.scripts ?? null, value => (value["test:toolchain"] ?? null)) ?? null), "bun run thistlecc/test/test.ts");
  assert.ok((withValue(withValue(pkg.scripts ?? null, value => (value["test:guest-toolchain"] ?? null)) ?? null, value => value.includes("src/test/toolchain.ts")) ?? null));
  assert.equal(withValue(fileConfig.os ?? null, value => value.version), "0.3");
  assert.equal(withValue(fileConfig.kernel ?? null, value => value.version), CANONICAL_CONFIG.kernel.version);
  assert.equal(loaded.os.prettyName, "初音ミクOS v｡三");
  assert.equal(loaded.kernel.machine, "Thistle64 RV64GC");
  assert.equal(sourceReleaseName(), `mikuos-0.3.0-thistle-${CANONICAL_CONFIG.kernel.version}-source.tar.gz`);
  assert.ok(manifest.includes("name: mikuOS"));
  assert.ok(manifest.includes("release: 0.3.0"));
  assert.ok(manifest.includes("release: " + CANONICAL_CONFIG.kernel.version));
  assert.ok(manifest.includes("build_policy: host-only-thistlecc"));
  assert.ok(page.includes("<title>初音ミクOS v｡三</title>"));
  assert.ok(!ignore.split(/\r?\n/).includes("ports/"), "native source tree is broadly ignored");
  assert.ok(ignore.includes("ports/**/*.o"), "reproducible native objects are not ignored");
  assert.ok(mikuosEntry.includes('import "./src/main/cli.ts"'));
  assert.ok(thistleEntry.includes('import "./src/main/cli.ts"'));
});

test("Unicode Art Studio logo source is trimmed without losing its visible edges", async () => {
  const fs = (globalThis as typeof globalThis & {
    process: { getBuiltinModule(name: string): { promises: {
      readFile(path: URL, encoding: "utf8"): Promise<string>
    } } }
  }).process.getBuiltinModule("fs").promises;
  const original = await fs.readFile(new URL("../../src/boot/logo.txt", import.meta.url), "utf8");
  const rows = original.trimEnd().split(/\r?\n/).map(line =>
    line.replace(/<@?#(?:[A-Fa-f0-9]{6}|default)>/g, ""));
  assert.equal(rows.length, 12, "The Unicode export must not contain blank top/bottom rows");
  const ink = (glyph: string): boolean => glyph !== "⠀" && glyph !== " ";
  for (const row of rows) assert.equal([...row].length, 71,
    "The Unicode export must not retain empty left/right columns");
  assert.ok([...requireValue(rows[0] ?? null, "src/test/all.ts:2014")].some(ink));
  assert.ok([...requireValue(rows.at(-1) ?? null, "src/test/all.ts:2015")].some(ink));
  assert.ok(rows.some(row => ink(requireValue([...row][0] ?? null, "src/test/all.ts:2016"))));
  assert.ok(rows.some(row => ink(requireValue([...row].at(-1) ?? null, "src/test/all.ts:2017"))));
});

test("exec replaces the current image without replacing the process", async () => {
  const r = new Rig();

  r.os.k.install(new FnApp(
    "exec-target",
    "exec replacement target",
    "exec-target",
    async (s, a) => {
      await s.out([
        s.pid,
        s.ruid,
        s.euid,
        s.rgid,
        s.egid,
        s.cwd,
        s.env("EXEC_MARK"),
        a.join(","),
        s.p.fds.has(3),
        s.p.fds.has(4),
      ].join(":") + "\n");

      return 0;
    },
  ));

  r.os.k.install(new FnApp(
    "exec-source",
    "exec replacement source",
    "exec-source",
    async s => {
      const kept = s.open("/tmp/exec-kept", "w");
      const closed = s.open("/tmp/exec-closed", "w");

      assert.equal(kept, 3);
      assert.equal(closed, 4);

      requireValue(s.p.fds.get(closed) ?? null, "src/test/all.ts:2308").clo = true;
      s.cd("/tmp");
      s.setGroups([1000, 1000, 1003]);
      s.setResgid(1000, 1000, 1000);
      s.setResuid(1000, 1000, 1000);

      const env = new Map(s.env() as Map<string, string>);
      env.set("EXEC_MARK", "present");

      await s.exec(
        "/bin/exec-target",
        ["exec-target", "one", "two"],
        env,
      );

      return 0;
    },
  ));

  const child = r.os.s.start("exec-source", []);
  const pid = child.pid;

  assert.equal(await r.os.s.wait(pid), 0);
  assert.equal(
    r.out,
    `${pid}:1000:1000:1000:1000:/tmp:present:one,two:true:false\n`,
  );
  assert.equal(child.pid, pid);
  assert.equal(child.cmd, "/bin/exec-target");
  assert.equal(child.argv.join(","), "exec-target,one,two");
});

test("process credentials preserve real, effective and saved identities", async () => {
  const r = new Rig();
  r.os.s.write("/tmp/effective-root", "secret\n", false, 0o600);
  r.os.s.p.cred = {"uid": 0, "gid": 0, ruid: 1000,
    euid: 0,
    suid: 0,
    rgid: 1000,
    egid: 0,
    sgid: 0,
    groups: [1000, 20],
  };
  r.os.s.p.fsuid = 0;
  r.os.s.p.fsgid = 0;
  assert.equal(r.os.s.ruid, 1000);
  assert.equal(r.os.s.euid, 0);
  assert.equal(r.os.s.suid, 0);
  assert.equal(r.os.s.rgid, 1000);
  assert.equal(r.os.s.egid, 0);
  assert.equal(r.os.s.sgid, 0);
  assert.equal(r.os.s.read("/tmp/effective-root"), "secret\n", "filesystem ignored effective root identity");

  const child = r.os.s.start("true", []);
  assert.equal(child.cred.ruid, 1000);
  assert.equal(child.cred.euid, 0);
  assert.equal(child.cred.suid, 0);
  assert.equal(child.cred.rgid, 1000);
  assert.equal(child.cred.egid, 0);
  assert.equal(child.cred.sgid, 0);
  r.os.s.p.cred.groups.push(99);
  assert.ok(!child.cred.groups.includes(99), "child shared its parent's supplementary group array");
  assert.equal(await r.os.s.wait(child.pid), 0);

  r.os.s.p.cred.euid = 1000;
  r.os.s.p.cred.egid = 1000;
  r.os.s.p.fsuid = 1000;
  r.os.s.p.fsgid = 1000;
  let denied = false;
  try { r.os.s.read("/tmp/effective-root"); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EACCES"; }
  assert.ok(denied, "filesystem used the real or saved root identity instead of the effective identity");
});

test("identity transitions enforce saved-ID and group rules atomically", async () => {
  const r = new Rig(), s = r.os.s;
  s.write("/tmp/root-only", "root\n", false, 0o600);
  s.setResgid(1000, 0, 0);
  s.setResuid(1000, 0, 0);
  assert.equal(s.ruid, 1000); assert.equal(s.euid, 0); assert.equal(s.suid, 0);
  assert.equal(s.rgid, 1000); assert.equal(s.egid, 0); assert.equal(s.sgid, 0);

  s.setGroups([0, 20, 1000]);
  assert.equal(s.groups.join(","), "0,20,1000");
  const exposed = s.groups; exposed.push(99);
  assert.ok(!s.groups.includes(99), "supplementary groups escaped by reference");

  s.setResuid(null, 1000, null);
  assert.equal(s.euid, 1000); assert.equal(s.suid, 0);
  let denied = false;
  try { s.setGroups([1000]); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EPERM"; }
  assert.ok(denied, "non-root process replaced supplementary groups");
  const before = JSON.stringify(s.p.cred);
  denied = false;
  try { s.setResuid(null, 2000, null); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EPERM"; }
  assert.ok(denied, "non-root process selected an unrelated effective uid");
  assert.equal(JSON.stringify(s.p.cred), before, "forbidden transition changed credentials");
  s.setResuid(null, 0, null);
  assert.equal(s.euid, 0, "saved uid could not restore effective root");

  assert.equal(s.setFsuid(1000), 0);
  denied = false;
  try { s.read("/tmp/root-only"); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EACCES"; }
  assert.ok(denied, "fsuid did not constrain filesystem access");
  assert.equal(s.setFsuid(0), 1000);
  assert.equal(s.read("/tmp/root-only"), "root\n");

  const temporary = new Rig().os.s;
  temporary.setResuid(1000, 0, 0);
  temporary.setReuid(null, 1000);
  assert.equal(temporary.suid, 0, "temporary effective drop destroyed the saved uid");
  temporary.setReuid(null, 0);
  assert.equal(temporary.euid, 0, "setreuid could not restore the saved uid");
  temporary.setReuid(1000, 1000);
  assert.equal(temporary.suid, 1000, "real-id change did not commit the saved uid");
  denied = false;
  try { temporary.setReuid(null, 0); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EPERM"; }
  assert.ok(denied, "permanently dropped uid was restored");

  const permanent = new Rig().os.s;
  permanent.setGid(1000);
  permanent.setUid(1000);
  assert.equal(`${permanent.ruid}:${permanent.euid}:${permanent.suid}`, "1000:1000:1000");
  assert.equal(`${permanent.rgid}:${permanent.egid}:${permanent.sgid}`, "1000:1000:1000");
  denied = false;
  try { permanent.setUid(0); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EPERM"; }
  assert.ok(denied, "permanent setuid drop was reversible");
});

test("RV64 identity syscall numbers and pointer checks match the Linux ABI", async () => {
  interface RvHarness {
    readonly x: BigInt64Array;
    m: Mem64;
    floor: bigint;
    brk: bigint;
    stackAt: bigint;
    call(number: number): Promise<bigint>;
  }
  const r = new Rig(), s = r.os.s;
  const vm = new Rv64(s) as object as RvHarness;
  vm.m = new Mem64(1024n * 1024n, 4 * 65536);
  vm.floor = 0x10000n; vm.brk = 0x20000n; vm.stackAt = 0xf0000n;

  vm.x[10] = 1000n; vm.x[11] = 0n; vm.x[12] = 0n;
  assert.equal(await vm.call(147), 0n);
  assert.equal(await vm.call(174), 1000n);
  assert.equal(await vm.call(175), 0n);

  vm.x[10] = 0x10000n; vm.x[11] = 0x10004n; vm.x[12] = 0x10008n;
  assert.equal(await vm.call(148), 0n);
  assert.equal(vm.m.u32(0x10000n), 1000); assert.equal(vm.m.u32(0x10004n), 0); assert.equal(vm.m.u32(0x10008n), 0);

  vm.m.set32(0x10000n, 0x12345678);
  vm.x[10] = 0x10000n; vm.x[11] = 0n; vm.x[12] = 0x10008n;
  let fault = false;
  try { await vm.call(148); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  fault = e instanceof KErr && e.code === "EFAULT"; }
  assert.ok(fault, "getresuid accepted a null result pointer");
  assert.equal(vm.m.u32(0x10000n), 0x12345678, "getresuid partially wrote before pointer validation");

  s.setGroups([7, 8]);
  vm.x[10] = 0n; vm.x[11] = 0n;
  assert.equal(await vm.call(158), 2n);
  vm.x[10] = 2n; vm.x[11] = 0x10100n;
  assert.equal(await vm.call(158), 2n);
  assert.equal(vm.m.u32(0x10100n), 7); assert.equal(vm.m.u32(0x10104n), 8);
  vm.m.set32(0x10110n, 20); vm.m.set32(0x10114n, 30);
  vm.x[10] = 2n; vm.x[11] = 0x10110n;
  assert.equal(await vm.call(159), 0n);
  assert.equal(s.groups.join(","), "20,30");

  s.write("/tmp/high-owner", "ownership\n");
  vm.m.write(0x10120n, enc("/tmp/high-owner\0"));
  vm.x[10] = -100n; vm.x[11] = 0x10120n;
  vm.x[12] = 0xfffffffen; vm.x[13] = 0xfffffffdn; vm.x[14] = 0n;
  assert.equal(await vm.call(54), 0n);
  assert.equal(s.stat("/tmp/high-owner").uid, 0xfffffffe);
  assert.equal(s.stat("/tmp/high-owner").gid, 0xfffffffd);

  const highOwner = s.open("/tmp/high-owner", "r+");
  vm.x[10] = BigInt(highOwner); vm.x[11] = 0xfffffffdn; vm.x[12] = 0xfffffffen;
  assert.equal(await vm.call(55), 0n);
  s.close(highOwner);
  assert.equal(s.stat("/tmp/high-owner").uid, 0xfffffffd);
  assert.equal(s.stat("/tmp/high-owner").gid, 0xfffffffe);

  vm.x[10] = -100n; vm.x[11] = 0x10120n;
  vm.x[12] = 0xffffffffn; vm.x[13] = 1n; vm.x[14] = 0n;
  let invalidOwner = false;
  try { await vm.call(54); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  invalidOwner = e instanceof KErr && e.code === "EINVAL"; }
  assert.ok(invalidOwner, "fchownat accepted the reserved all-ones uid");
  assert.equal(s.stat("/tmp/high-owner").uid, 0xfffffffd, "rejected fchownat changed ownership");

  vm.m.set32(0x10200n, 0); vm.m.set16(0x10204n, 0); vm.m.set16(0x10206n, 0xffff);
  vm.x[10] = 0x10200n; vm.x[11] = 1n; vm.x[12] = 0x10300n; vm.x[13] = 0n; vm.x[14] = 0n;
  assert.equal(await vm.call(73), 0n); assert.equal(vm.m.u16(0x10206n), 0, "ppoll rejected a valid standard descriptor");
  vm.m.set32(0x10200n, 99);
  assert.equal(await vm.call(73), 1n); assert.equal(vm.m.u16(0x10206n), 0x20, "ppoll did not mark an invalid descriptor");

  vm.x[10] = BigInt(s.pid); vm.x[11] = 0n;
  assert.equal(await vm.call(129), 1n, "RV64 kill(pid, 0) did not probe a live process");
  assert.ok(!s.p.ac.signal.aborted, "RV64 signal-zero probe delivered a signal");
});

test("RV64 renameat2 supports transactional replacement semantics", async () => {
  interface RvRenameHarness {
    readonly x: BigInt64Array;
    m: Mem64;
    floor: bigint;
    brk: bigint;
    stackAt: bigint;
    call(number: number): Promise<bigint>;
  }

  const r = new Rig();
  const s = r.os.s;
  const vm = new Rv64(s) as object as RvRenameHarness;

  vm.m = new Mem64(1024n * 1024n, 4 * 65536);
  vm.floor = 0x10000n;
  vm.brk = 0x20000n;
  vm.stackAt = 0xf0000n;

  s.write("/tmp/renameat2-source", "renamed\n");

  vm.m.write(
    0x10000n,
    enc("/tmp/renameat2-source\0"),
  );

  vm.m.write(
    0x10100n,
    enc("/tmp/renameat2-target\0"),
  );

  vm.x[10] = -100n;
  vm.x[11] = 0x10000n;
  vm.x[12] = -100n;
  vm.x[13] = 0x10100n;
  vm.x[14] = 0n;

  assert.equal(await vm.call(276), 0n);
  assert.equal(s.read("/tmp/renameat2-target"), "renamed\n");

  let oldMissing = false;

  try {
    s.stat("/tmp/renameat2-source");
  } catch (caughtValue) { const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
    oldMissing =
      error instanceof KErr &&
      error.code === "ENOENT";
  }

  assert.ok(
    oldMissing,
    "renameat2 left its old path behind",
  );

  s.write("/tmp/renameat2-source", "source\n");
  s.write("/tmp/renameat2-existing", "existing\n");

  vm.m.write(
    0x10200n,
    enc("/tmp/renameat2-existing\0"),
  );

  vm.x[10] = -100n;
  vm.x[11] = 0x10000n;
  vm.x[12] = -100n;
  vm.x[13] = 0x10200n;
  vm.x[14] = 1n;

  let noReplace = false;

  try {
    await vm.call(276);
  } catch (caughtValue) { const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
    noReplace =
      error instanceof KErr &&
      error.code === "EEXIST";
  }

  assert.ok(
    noReplace,
    "RENAME_NOREPLACE replaced an existing target",
  );

  assert.equal(s.read("/tmp/renameat2-source"), "source\n");
  assert.equal(s.read("/tmp/renameat2-existing"), "existing\n");

  vm.x[14] = 2n;

  let unsupported = false;

  try {
    await vm.call(276);
  } catch (caughtValue) { const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
    unsupported =
      error instanceof KErr &&
      error.code === "EINVAL";
  }

  assert.ok(
    unsupported,
    "renameat2 accepted unsupported exchange semantics",
  );
});

test("identity commands distinguish real and effective users", async () => {
  const r = new Rig();
  r.os.s.setResgid(1000, 0, 0);
  r.os.s.setResuid(1000, 0, 0);
  const x = await r.run("id; whoami");
  assert.equal(x.code, 0); assert.equal(x.err, "");
  assert.ok(x.out.includes("uid=1000(guest) euid=0(root)"));
  assert.ok(x.out.includes("gid=1000(users) egid=0(root)"));
  assert.ok(x.out.endsWith("root\n"), "whoami did not report the effective user");
});

test("set-ID execution applies saved IDs only on suid mounts", async () => {
  const r = new Rig(null, true), s = r.os.s, native = s.readb("/usr/bin/hello.txe");
  const install = (path: string, uid: number, gid: number, mode: number): void => {
    s.writeb(path, native); s.chown(path, uid, gid); s.chmod(path, mode);
  };

  install("/tmp/setid.txe", 0, 20, 0o6755);
  install("/tmp/plain.txe", 0, 0, 0o0755);
  s.write("/tmp/setid-script", "#!/bin/thsh\nexit 0\n");
  s.chown("/tmp/setid-script", 0, 0); s.chmod("/tmp/setid-script", 0o4755);
  install("/tmp/guest-write.txe", 0, 0, 0o4777);

  const x = await r.run("ls -l /tmp/setid.txe");
  assert.ok(x.out.includes("-rwsr-sr-x"), "ls did not display set-user-ID and set-group-ID bits");

  install("/tmp/write-clear.txe", 0, 0, 0o6755);
  s.writeb("/tmp/write-clear.txe", native);
  assert.equal(s.stat("/tmp/write-clear.txe").mode, 0o0755, "content write retained set-ID bits");
  s.chmod("/tmp/write-clear.txe", 0o6755);
  const fd = s.open("/tmp/write-clear.txe", "r+"); s.fdw(fd, native.subarray(0, 8)); s.close(fd);
  assert.equal(s.stat("/tmp/write-clear.txe").mode, 0o0755, "descriptor write retained set-ID bits");
  s.chmod("/tmp/write-clear.txe", 0o6755); s.chown("/tmp/write-clear.txe", 0, 0);
  assert.equal(s.stat("/tmp/write-clear.txe").mode, 0o0755, "ownership change retained set-ID bits");

  s.setGroups([1000]);
  s.setResgid(1000, 1000, 1000);
  s.setResuid(1000, 1000, 1000);
  assert.ok((requireValue(withValue((r.os.k.mounts()[0] ?? null) ?? null, value => value.opt) ?? null, "src/test/all.ts:2654").includes("suid") ?? null));

  const plain = s.start("/tmp/plain.txe", []);
  assert.equal(`${plain.cred.ruid}:${plain.cred.euid}:${plain.cred.suid}`, "1000:1000:1000");
  assert.equal(await s.wait(plain.pid), 0);

  const elevated = s.start("/tmp/setid.txe", []);
  assert.equal(`${elevated.cred.ruid}:${elevated.cred.euid}:${elevated.cred.suid}`, "1000:0:0");
  assert.equal(`${elevated.cred.rgid}:${elevated.cred.egid}:${elevated.cred.sgid}`, "1000:20:20");
  const elevatedSys = new Sys(r.os.k, elevated);
  elevatedSys.setResuid(null, 1000, null);
  assert.equal(elevatedSys.euid, 1000); assert.equal(elevatedSys.suid, 0);
  elevatedSys.setResuid(null, 0, null);
  assert.equal(elevatedSys.euid, 0, "set-ID child could not restore its saved uid");
  assert.equal(await s.wait(elevated.pid), 0);
  assert.equal(`${s.ruid}:${s.euid}:${s.suid}`, "1000:1000:1000", "set-ID execution changed the parent");

  let denied = false;
  try { s.start("/tmp/setid-script", []); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EACCES"; }
  assert.ok(denied, "set-ID script was accepted on a suid mount");

  s.writeb("/tmp/user-owned.txe", native); s.chmod("/tmp/user-owned.txe", 0o4755);
  denied = false;
  try { s.chown("/tmp/user-owned.txe", 0, 0); } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  denied = e instanceof KErr && e.code === "EPERM"; }
  assert.ok(denied, "non-root process created a root-owned executable");
  const harmless = s.start("/tmp/user-owned.txe", []);
  assert.equal(harmless.cred.euid, 1000, "user-owned set-ID file gained another identity");
  assert.equal(await s.wait(harmless.pid), 0);

  s.writeb("/tmp/guest-write.txe", native);
  assert.equal(s.stat("/tmp/guest-write.txe").mode, 0o0777, "unprivileged write retained root set-ID bit");
});

test("nosuid execution ignores file privilege bits", async () => {
  const r = new Rig(), s = r.os.s, native = s.readb("/usr/bin/hello.txe");
  s.writeb("/tmp/nosuid.txe", native); s.chown("/tmp/nosuid.txe", 0, 20); s.chmod("/tmp/nosuid.txe", 0o6755);
  s.setGroups([1000]); s.setResgid(1000, 1000, 1000); s.setResuid(1000, 1000, 1000);
  assert.ok((requireValue(withValue((r.os.k.mounts()[0] ?? null) ?? null, value => value.opt) ?? null, "src/test/all.ts:2691").includes("nosuid") ?? null));
  const child = s.start("/tmp/nosuid.txe", []);
  assert.equal(`${child.cred.ruid}:${child.cred.euid}:${child.cred.suid}`, "1000:1000:1000");
  assert.equal(`${child.cred.rgid}:${child.cred.egid}:${child.cred.sgid}`, "1000:1000:1000");
  assert.equal(await s.wait(child.pid), 0);
});

test("boot image and init", async () => {
  const r = new Rig();
  assert.equal(withValue((r.os.k.ps()[0] ?? null) ?? null, value => value.pid), 1);
  assert.equal(r.os.s.read("/etc/hostname"), "mikuos\n");
  const release = r.os.s.read("/etc/os-release");
  assert.ok(release.includes('NAME="mikuOS"'));
  assert.ok(release.includes('PRETTY_NAME="初音ミクOS v｡三"'));
  assert.ok(release.includes('VERSION="v0.3"'));
  assert.ok(release.includes('VERSION_ID="0.3"'));
  assert.ok(release.includes('KERNEL_NAME=Thistle'));
  assert.ok(release.includes('KERNEL_VERSION=' + CANONICAL_CONFIG.kernel.version));
  assert.ok(release.includes('KERNEL_SOURCE=Thistle'));
  assert.ok(r.os.s.read("/etc/motd").includes("mikuOS v0.3"));
  assert.ok(r.os.s.apps().length >= 50, "core userland is incomplete");
  assert.equal(r.os.s.stat("/bin/thsh").mode, 0o755);
  assert.equal(r.os.s.stat("/usr/libexec/mikuos/builtin/thsh").mode, 0o755);
  const builtins = parseJson(r.os.s.read("/usr/share/mikuos/builtin-commands.json")) as {
    schema: number;
    commands: Array<{ name: string; activePath: string; rescuePath: string }>;
  };
  assert.equal(builtins.schema, 1);
  assert.equal(builtins.commands.length, r.os.s.apps().length);
  assert.ok(builtins.commands.some(command =>
    command.name === "true" &&
    command.activePath === "/bin/true" &&
    command.rescuePath === "/usr/libexec/mikuos/builtin/true"
  ));
  const compiler = parseJson(r.os.s.read("/usr/share/mikuos/compiler-infrastructure.json")) as {
    schema: number;
    integration: Array<{ path: string }>;
  };
  assert.equal(compiler.schema, 1);
  assert.ok(compiler.integration.some(component => component.path === "/usr/libexec/thistle/thx-cc"));
  const uname = await r.run("uname -s; uname -r");
  assert.equal(uname.code, 0);
  assert.equal(uname.out, `Thistle\n${CANONICAL_CONFIG.kernel.version}\n`);
  assert.ok(r.os.s.read("/proc/version").startsWith(`Thistle version ${CANONICAL_CONFIG.kernel.version} `));
  const bootManifest = r.os.s.read("/boot/mikuos.yaml");
  assert.equal(bootManifest, r.os.s.read("/boot/thistle.yaml"));
  assert.ok(bootManifest.includes("os_name: mikuOS"));
  assert.ok(bootManifest.includes("os_release: v0.3"));
  assert.ok(bootManifest.includes("kernel_source: Thistle"));
  assert.ok(bootManifest.includes("host_compiler: thistlecc"));
});

test("every built-in rescue command has a runnable help path", async () => {
  const r = new Rig();
  for (const a of r.os.s.apps()) {
    const path = `/usr/libexec/mikuos/builtin/${a.name}`;
    const x = await r.run(`${path} --help`);
    assert.equal(x.code, 0, `${path} --help failed`);
    assert.equal(x.err, "", `${path} --help wrote an error`);
    assert.ok(x.out.startsWith("usage:"), `${path} has no usage text`);
  }
});

test("inode data, links and permissions", () => {
  const r = new Rig();
  r.os.s.mkdir("/tmp/fs");
  r.os.s.write("/tmp/fs/a", "one");
  r.os.s.link("/tmp/fs/a", "/tmp/fs/b");
  r.os.s.write("/tmp/fs/b", "two");
  assert.equal(r.os.s.read("/tmp/fs/a"), "two");
  r.os.s.symlink("a", "/tmp/fs/c");
  assert.equal(r.os.s.read("/tmp/fs/c"), "two");
  assert.equal(r.os.s.stat("/tmp/fs/a").nlink, 2);
  r.os.s.chmod("/tmp/fs/a", 0o600);
  let e: Error | null = null;
  try { r.os.k.fs.read("/tmp/fs/a", "/", {uid: 1000, gid: 1000, groups: [1000] }); } catch (caughtValue) { const x = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  e = x; }
  assert.ok(e instanceof KErr && e.code === "EACCES", "guest bypassed mode bits");
  const g = { uid: 1000, gid: 1000, ruid: 1000, euid: 1000, suid: 1000, rgid: 1000, egid: 1000, sgid: 1000, groups: [1000] };
  r.os.k.fs.write("/home/guest/own", "mine", "/", g);
  assert.equal(r.os.k.fs.stat("/home/guest/own", "/", g).uid, 1000);
});

test("descriptor offsets and append", () => {
  const r = new Rig();
  r.os.s.write("/tmp/fd", "abcdef");
  const fd = r.os.s.open("/tmp/fd", "r+");
  assert.equal(dec(r.os.s.fdr(fd, 2)), "ab");
  r.os.s.seek(fd, 3);
  r.os.s.fdw(fd, enc("XY"));
  r.os.s.close(fd);
  assert.equal(r.os.s.read("/tmp/fd"), "abcXYf");
  const ap = r.os.s.open("/tmp/fd", "a");
  r.os.s.fdw(ap, enc("!"));
  r.os.s.close(ap);
  assert.equal(r.os.s.read("/tmp/fd"), "abcXYf!");
});

test("the complete root survives a fresh boot", async () => {
  const tree = new MemTree(), quiet = { put: () => {}, tree };
  const a = boot(quiet, null);
  await a.ready;
  a.s.mkdir("/var/persistence-test"); a.s.write("/var/persistence-test/main.c", "int main(void) { return 7; }\n");
  a.s.link("/var/persistence-test/main.c", "/var/persistence-test/copy.c"); a.s.chmod("/var/persistence-test/main.c", 0o640);
  a.s.write("/made-at-root", "persistent\n");
  a.s.write("/etc/motd", "locally replaced\n"); a.s.chmod("/etc/motd", 0o640); a.s.chown("/etc/motd", 1000, 1000);
  a.s.rm("/etc/issue");
  await a.flush();
  assert.ok(tree.ent && tree.ent.some(x => x.p === "/var/persistence-test/main.c" && x.data), "host tree did not receive /var/persistence-test/main.c");
  assert.ok(withValue(tree.ent ?? null, value => value.some(x => x.p === "/made-at-root")), "host tree did not receive a file created under /");
  assert.ok(!withValue(tree.ent ?? null, value => value.some(x => x.p === "/etc/issue")), "deleting a system file was not persisted");
  assert.ok(!withValue(tree.ent ?? null, value => value.some(x => x.p === "/dev" || x.p.startsWith("/dev/") || x.p === "/proc" || x.p.startsWith("/proc/"))), "live mounts leaked into persistent storage");

  const b = boot(quiet, null);
  await b.ready;
  assert.equal(b.s.read("/var/persistence-test/copy.c"), "int main(void) { return 7; }\n");
  assert.equal(b.s.read("/made-at-root"), "persistent\n");
  assert.equal(b.s.read("/etc/motd"), "locally replaced\n"); assert.equal(b.s.stat("/etc/motd").mode, 0o640); assert.equal(b.s.stat("/etc/motd").uid, 1000);
  assert.equal(b.s.stat("/var/persistence-test/main.c").nlink, 2); assert.equal(b.s.stat("/var/persistence-test/main.c").mode, 0o640);
  let gone = false; try { b.s.stat("/etc/issue"); } catch { gone = true; }
  assert.ok(gone, "the base image resurrected a deleted system file");
  assert.equal(b.s.stat("/dev/null").kind, "char", "restoring / removed devfs");
  assert.ok(b.s.read("/proc/mounts").includes("hostfs / thistlefs rw"), "persistent / is absent from /proc/mounts");
});

test("versioned image migration changes stock identity but preserves local identity", async () => {
  const tree = new MemTree(), quiet = { put: () => {}, tree }, a = boot(quiet, null);
  await a.ready;
  const issue = (withValue(tree.ent ?? null, value => (value.find(x => x.p === "/etc/issue") ?? null)) ?? null);
  const release = (withValue(tree.ent ?? null, value => (value.find(x => x.p === "/etc/os-release") ?? null)) ?? null);
  const motd = (withValue(tree.ent ?? null, value => (value.find(x => x.p === "/etc/motd") ?? null)) ?? null);
  assert.ok(withValue(issue ?? null, value => value.data) && withValue(release ?? null, value => value.data) && withValue(motd ?? null, value => value.data), "identity files were not persisted");
  requireValue(issue ?? null, "src/test/all.ts:2822").data = enc("Thistle OS 2.0.0 \\n \\l\n");
  requireValue(release ?? null, "src/test/all.ts:2823").data = enc("locally branded\n");
  requireValue(motd ?? null, "src/test/all.ts:2824").data = enc("Welcome to Thistle 2.0.0, the 64-bit TypeScript Unix-like system.\nRun 'hello.txe' for Thistle64, 'hello32.txe' for compatibility, or 'help'.\n");
  tree.imageVersion = 0;

  const b = boot(quiet, null);
  await b.ready;
  assert.equal(b.s.read("/etc/issue"), DEFAULT_CONFIG.messages.issue);
  assert.equal(b.s.read("/etc/os-release"), "locally branded\n");
  assert.equal(b.s.read("/etc/motd"), DEFAULT_CONFIG.messages.motd);
  assert.equal(tree.imageVersion, ROOT_IMAGE_VERSION);
});

test("quoting, variables and command gates", async () => {
  const r = new Rig();
  let x = await r.run("export COLOUR=green; echo '$COLOUR' \"$COLOUR\"");
  assert.equal(x.out, "$COLOUR green\n");
  x = await r.run("false && echo bad; false || echo good; true && echo yes");
  assert.equal(x.out, "good\nyes\n");
  assert.equal(x.code, 0);
  x = await r.run("A=one; A=two env | grep '^A=two$'; echo ok # ; echo nope");
  assert.equal(x.out, "A=two\nok\n");
});

test("command and colon are handled inside /bin/thsh", async () => {
  const r = new Rig();

  let x = await r.run("/bin/thsh -c ':'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "");

  x = await r.run("/bin/thsh -c 'false; :; echo $?'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "0\n", "colon must reset exit status to success");

  x = await r.run("/bin/thsh -c 'command -v :; command -v command; command -v true'");
  assert.equal(x.code, 0);
  assert.equal(x.out, ":\ncommand\n/bin/true\n");

  x = await r.run("/bin/thsh -c 'command -p -v true'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "/bin/true\n");

  x = await r.run("/bin/thsh -c 'command -V command'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "command is a shell built-in\n");

  x = await r.run("/bin/thsh -c 'alias echo=false; command echo bypasses-alias'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "bypasses-alias\n", "command must not expand aliases of its operand");

  x = await r.run("/bin/thsh -c 'command -v no-such-program'");
  assert.equal(x.code, 1);
  assert.equal(x.out, "");

  x = await r.run("/bin/thsh -c 'command no-such-program'");
  assert.equal(x.code, 127);

  x = await r.run("/bin/thsh -c 'command false'");
  assert.equal(x.code, 1);

  x = await r.run("/bin/thsh -c 'command cd /tmp; pwd'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "/tmp\n", "command cd must act in the same shell");

  x = await r.run("/bin/thsh -c ': > /tmp/colon-created; cat /tmp/colon-created'");
  assert.equal(x.code, 0);
  assert.equal(x.out, "");
  assert.equal(r.os.s.read("/tmp/colon-created"), "");

  for (const name of ["/bin/command", "/bin/:"]) {
    let installed = true;
    try { r.os.s.stat(name); } catch { installed = false; }
    assert.ok(!installed, name + " must remain a shell built-in, not a separate executable");
  }
});

test("GNU head dd od and Bash are actual pre-built THX2 guest executables", async () => {
  const file = await import("node:fs/promises");
  const r = new Rig();
  for (const command of ["head", "dd", "od", "bash"]) {
    const path = "/bin/" + command;
    const bin = new Uint8Array(await file.readFile(new URL("../../.thistle.base" + path, import.meta.url), null));
    assert.equal(dec(bin.slice(0, 4)), "THX2",
      path + " must be native GNU RV64GC THX2, not a TypeScript launcher");
    assert.ok(bin.length > 256, path + " is not a complete executable");
    r.os.s.mkfile(path, bin, 0o755);
  }

  let x = await r.run("printf 'first\nsecond\n' | /bin/head -n 1");
  assert.equal(x.code, 0, x.err);
  assert.equal(x.out, "first\n");
  x = await r.run("printf 'ABC' > /tmp/gnu-data; /bin/dd if=/tmp/gnu-data of=/tmp/gnu-copy bs=1 count=3");
  assert.equal(x.code, 0, x.err);
  assert.equal(r.os.s.read("/tmp/gnu-copy"), "ABC");
  x = await r.run("/bin/od -An -tx1 /tmp/gnu-copy");
  assert.equal(x.code, 0);
  assert.ok(/\b41\s+42\s+43\b/.test(x.out), "GNU od output does not match the copied bytes");
  x = await r.run("/bin/bash -c 'printf bash-ready'");
  assert.equal(x.code, 0, x.err);
  assert.equal(x.out, "bash-ready");
});

test("thsh folds physical line continuations without changing quoted here-documents", async () => {
  const r = new Rig();
  const slash = String.fromCharCode(92);
  const lines = (...value: string[]): string => value.join("\n");

  let x = await r.run(lines(`echo alpha ${slash}`, "beta"));
  assert.equal(x.code, 0);
  assert.equal(x.out, "alpha beta\n");

  x = await r.run(lines(`printf '%s' "double${slash}`, "quoted\""));
  assert.equal(x.code, 0);
  assert.equal(x.out, "doublequoted");

  x = await r.run(lines(`printf '%s' 'single${slash}`, "quoted'"));
  assert.equal(x.code, 0);
  assert.equal(x.out, `single${slash}\nquoted`);

  x = await r.run(lines(`printf '%s\\n' literal${slash}${slash}`, "echo next"));
  assert.equal(x.code, 0);
  assert.equal(x.out, `literal${slash}\nnext\n`, "an escaped literal backslash became a continuation");

  x = await r.run(`echo comment-ok # 'not a quote ${slash}`);
  assert.equal(x.code, 0);
  assert.equal(x.out, "comment-ok\n", "comment text incorrectly made the command incomplete");

  x = await r.run(`echo unfinished ${slash}`);
  assert.equal(x.code, 2);
  assert.ok(x.err.includes("trailing escape"), "a trailing escape did not report a syntax error");

  r.os.s.write(
    "/tmp/continued.thsh",
    lines("#!/bin/thsh", `echo script ${slash}`, "continued", ""),
    false,
    0o755,
  );
  r.os.s.chmod("/tmp/continued.thsh", 0o755);
  x = await r.run("/tmp/continued.thsh");
  assert.equal(x.code, 0);
  assert.equal(x.out, "script continued\n");

  x = await r.run(lines("cat <<'EOF'", `left${slash}`, "right", "EOF", ""));
  assert.equal(x.code, 0);
  assert.equal(x.out, `left${slash}\nright\n`, "a quoted here-document body was folded");

  x = await r.run(lines("cat <<EOF", `left${slash}`, "right", "EOF", ""));
  assert.equal(x.code, 0);
  assert.equal(x.out, "leftright\n", "an unquoted here-document lost its established expansion rules");
});

test("line editor clears unaccepted history suggestions before submitting", () => {
  const r = new Rig();
  r.os.sh.hist.push('echo "test" && echo "test2"');
  let output = "";
  let executed = "";

  const editor = new LineEditor({
    shell: r.os.sh,
    prompt: () => "$ ",
    busy: () => false,
    write: value => { output += value; },
    execute: source => { executed = source; },
    passthrough: () => {},
    halt: () => {},
    complete: line => ({ line, list: [] }),
  });

  editor.key('echo "test"');
  editor.key("\r");

  assert.equal(executed, 'echo "test"');
  assert.ok(
    output.endsWith('\r\x1b[2K$ echo "test"\r\n'),
    "submit left the grey suggestion visible",
  );
});

test("line editor continues typed and pasted commands and cancels safely", async () => {
  const r = new Rig();
  const slash = String.fromCharCode(92);
  const executed: Array<{ source: string; bodies: string[] }> = [];
  let output = "";
  let halted = 0;
  const editor = new LineEditor({
    shell: r.os.sh,
    prompt: () => "$ ",
    busy: () => false,
    write: value => { output += value; },
    execute: (source, bodies) => { executed.push({ source, bodies: [...bodies] }); },
    passthrough: () => {},
    halt: () => { halted++; },
    complete: line => ({ line, list: [] }),
  });

  editor.key(`echo pasted ${slash}\nworks\n`);
  assert.equal(executed.length, 1, "a pasted continuation executed more than once");
  assert.equal(requireValue(executed[0] ?? null, "src/test/all.ts:3079").source, `echo pasted ${slash}\nworks`);
  assert.ok(output.includes("> "), "the continuation prompt was not rendered");
  let x = await r.run(requireValue(executed.shift() ?? null, "src/test/all.ts:3081").source);
  assert.equal(x.code, 0);
  assert.equal(x.out, "pasted works\n");

  editor.key(`echo literal ${slash}${slash}\r`);
  assert.equal(executed.length, 1, "an escaped literal backslash incorrectly requested another line");
  executed.shift();

  output = "";
  editor.key(`echo cancelled ${slash}\r`);
  assert.equal(executed.length, 0);
  editor.key("\x03");
  editor.key("echo kept\r");
  assert.equal(executed.length, 1);
  assert.equal(requireValue(executed.shift() ?? null, "src/test/all.ts:3095").source, "echo kept");
  assert.ok(output.includes("^C"), "Ctrl+C did not visibly cancel continuation input");

  editor.key(`echo eof ${slash}\r`);
  editor.key("\x04");
  assert.equal(halted, 0, "EOF halted the shell while a command was incomplete");
  assert.equal(executed.length, 1);
  x = await r.run(requireValue(executed.shift() ?? null, "src/test/all.ts:3102").source);
  assert.equal(x.code, 2);
  assert.ok(x.err.includes("trailing escape"), "EOF did not surface the incomplete command error");

  editor.key("\x04");
  assert.equal(halted, 1, "EOF on an empty complete prompt did not halt the shell");
});

test("redirects and filesystem commands", async () => {
  const r = new Rig();
  const x = await r.run("mkdir -p /tmp/a/b && echo first > /tmp/a/b/x && echo second >> /tmp/a/b/x && cp /tmp/a/b/x /tmp/a/y && cat /tmp/a/y");
  assert.equal(x.code, 0);
  assert.equal(x.out, "first\nsecond\n");
  assert.equal(r.os.s.read("/tmp/a/b/x"), "first\nsecond\n");
  await r.run("rm -r /tmp/a");
  let miss = false; try { r.os.s.stat("/tmp/a"); } catch { miss = true; }
  assert.ok(miss, "recursive rm left the tree behind");

  const rm = new Rm();
  await assert.rejects(
    () => rm.run(r.os.s, ["/tmp/no-such-entry"]),
    { code: "ENOENT" },
    "non-forced rm must propagate the original filesystem exception",
  );
  r.os.s.mkdir("/tmp/forced");
  r.os.s.mkdir("/tmp/forced/sub");
  r.os.s.write("/tmp/forced/sub/file", "content");
  assert.equal(
    await rm.run(r.os.s, ["-rf", "/tmp/no-such-entry", "/tmp/forced"]),
    0,
    "forced recursive removal must ignore missing entries and remove nested files",
  );
  assert.throws(
    () => r.os.s.stat("/tmp/forced"),
    { code: "ENOENT" },
    "forced recursive removal left a nested directory behind",
  );

  await r.run("umask 077; touch /tmp/private");
  assert.equal(r.os.s.stat("/tmp/private").mode, 0o600, "umask was not inherited by a child");
});

test("streaming pipeline closes upstream", async () => {
  const r = new Rig();
  const file = await import("node:fs/promises");
  const head = new Uint8Array(await file.readFile(new URL("../../.thistle.base/bin/head", import.meta.url), null));
  r.os.s.mkfile("/bin/head", head, 0o755);
  const x = await r.run("yes thistle | head -n 3");
  assert.equal(x.out, "thistle\nthistle\nthistle\n");
  assert.equal(x.err, "", "SIGPIPE leaked as a diagnostic");
  assert.equal(x.code, 0);
  assert.ok(r.os.k.ps().length === 2, "pipeline children were not reaped");
  const y = await r.run("printf 'kept\\n' | thsh -c 'echo first; cat'");
  assert.equal(y.out, "first\nkept\n", "a nested process closed its shell stdin");
});

test("text tool pipeline", async () => {
  const r = new Rig();
  const x = await r.run("printf 'pear\\napple\\npear\\nplum\\n' | sort | uniq -c | grep -E '2 pear'");
  assert.equal(x.code, 0);
  assert.ok(x.out.includes("2 pear"));
});

test("background jobs and signals", async () => {
  const r = new Rig();
  let x = await r.run("sleep 30 &");
  assert.ok(/^\[1\] \d+\n$/.test(x.out));
  x = await r.run("jobs");
  assert.ok(x.out.includes("Running"));
  await r.run("kill %1");
  x = await r.run("wait %1");
  assert.equal(x.code, 143);
  assert.equal(r.os.sh.jobs.size, 0);
});

test("ELF import validates results and preserves file errors", async () => {
  const image = new Uint8Array(140), v = new DataView(image.buffer);
  image.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  v.setUint16(16, 2, true); v.setUint16(18, 243, true); v.setUint32(20, 1, true);
  v.setBigUint64(24, 0x10000n, true); v.setBigUint64(32, 64n, true);
  v.setUint16(52, 64, true); v.setUint16(54, 56, true); v.setUint16(56, 1, true);
  v.setUint32(64, 1, true); v.setUint32(68, 5, true);
  v.setBigUint64(72, 128n, true); v.setBigUint64(80, 0x10000n, true);
  v.setBigUint64(96, 12n, true); v.setBigUint64(104, 12n, true); v.setBigUint64(112, 16n, true);
  v.setUint32(128, 0x00700513, true); v.setUint32(132, 0x05d00893, true); v.setUint32(136, 0x00000073, true);
  const parser = new Elf(), good = parser.parse(image, "exit.elf");
  assert.equal(good.message, null);
  assert.ok(good.exe !== null);
  assert.equal(parser.run(image).entry, 0x10000);
  const truncated = image.slice(0, 32), badHeader = parser.parse(truncated, "short.elf");
  assert.equal(badHeader.exe, null);
  assert.equal(badHeader.message, "short.elf: truncated ELF header");
  assert.throws(() => parser.run(truncated, "short.elf"), ElfErr);
  const overflow = image.slice();
  new DataView(overflow.buffer).setBigUint64(24, 0xffffffffffffffffn, true);
  assert.equal(parser.parse(overflow).message, "ELF entry is outside Thistle's address range");
  const r = new Rig();
  r.os.s.mkfile("/tmp/exit.elf", image);
  r.os.s.mkfile("/tmp/short.elf", truncated);
  let x = await r.run("elf2thx -o /tmp/exit.thx /tmp/exit.elf; /tmp/exit.thx");
  assert.equal(x.code, 7);
  assert.equal(x.err, "");
  x = await r.run("elf2thx /tmp/short.elf");
  assert.ok(x.err.includes("ENOEXEC"));
  x = await r.run("elf2thx /tmp/missing.elf");
  assert.ok(x.err.includes("ENOENT"));
});

test("shell exits preserve status, cleanup and subshell isolation without throwing", async () => {
  const r = new Rig();
  let halted = 0;
  r.os.host.halt = () => { halted++; };
  let x = await r.run("echo before; exit 7; echo unreachable");
  assert.equal(x.code, 7);
  assert.equal(x.out, "before\n");
  assert.equal(x.err, "");
  assert.equal(halted, 1);
  assert.equal(r.os.busy, false);
  assert.equal(r.os.sh.exitRequested, false);

  x = await r.run("cat <<EOF\n$(echo inside; exit 5; echo unreachable)\nEOF\necho outside");
  assert.equal(x.code, 0);
  assert.equal(x.out, "inside\noutside\n");
  assert.equal(x.err, "");
  assert.equal(halted, 1);

  x = await r.run("thsh -c 'echo child; exit 3; echo unreachable'; echo parent");
  assert.equal(x.code, 0);
  assert.equal(x.out, "child\nparent\n");
  assert.equal(x.err, "");
  assert.equal(halted, 1);

  const path = r.os.s.env("PATH");
  x = await r.run("command -p exit 4; echo unreachable");
  assert.equal(x.code, 4);
  assert.equal(x.out, "");
  assert.equal(r.os.s.env("PATH"), path);
  assert.equal(halted, 2);

  x = await r.run("false; logout; echo unreachable");
  assert.equal(x.code, 1);
  assert.equal(x.out, "");
  assert.equal(halted, 3);
});

test("scripts retain shell state", async () => {
  const r = new Rig();
  r.os.s.write("/tmp/t.thsh", "#!/bin/thsh\nexport X=inside\necho $X\ncd /tmp\npwd\n", false, 0o755);
  r.os.s.chmod("/tmp/t.thsh", 0o755);
  const x = await r.run("/tmp/t.thsh");
  assert.equal(x.out, "inside\n/tmp\n");
  assert.equal(r.os.s.cwd, "/root", "child script changed the parent cwd");
});

test("interactive TTY supports canonical and raw input", async () => {
  let out = "", sig = 0;
  const tty = new Tty((s) => { out += s; }, () => { sig++; });
  const line = tty.input.rd();
  tty.feed("hello\r");
  assert.equal(dec(await line), "hello\n");
  assert.equal(out, "hello\r\n");
  const raw = tty.termios(), v = new DataView(raw.buffer);
  v.setUint32(12, v.getUint32(12, true) & ~0x0a, true);
  tty.setTermios(raw, false);
  const key = tty.input.rd();
  tty.feed("\x1b[A");
  assert.equal(dec(await key), "\x1b[A");
  tty.resize(42, 132);
  assert.equal(tty.size().rows, 42); assert.equal(tty.size().cols, 132); assert.equal(sig, 0);
});

test("foreground TTY interruption restores echo and wakes native input", async () => {
  let out = "", signals = 0;
  const tty = new Tty(
    s => { out += s; },
    () => { signals++; return true; },
  );
  const hidden = tty.termios(), view = new DataView(hidden.buffer);
  view.setUint32(12, view.getUint32(12, true) & ~0x48, true);
  tty.setTermios(hidden, true);
  const waiting = tty.input.rd();
  tty.feed("uncommitted-secret\x03");
  assert.equal((await waiting).length, 0, "interrupted terminal read did not wake");
  const restored = new DataView(tty.termios().buffer);
  assert.ok(!!(restored.getUint32(12, true) & 0x08), "echo was not restored");
  assert.equal(signals, 1);
  assert.ok(out.includes("^C"), "interrupt was not displayed");
  assert.ok(!out.includes("uncommitted-secret"), "hidden input was echoed");
  const next = tty.input.rd();
  tty.feed("clean\r");
  assert.equal(dec(await next), "clean\n", "partial secret survived the interrupt");
});

test("process signal masks defer delivery across critical sections", () => {
  const r = new Rig(), p = r.os.p, interrupt = 1n << 1n;
  assert.equal(p.setSignalMask(0, interrupt), 0n);
  assert.equal(p.signalMask, interrupt);
  assert.equal(p.signal(2), false, "masked signal was delivered immediately");
  assert.equal(p.sig, null);
  assert.ok(!p.ac.signal.aborted, "masked signal aborted the process");
  assert.equal(p.setSignalMask(1, interrupt), interrupt);
  assert.equal(p.sig, 2);
  assert.ok(p.ac.signal.aborted, "pending signal was not delivered after unmasking");

  const k = new Rig().os.p;
  k.setSignalMask(0, 1n << 8n);
  assert.equal(k.signalMask, 0n, "SIGKILL was maskable");
  assert.equal(k.signal(9), true);
  assert.equal(k.sig, 9);
});

test("signal zero probes process ownership without delivery", () => {
  const r = new Rig();
  assert.equal(r.os.s.kill(r.os.p.pid, 0), 1);
  assert.ok(!r.os.p.ac.signal.aborted, "signal zero interrupted its target");

  let error = "";
  try {
    r.os.s.kill(0x7fffffff, 0);
  } catch (caughtValue) { const caught = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
    error = caught instanceof KErr ? caught.code : "unexpected";
  }

  assert.equal(error, "ESRCH", "a missing process passed a signal-zero probe");
});

test("/dev/tty opens the controlling terminal", () => {
  const r = new Rig();
  const fd = r.os.s.open("/dev/tty", "r+");
  const f = (r.os.s.p.fds.get(fd) ?? null);
  assert.ok(withValue(withValue(f ?? null, value => value.input) ?? null, value => value.tty), "/dev/tty has no terminal input");
  assert.ok(withValue(withValue(f ?? null, value => value.output) ?? null, value => value.tty), "/dev/tty has no terminal output");
  assert.equal(requireValue(requireValue(f ?? null, "src/test/all.ts:3242").input ?? null, "src/test/all.ts:3238").tty, requireValue(requireValue(f ?? null, "src/test/all.ts:3242").output ?? null, "src/test/all.ts:3238").tty, "/dev/tty streams use different terminals");
  r.os.s.close(fd);
});

test("browser OPFS overlay recovers from stale entry types across reloads", async () => {
  class MemoryFile {
    readonly kind = "file" as const;
    bytes: Uint8Array = new Uint8Array();
    constructor(readonly name: string) {}
    async getFile(): Promise<File> {
      const bytes = Uint8Array.from(this.bytes);
      return {
        arrayBuffer: async () => bytes.buffer,
        text: async () => dec(bytes),
      } as File;
    }
    async createWritable(): Promise<{ write(value: Uint8Array | string): Promise<void>; close(): Promise<void> }> {
      return {
        write: async value => { this.bytes = typeof value === "string" ? enc(value) : Uint8Array.from(value); },
        close: async () => {},
      };
    }
  }

  class MemoryDirectory {
    readonly kind = "directory" as const;
    readonly children = new Map<string, MemoryDirectory | MemoryFile>();
    constructor(readonly name: string) {}
    async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile], void, void> {
      yield* this.children;
    }
    async getDirectoryHandle(name: string, options: { create: boolean | null } = {"create": null}): Promise<MemoryDirectory> {
      const entry = (this.children.get(name) ?? null);
      if (entry instanceof MemoryDirectory) return entry;
      if (entry) throw new DOMException("Existing entry is a file", "TypeMismatchError");
      if (!options.create) throw new DOMException("Missing directory", "NotFoundError");
      const directory = new MemoryDirectory(name);
      this.children.set(name, directory);
      return directory;
    }
    async getFileHandle(name: string, options: { create: boolean | null } = {"create": null}): Promise<MemoryFile> {
      const entry = (this.children.get(name) ?? null);
      if (entry instanceof MemoryFile) return entry;
      if (entry) throw new DOMException("Existing entry is a directory", "TypeMismatchError");
      if (!options.create) throw new DOMException("Missing file", "NotFoundError");
      const file = new MemoryFile(name);
      this.children.set(name, file);
      return file;
    }
    async removeEntry(name: string, options: { recursive: boolean | null } = {"recursive": null}): Promise<void> {
      const entry = (this.children.get(name) ?? null);
      if (!entry) throw new DOMException("Missing entry", "NotFoundError");
      if (entry instanceof MemoryDirectory && entry.children.size && !options.recursive) {
        throw new DOMException("Directory is not empty", "InvalidModificationError");
      }
      this.children.delete(name);
    }
  }

  const storage = new MemoryDirectory("");
  const originalNavigator = (Object.getOwnPropertyDescriptor(globalThis, "navigator") ?? null);
  const originalFetch = globalThis.fetch;
  const attributes = { mode: 0o755, uid: 0, gid: 0, at: 0, mt: 0, ct: 0 };
  const root: TreeEnt[] = [
    {"data": null, "sum": null, "size": null, "source": null, "to": null, ...attributes, p: "/", k: "d", id: 1 },
    {"data": null, "sum": null, "size": null, "source": null, "to": null, ...attributes, p: "/home", k: "d", id: 2 },
    {"data": null, "sum": null, "size": null, "source": null, "to": null, ...attributes, p: "/home/guest", k: "d", id: 3 },
  ];
  const file = (path: string, value: string, id: number): TreeEnt => ({"sum": null, "size": null, "source": null, "to": null, ...attributes, p: path, k: "f", id, uid: 1000, gid: 1000, data: enc(value),
  });
  const folder = (path: string, id: number): TreeEnt => ({"data": null, "sum": null, "size": null, "source": null, "to": null, ...attributes, p: path, k: "d", id, uid: 1000, gid: 1000,
  });
  const manifest = {
    format: 1,
    image: ROOT_IMAGE_VERSION,
    generated: "2026-01-01T00:00:00.000Z",
    core: { path: "core.gz", encoding: "gzip", packedSize: 20, unpackedSize: 0 },
    entries: root,
  };
  const emptyGzip = Uint8Array.from([
    31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { getDirectory: async () => storage } },
  });
  const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
    const path = String(input);
    if (path.endsWith("/root/manifest.json")) return new Response(JSON.stringify(manifest));
    if (path.endsWith("/root/core.gz")) return new Response(emptyGzip.buffer);
    throw new Error(`Unexpected static root request: ${path}`);
  };
  globalThis.fetch = Object.assign(mockFetch, { preconnect: () => {} });

  try {
    const path = "/home/guest/.thsh_history";
    const original = new WebTree(new URL("https://example.test/root/"));
    await original.pull();
    await original.push([...root, file(path, "ls\n", 4)], null);

    const reopened = new WebTree(new URL("https://example.test/root/"));
    const before = await reopened.pull();
    assert.equal(dec(withValue((before.find(entry => entry.p === path) ?? null) ?? null, value => value.data) ?? new Uint8Array()), "ls\n");

    // Emulate a stale OPFS directory left at a path now occupied by a guest file.
    const overlay = await storage.getDirectoryHandle(".mikuos");
    const data = await overlay.getDirectoryHandle("data");
    const home = await data.getDirectoryHandle("home");
    const guest = await home.getDirectoryHandle("guest");
    await guest.removeEntry(".thsh_history");
    const stale = await guest.getDirectoryHandle(".thsh_history", { create: true });
    await stale.getFileHandle("old", { create: true });
    await reopened.push([...root, file(path, "ls\npwd\n", 4)], null);

    const recovered = new WebTree(new URL("https://example.test/root/"));
    const after = await recovered.pull();
    assert.equal(dec(withValue((after.find(entry => entry.p === path) ?? null) ?? null, value => value.data) ?? new Uint8Array()), "ls\npwd\n");

    // File -> directory and directory -> file must both work across saves.
    const scratch = "/home/guest/scratch";
    await recovered.push([...root, file(path, "ls\npwd\n", 4), file(scratch, "first\n", 5)], null);
    await recovered.push([
      ...root, file(path, "ls\npwd\n", 4),
      folder(scratch, 6), file(`${scratch}/nested`, "nested\n", 7),
    ], null);
    const asDirectory = new WebTree(new URL("https://example.test/root/"));
    assert.equal(dec(withValue(((await asDirectory.pull()).find(entry => entry.p === `${scratch}/nested`) ?? null) ?? null, value => value.data) ?? new Uint8Array()), "nested\n");
    await asDirectory.push([...root, file(path, "ls\npwd\n", 4), file(scratch, "second\n", 8)], null);
    const asFile = new WebTree(new URL("https://example.test/root/"));
    const final = await asFile.pull();
    assert.equal(dec(withValue((final.find(entry => entry.p === scratch) ?? null) ?? null, value => value.data) ?? new Uint8Array()), "second\n");
    assert.ok(!final.some(entry => entry.p === `${scratch}/nested`), "deleted directory child survived");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});

test("native assembler, object format and linker", () => {
  const src = `.macro bump r, n=1
  addi \\r, \\r, \\n
.endm
.section .rodata
msg: .asciz "native"
.equ msg_len, . - msg
.text
.global _start
_start:
  li r0, 0
  bump r0, 2
  jmp 1f
  li r0, 99
1:
  la r1, msg
  li r2, msg_len
  halt
`;
  const a = new Asm(null, {"defs": {}, "arch": "thistle64",  debug: true }).run(src, "unit.tas");
  assert.ok(a.obj.sym.some(x => x.name === "_start" && x.bind === "global"));
  assert.equal(a.obj.machine, "thistle64");
  assert.ok(a.obj.rel.some(x => x.type === "abs64" && x.sym === "msg"));
  assert.ok(a.obj.rel.some(x => x.type === "rel64"));
  const ob = codec.pack(a.obj), oq = codec.unpack(ob);
  assert.ok(oq instanceof Obj, "object codec changed its kind");
  const z = new Link().run([a.obj]);
  assert.equal(z.exe.entry, 0x10000);
  assert.ok(z.map.includes("_start"));
  const bad = ob.slice(); bad[bad.length - 1] = requireValue(bad[bad.length - 1] ?? null, "src/test/all.ts:3553") ^ 1;
  let hit = false; try { codec.unpack(bad); } catch { hit = true; }
  assert.ok(hit, "object checksum accepted changed bytes");
});

test("thistle64 integer, branch and memory instructions", async () => {
  const r = new Rig();
  const src = `.macro expect r, v
  cmpi \\r, \\v
  jne fail
.endm
.data
.align 4
buf: .space 8
.text
.global _start
_start:
  li r0, 7
  li r1, 3
  add r2, r0, r1
  expect r2, 10
  sub r2, r0, r1
  expect r2, 4
  mul r2, r0, r1
  expect r2, 21
  div r2, r0, r1
  expect r2, 2
  mod r2, r0, r1
  expect r2, 1
  li r3, 0xffffffff
  li r4, 2
  divu r5, r3, r4
  expect r5, 0x7fffffff
  modu r5, r3, r4
  expect r5, 1
  andi r2, r0, 3
  expect r2, 3
  ori r2, r1, 8
  expect r2, 11
  xori r2, r1, 1
  expect r2, 2
  shli r2, r1, 3
  expect r2, 24
  li r6, -8
  sari r2, r6, 1
  expect r2, -4
  shri r2, r3, 31
  expect r2, 1
  not r2, r1
  expect r2, -4
  neg r2, r1
  expect r2, -3
  li r4, 12
  li r5, 34
  xchg r4, r5
  expect r4, 34
  expect r5, 12
  li r6, 255
  sex8 r7, r6
  expect r7, -1
  li r6, 65535
  sex16 r7, r6
  expect r7, -1
  la r8, buf
  li r9, 0x12345678
  st32 [r8], r9
  ld32 r10, [r8]
  expect r10, 0x12345678
  li r9, 0x80
  st8 [r8 + 4], r9
  ld8s r10, [r8 + 4]
  expect r10, -128
  ld8u r10, [r8 + 4]
  expect r10, 128
  li r9, 0x8000
  st16 [r8 + 4], r9
  ld16s r10, [r8 + 4]
  expect r10, -32768
  ld16u r10, [r8 + 4]
  expect r10, 32768
  push r0
  pop r11
  expect r11, 7
  cmp r0, r1
  setg r12
  expect r12, 1
  test r12, r12
  setne r12
  expect r12, 1
  la r4, answer
  callr r4
  expect r0, 42
  li r0, 0
  halt
answer:
  li r0, 42
  ret
fail:
  li r0, 77
  halt
`;
  const z = new Link().run([new Asm().run(src, "ops.tas").obj]).exe;
  r.os.s.writeb("/tmp/ops.txe", codec.pack(z)); r.os.s.chmod("/tmp/ops.txe", 0o755);
  const x = await r.run("/tmp/ops.txe"); assert.equal(x.code, 0); assert.equal(x.err, "");
});

test("thistle64 wide addresses, integers and floating point", async () => {
  const r = new Rig();
  const src = `.equ SYS_brk, 10
.text
.global _start
_start:
  li x4, 0x100000020
  mov x0, x4
  sys SYS_brk
  cmp x0, x4
  jne fail
  li x5, 0x100000000
  li x6, 0x123456789abcdef0
  st64 [x5], x6
  ld64 x7, [x5]
  cmp x6, x7
  jne fail
  fli f0, 1.5
  fli f1, 2.25
  fadd f2, f0, f1
  fli f3, 3.75
  fsete x8, f2, f3
  cmpi x8, 1
  jne fail
  fli f4, 0
  fdiv f5, f4, f4
  fsetne x8, f5, f5
  cmpi x8, 1
  jne fail
  fsetl x8, f5, f3
  cmpi x8, 0
  jne fail
  li x0, 0
  halt
fail:
  li x0, 86
  halt
`;
  const z = new Link().run([new Asm().run(src, "wide.tas").obj]).exe;
  assert.equal(z.machine, "thistle64"); assert.equal(z.mem, 1024 * 1024 * 1024 * 1024);
  r.os.s.writeb("/tmp/wide.txe", codec.pack(z)); r.os.s.chmod("/tmp/wide.txe", 0o755);
  const x = await r.run("/tmp/wide.txe"); assert.equal(x.code, 0); assert.equal(x.err, "");

  const hi = new Link().run([new Asm().run(".text\n.global _start\n_start: li x0, 0\n halt\n", "high.tas").obj], {"entry": null, "mem": null, "names": null,  base: 0x100000000 }).exe;
  assert.equal(hi.entry, 0x100000000, "the host linker truncated a 64-bit image base");
  r.os.s.writeb("/tmp/high.txe", codec.pack(hi)); r.os.s.chmod("/tmp/high.txe", 0o755);
  const y = await r.run("/tmp/high.txe"); assert.equal(y.code, 0); assert.equal(y.err, "");
});

test("native tools assemble, link, inspect and execute", async () => {
  const r = new Rig();
  let x = await r.run("hello.txe");
  assert.equal(x.code, 0); assert.equal(x.out, "Hello from native Thistle assembly!\n");
  x = await r.run("hello32.txe");
  assert.equal(x.code, 0); assert.equal(x.out, "Hello from Thistle 1 compatibility assembly!\n");
  x = await r.run("fib.txe");
  assert.equal(x.code, 0); assert.equal(x.out, "5\n", "native calls or stack frames are broken");

  x = await r.run("as -g --listing /tmp/hello.lst -o /tmp/hello.to /usr/share/thistle/examples/hello.tas");
  assert.equal(x.code, 0); assert.equal(x.err, ""); assert.ok(r.os.s.read("/tmp/hello.lst").includes("sys SYS_write"));
  x = await r.run("ld --Map /tmp/hello.map -o /tmp/hello.txe /tmp/hello.to && /tmp/hello.txe");
  assert.equal(x.code, 0); assert.equal(x.out, "Hello from native Thistle assembly!\n"); assert.ok(r.os.s.read("/tmp/hello.map").includes("entry _start"));
  x = await r.run("file /tmp/hello.to /tmp/hello.txe; nm -g /tmp/hello.to; size /tmp/hello.txe; dis -hr /tmp/hello.to");
  assert.ok(x.out.includes("thistle64 relocatable object")); assert.ok(x.out.includes("native executable")); assert.ok(x.out.includes(" T _start")); assert.ok(x.out.includes("abs64"));

  x = await r.run("as --32 -o /tmp/hello32.to /usr/share/thistle/examples/hello32.tas && ld -o /tmp/hello32.txe /tmp/hello32.to && /tmp/hello32.txe");
  assert.equal(x.code, 0); assert.equal(x.out, "Hello from Thistle 1 compatibility assembly!\n");
});

test("native ABI links objects and performs filesystem syscalls", async () => {
  const r = new Rig();
  r.os.s.write("/tmp/main.tas", `.text
.global main
.extern helper
main:
  call helper
  ret
`);
  r.os.s.write("/tmp/helper.tas", `.text
.global helper
helper:
  li r0, 9
  ret
`);
  let x = await r.run("as -o /tmp/main.to /tmp/main.tas && as -o /tmp/helper.to /tmp/helper.tas && ld -o /tmp/multi.txe /usr/lib/thistle/crt0.to /tmp/main.to /tmp/helper.to && /tmp/multi.txe");
  assert.equal(x.code, 9, "crt0 or cross-object call returned the wrong status"); assert.equal(x.err, "");

  r.os.s.write("/tmp/io.tas", `.include "/usr/include/thistle/sys.tas"
.section .rodata
path: .asciz "/tmp/from-native"
msg: .ascii "written by thistle64\\n"
.equ msg_len, . - msg
.text
.global _start
_start:
  la r0, path
  li r1, O_WRONLY | O_CREAT | O_TRUNC
  li r2, 0o640
  sys SYS_open
  mov r4, r0
  mov r0, r4
  la r1, msg
  li r2, msg_len
  sys SYS_write
  mov r0, r4
  sys SYS_close
  exit 0
`);
  x = await r.run("as -o /tmp/io.to /tmp/io.tas && ld -o /tmp/io.txe /tmp/io.to && /tmp/io.txe && cat /tmp/from-native");
  assert.equal(x.code, 0); assert.equal(x.out, "written by thistle64\n"); assert.equal(r.os.s.stat("/tmp/from-native").mode, 0o640);

  r.os.s.write("/tmp/spawn.tas", `.include "/usr/include/thistle/sys.tas"
.section .rodata
child: .asciz "/bin/true"
.text
.global _start
_start:
  la r0, child
  li r1, 0
  li r2, 0
  sys SYS_spawn
  sys SYS_wait
  sys SYS_exit
`);
  x = await r.run("as -o /tmp/spawn.to /tmp/spawn.tas && ld -o /tmp/spawn.txe /tmp/spawn.to && /tmp/spawn.txe");
  assert.equal(x.code, 0, "native spawn/wait did not use the kernel process table");
});

test("HTTP stack and wget userland", async () => {
  const dev = new TestNet();
  const r = new Rig(new Net(dev));
  let x = await r.run("wget -S http://unit.test/go -O /tmp/payload");
  assert.equal(x.code, 0);
  assert.equal(r.os.s.read("/tmp/payload"), "network payload\n");
  assert.ok(x.err.includes("HTTP 200 OK"));
  assert.equal(dev.seen.length, 2, "redirect was not followed");
  assert.equal(r.os.k.net.calls, 2);
  assert.ok(r.os.s.read("/proc/net/dev").includes("requests 2 failed 0"));

  x = await r.run("wget -qO- http://unit.test/file");
  assert.equal(x.code, 0);
  assert.equal(x.out, "network payload\n");
  assert.equal(x.err, "");

  x = await r.run("wget --post-data=hello -O - http://unit.test/post");
  assert.equal(x.code, 0);
  assert.equal(x.out, "hello");
  assert.equal(withValue((dev.seen.at(-1) ?? null) ?? null, value => value.method), "POST");

  x = await r.run("wget --spider http://unit.test/gone");
  assert.equal(x.code, 8, "HTTP failure did not use wget's server-error code");

  x = await r.run("wget --max-size=2 -O /tmp/small http://unit.test/file");
  assert.equal(x.code, 4, "oversized response did not use wget's network-error code");
  let made = true; try { r.os.s.stat("/tmp/small"); } catch { made = false; }
  assert.equal(made, false, "wget left a partial oversized file");

  x = await r.run("wget --max-redirect=0 -O /tmp/loop http://unit.test/go");
  assert.equal(x.code, 4, "redirect limit was ignored");
});

test("devices and procfs are live", async () => {
  const r = new Rig();
  assert.equal(r.os.s.readb("/dev/zero").slice(0, 32).every(x => x === 0), true);
  assert.ok(r.os.s.read("/proc/version").includes("Thistle version"));
  assert.ok(r.os.s.read("/proc/version").includes("Thistle TypeScript"));
  const cat = await r.run("cat /proc/version");
  assert.equal(cat.out.split("\n").filter(Boolean).length, 1, "proc file did not reach EOF");
  await new Promise<void>(resolve => setTimeout(resolve, 5));
  assert.ok(Number.parseFloat(r.os.s.read("/proc/uptime")) > 0);
  let e: Error | null = null; try { r.os.s.write("/dev/full", "x"); } catch (caughtValue) { const x = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  e = x; }
  assert.ok(e instanceof KErr && e.code === "ENOSPC");
});

test("globs, find and metadata", async () => {
  const r = new Rig();
  await r.run("mkdir /tmp/g; touch /tmp/g/a.txt /tmp/g/b.txt /tmp/g/nope; chmod 640 /tmp/g/a.txt");
  let x = await r.run("echo /tmp/g/*.txt");
  assert.equal(x.out, "/tmp/g/a.txt /tmp/g/b.txt\n");
  x = await r.run("find /tmp/g -name '*.txt' -type f | sort");
  assert.equal(x.out, "/tmp/g/a.txt\n/tmp/g/b.txt\n");
  assert.equal(r.os.s.stat("/tmp/g/a.txt").mode, 0o640);
});

let pass = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok ${++pass} - ${name}`); }
  catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));  console.error(`not ok ${pass + 1} - ${name}`); throw e; }
}
console.log(`1..${tests.length}`);
