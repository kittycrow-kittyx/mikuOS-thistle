import { App } from "../../thistle/src/apps/base.js";
import type { Sys } from "../../thistle/src/core/sys.js";
import { dec } from "../../thistle/src/io/stream.js";
import { Exe, codec, isExe, isObj } from "../../thistle/thistle-asm/fmt.js";

export class FileApp extends App {
  constructor() { super("file", "Identify executable and data formats.", "file path ..."); }
  // App.run is the required polymorphic command entry point, including stateless commands.
  //@cg-expect-warning
  override async run(s: Sys, a: string[]): Promise<number> {
    for (const p of a) {
      const st = s.stat(p, false); let k: string = st.kind;
      if (st.kind === "file") { const b = s.readb(p); const x = dec(b.slice(0, 80)); switch (true) {
case !!(b.length >= 4 && new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, false) === 0x0061736d): { k = "WebAssembly binary module";
break; }
case !!(isExe(b) || isObj(b)): {  const q = codec.unpack(b); k = `Thistle ${q.machine}${q instanceof Exe ? ` ${q.isa}` : ""} ${isExe(b) ? "native executable" : "relocatable object"}`;
break; }
default: {
  const end = x.indexOf("\n"), firstLine = x.slice(0, end < 0 ? x.length : end);
  k = x.startsWith("#!") ? `script, ${firstLine}` : b.every(v => v === 9 || v === 10 || v === 13 || v >= 32 && v < 127) ? "UTF-8 text" : "data";
}
} }
      await s.out(`${p}: ${k}\n`);
    }
    return a.length ? 0 : 1;
  }
}
