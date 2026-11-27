import { argumentPrefix, firstArgument, takeArgument } from "../core/arguments.js";
import { withValue } from "../../thistle/src/core/err.js";
import { requireValue } from "../../thistle/src/core/err.js";
import { App, FnApp } from "../../thistle/src/apps/base.js";
import type { Sys } from "../../thistle/src/core/sys.js";
import { bad } from "../../thistle/src/core/err.js";
import { esc, narg } from "./util.js";
import { dec, enc } from "../../thistle/src/io/stream.js";

const src = async (s: Sys, a: string[]): Promise<Array<[string, string]>> => {
  const ps = a.filter(x => x !== "-");
  if (!a.length || a.includes("-")) return [["-", await s.input()], ...ps.map(p => [p, s.read(p)] as [string, string])];
  return ps.map(p => [p, s.read(p)]);
};

const lines = (x: string): string[] => {
  const a = x.split("\n");
  if (x.endsWith("\n")) a.pop();
  return a;
};

export class Echo extends App {
  constructor() { super("echo", "Print arguments.", "echo [-ne] [arg ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    let nl = true, e = false;
    while ((firstArgument(a)) === "-n" || (firstArgument(a)) === "-e" || (firstArgument(a)) === "-ne" || (firstArgument(a)) === "-en") { const x = requireValue(takeArgument(a), "src/apps/text.ts:23"); nl &&= !x.includes("n"); e ||= x.includes("e"); }
    const x = a.join(" ");
    await s.out((e ? esc(x) : x) + (nl ? "\n" : ""));
    return 0;
  }
}

export class Printf extends App {
  constructor() { super("printf", "Format and print values.", "printf format [value ...]"); }
  // App.run is the required polymorphic command entry point, including stateless commands.
  //@cg-expect-warning
  override async run(s: Sys, a: string[]): Promise<number> {
    if (!a.length) bad("EINVAL", "printf: missing format");
    const f = esc(requireValue(takeArgument(a), "printf format"));
    const out = f.replace(/%([%sdixXoc])/g, (_m, k: string) => {
      if (k === "%") return "%";
      const operand = takeArgument(a);
      const v = operand ?? "";
      if (k === "s") return v;
      if (k === "c") return v.charAt(0);
      const n = Number.parseInt(v, 0);
      if (!Number.isFinite(n)) return "0";
      return k === "x" ? n.toString(16) : k === "X" ? n.toString(16).toUpperCase() : k === "o" ? n.toString(8) : String(n);
    });
    await s.out(out);
    return 0;
  }
}

export class Tail extends App {
  constructor() { super("tail", "Print the final lines of input.", "tail [-n count] [file ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    let n = 10;
    const [option, count] = argumentPrefix(a);
    switch (true) {
      case option === "-n": n = narg(count ?? "", "line count"); a.splice(0, 2); break;
      case /^-\d+$/.test(option ?? ""): n = Number(requireValue(takeArgument(a), "tail count").slice(1)); break;
    }
    for (const [, x] of await src(s, a)) { const q = lines(x).slice(-n); if (q.length) await s.out(q.join("\n") + "\n"); }
    return 0;
  }
}

export class Wc extends App {
  constructor() { super("wc", "Count lines, words and bytes.", "wc [-lwc] [file ...]"); }
  // App.run is the required polymorphic command entry point, including stateless commands.
  //@cg-expect-warning
  override async run(s: Sys, a: string[]): Promise<number> {
    const f = a.filter(x => /^-[lwc]+$/.test(x)).join("");
    a = a.filter(x => !/^-[lwc]+$/.test(x));
    const q = await src(s, a);
    for (const [p, x] of q) {
      const words = x.match(/\S+/g);
      const z: number[] = [];
      if (!f || f.includes("l")) z.push(lines(x).length);
      if (!f || f.includes("w")) z.push(words === null ? 0 : words.length);
      if (!f || f.includes("c")) z.push(enc(x).length);
      await s.out(z.map(n => String(n).padStart(7)).join("") + (p === "-" ? "" : ` ${p}`) + "\n");
    }
    return 0;
  }
}

export class Grep extends App {
  constructor() { super("grep", "Select lines matching a pattern.", "grep [-ivncE] pattern [file ...]"); }
  // App.run is the required polymorphic command entry point, including stateless commands.
  //@cg-expect-warning
  override async run(s: Sys, a: string[]): Promise<number> {
    const f = (withValue((firstArgument(a)), value => value.startsWith("-"))) ? requireValue(takeArgument(a), "src/apps/text.ts:79") : "";
    const pattern = takeArgument(a);
    const pat = pattern ?? bad("EINVAL", "grep: missing pattern");
    let rx: RegExp = /(?:)/;
    try { rx = new RegExp(f.includes("E") ? pat : pat.replace(/[+?(){}|]/g, "\\$&"), f.includes("i") ? "i" : ""); }
    catch { bad("EINVAL", `bad pattern: ${pat}`); }
    let hit = 0;
    const q = await src(s, a);
    for (const [p, x] of q) {
      let n = 0;
      for (const [i, line] of lines(x).entries()) {
        const yes = rx.test(line) !== f.includes("v");
        if (!yes) continue;
        hit++; n++;
        if (!f.includes("c")) await s.out(`${q.length > 1 ? `${p}:` : ""}${f.includes("n") ? `${i + 1}:` : ""}${line}\n`);
      }
      if (f.includes("c")) await s.out(`${q.length > 1 ? `${p}:` : ""}${n}\n`);
    }
    return hit ? 0 : 1;
  }
}

export class Sort extends App {
  constructor() { super("sort", "Sort text lines.", "sort [-nru] [file ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    const f = a.filter(x => /^-[nru]+$/.test(x)).join("");
    a = a.filter(x => !/^-[nru]+$/.test(x));
    let q = (await src(s, a)).flatMap(([, x]) => lines(x));
    q.sort(f.includes("n") ? (a0, b0) => Number(a0) - Number(b0) : (a0, b0) => a0.localeCompare(b0));
    if (f.includes("u")) {
      let previous: string | null = null;
      q = q.filter(line => { const unique = line !== previous; previous = line; return unique; });
    }
    if (f.includes("r")) q.reverse();
    if (q.length) await s.out(q.join("\n") + "\n");
    return 0;
  }
}

const emitRun = async (s: Sys, flags: string, line: string, count: number): Promise<void> => {
  if (!flags.includes("d") || count > 1)
    await s.out(`${flags.includes("c") ? String(count).padStart(7) + " " : ""}${line}\n`);
  };

const uniqueLines = async (s: Sys, a: string[]): Promise<number> => {
  const f = (withValue((firstArgument(a)), value => value.startsWith("-"))) ? requireValue(takeArgument(a), "src/apps/text.ts:117") : "";
  // Only the first input is used, and equal adjacent lines form one run.
  const inputs = await src(s, a);
  let previous: string | null = null, count = 0;
  for (const [, input] of inputs) {
    for (const line of lines(input)) {
      if (previous !== null && line !== previous) { await emitRun(s, f, previous, count); count = 0; }
      previous = line;
      count++;
    }
    break;
  }
  if (previous !== null) await emitRun(s, f, previous, count);
  return 0;
};

export class Uniq extends FnApp {
  constructor() { super("uniq", "Filter adjacent duplicate lines.", "uniq [-cd] [file]", uniqueLines); }
}

const range = (x: string): number[] => {
  const out: number[] = [];
  for (const p of x.split(",")) {
    if (!/^(\d+)(?:-(\d*))?$/.test(p)) return bad("EINVAL", `range ${x}`);
    const separator = p.indexOf("-");
    const a = Number(separator < 0 ? p : p.slice(0, separator));
    const end = p.slice(separator + 1);
    const b = separator < 0 ? a : end === "" ? 1e9 : Number(end);
    for (let i = a; i <= b && i < 1e6; i++) out.push(i);
  }
  return out;
};

export class Cut extends App {
  constructor() { super("cut", "Select fields or characters.", "cut -d delim -f list | -c list [file ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    const fi = a.indexOf("-f"), ci = a.indexOf("-c"), di = a.indexOf("-d");
    const spec = (fi >= 0 ? (a[fi + 1] ?? null) : ci >= 0 ? (a[ci + 1] ?? null) : null) ?? bad("EINVAL", "cut: -f or -c required");
    const take = new Set(range(spec));
    const skip = new Set([fi, fi + 1, ci, ci + 1, di, di + 1]);
    const ps = a.filter((_x, i) => !skip.has(i));
    const d = di >= 0 ? a[di + 1] ?? "\t" : "\t";
    for (const [, x] of await src(s, ps)) for (const line of lines(x)) {
      const q = fi >= 0 ? line.split(d) : [...line];
      await s.out(q.filter((_v, i) => take.has(i + 1)).join(fi >= 0 ? d : "") + "\n");
    }
    return 0;
  }
}

const set = (s: string): string => s.replace(/(.)-(.)/g, (_m, a: string, b: string) => {
  // The regex captures one UTF-16 code unit at each end, including surrogate halves.
  let x = ""; for (let i = a.charCodeAt(0); i <= b.charCodeAt(0); i++) x += String.fromCodePoint(i); return x;
});

const translateInput = async (s: Sys, a: string[]): Promise<number> => {
  const del = (firstArgument(a)) === "-d"; if (del) a.shift();
  const [source, replacement] = argumentPrefix(a);
  if (!source || (!del && replacement === null)) return bad("EINVAL", "tr arguments");
  const x = set(esc(source)), y = set(esc(replacement ?? ""));
  let out = "";
  for (const c of await s.input()) { const i = x.indexOf(c); switch (true) {
case !!(i < 0): { out += c;
break; }
case !!(!del): { out += y.charAt(Math.min(i, y.length - 1));
break; }
} }
  await s.out(out); return 0;
};

export class Tr extends FnApp {
  constructor() { super("tr", "Translate or delete characters.", "tr [-d] set1 [set2]", translateInput); }
}

const substituteLines = async (s: Sys, a: string[]): Promise<number> => {
  const quiet = (firstArgument(a)) === "-n"; if (quiet) a.shift();
  const ex = (takeArgument(a)); if (ex === null || !ex.startsWith("s")) return bad("EINVAL", "sed: substitution required");
  const d = ex.charAt(1); if (!d) return bad("EINVAL", "sed expression");
  const p = ex.slice(2).split(d); if (p.length < 3) bad("EINVAL", "sed expression");
  const [pattern, replacement, flags] = argumentPrefix(p);
  if (pattern === null || replacement === null || flags === null) return bad("EINVAL", "sed expression");
  let rx: RegExp = /(?:)/;
  try { rx = new RegExp(pattern, flags.includes("g") ? "g" : ""); }
  catch { return bad("EINVAL", "sed pattern"); }
  for (const [, x] of await src(s, a)) for (const line of lines(x)) {
    const hit = rx.test(line); rx.lastIndex = 0;
    const z = line.replace(rx, replacement.replace(/&/g, "$&"));
    if (!quiet || (hit && flags.includes("p"))) await s.out(z + "\n");
  }
  return 0;
};

export class Sed extends FnApp {
  constructor() { super("sed", "Apply a substitution to text.", "sed [-n] 's/pattern/replacement/[gp]' [file ...]", substituteLines); }
}

export class Tee extends App {
  constructor() { super("tee", "Copy standard input to files and output.", "tee [-a] [file ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    const add = (firstArgument(a)) === "-a"; if (add) a.shift();
    const b = await s.inb();
    for (const p of a) s.writeb(p, b, add);
    await s.out(b); return 0;
  }
}

export class Seq extends App {
  constructor() { super("seq", "Print a numeric sequence.", "seq [first [step]] last"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    if (!a.length || a.length > 3) bad("EINVAL", "seq arguments");
    const [one, two, three] = argumentPrefix(a);
    const first = a.length === 1 ? 1 : narg(requireValue(one, "sequence first"));
    const step = a.length === 3 ? narg(requireValue(two, "sequence step")) : 1;
    const end = a.length === 3 ? three : a.length === 2 ? two : one;
    const last = narg(requireValue(end, "sequence last"));
    if (!step) bad("EINVAL", "zero step");
    let out = "";
    for (let n = first, i = 0; step > 0 ? n <= last : n >= last; n += step) { out += `${n}\n`; if (++i > 1_000_000) bad("ERANGE", "sequence too large"); }
    await s.out(out); return 0;
  }
}

export class Yes extends App {
  constructor() { super("yes", "Repeat a line until interrupted.", "yes [text]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    const x = (a.length ? a.join(" ") : "y") + "\n";
    for (let i = 0;; i++) { s.chk(); await s.out(x); if (!(i & 255)) await s.sleep(0); }
  }
}

const b64e = (b: Uint8Array): string => {
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  if (typeof btoa === "function") return btoa(s);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = ""; for (let i = 0; i < b.length; i += 3) { const n = (requireValue(b[i] ?? null, "src/apps/text.ts:223") << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0); out += abc.charAt((n >> 18) & 63) + abc.charAt((n >> 12) & 63) + (i + 1 < b.length ? abc.charAt((n >> 6) & 63) : "=") + (i + 2 < b.length ? abc.charAt(n & 63) : "="); } return out;
};

const b64d = (x: string): Uint8Array => {
  x = x.replace(/\s/g, "");
  if (typeof atob === "function") return Uint8Array.from(atob(x), c => c.charCodeAt(0));
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; const out: number[] = [];
  for (let i = 0; i < x.length; i += 4) { const n = (abc.indexOf(requireValue(x[i] ?? null, "src/apps/text.ts:230")) << 18) | (abc.indexOf(requireValue(x[i + 1] ?? null, "src/apps/text.ts:230")) << 12) | ((abc.indexOf(requireValue(x[i + 2] ?? null, "src/apps/text.ts:230")) & 63) << 6) | (abc.indexOf(requireValue(x[i + 3] ?? null, "src/apps/text.ts:230")) & 63); out.push((n >> 16) & 255); if (x.charAt(i + 2) !== "=") out.push((n >> 8) & 255); if (x.charAt(i + 3) !== "=") out.push(n & 255); } return new Uint8Array(out);
};

export class Base64 extends App {
  constructor() { super("base64", "Encode or decode base64 data.", "base64 [-d] [file]"); }
  override async run(s: Sys, a: string[]): Promise<number> { const d = (firstArgument(a)) === "-d"; if (d) a.shift(); const b = (firstArgument(a)) ? s.readb((requireValue(firstArgument(a), "src/apps/text.ts:237"))) : await s.inb(); await s.out(d ? b64d(dec(b)) : b64e(b) + "\n"); return 0; }
}

export class Strings extends App {
  constructor() { super("strings", "Print readable strings in binary data.", "strings [-n length] file ..."); }
  override async run(s: Sys, a: string[]): Promise<number> { let n = 4; if ((firstArgument(a)) === "-n") { a.shift(); const count = takeArgument(a); n = narg(count ?? ""); } for (const p of a) { const x = dec(s.readb(p)); for (const m of x.matchAll(/[\x20-\x7e]+/g)) if (m[0].length >= n) await s.out(m[0] + "\n"); } return 0; }
}
