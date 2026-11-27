import { execFileSync } from "node:child_process";
import { fsp } from "./host.js";
import { Asm } from "../../thistle/thistle-asm/asm.js";
import { Link } from "../../thistle/thistle-asm/link.js";
import { codec, Exe } from "../../thistle/thistle-asm/fmt.js";
import { HELLO_TAS, libInc } from "../../thistle/thistle-asm/lib.js";

const fs = fsp();
const root = new URL("../../", import.meta.url);
const src = new URL("src/", root);
const dst = new URL("build/", root);
const assets = new URL("assets/", root);

await fs.mkdir(assets, { recursive: true });
const hello = new Asm((name) => libInc(name), {"defs": {}, "arch": "thistle64",  debug: true }).run(HELLO_TAS, "hello.tas").obj;
const helloThx = codec.pack(new Link().run([hello], {"entry": null, "base": null, "mem": null,  names: ["hello.to"] }).exe);
const rvMessage = new TextEncoder().encode("hello from Thistle RV64GC\n");
const rvWords = [
  (1 << 20 | 10 << 7 | 0x13) >>> 0,
  (0x20 << 12 | 11 << 7 | 0x37) >>> 0,
  (rvMessage.length << 20 | 12 << 7 | 0x13) >>> 0,
  (64 << 20 | 17 << 7 | 0x13) >>> 0,
  0x00000073,
  (10 << 7 | 0x13) >>> 0,
  (93 << 20 | 17 << 7 | 0x13) >>> 0,
  0x00000073,
];
const rvText = new Uint8Array(rvWords.length * 4);
const rvView = new DataView(rvText.buffer);
rvWords.forEach((instruction, index) => rvView.setUint32(index * 4, instruction, true));
const rvHello = new Exe("thistle64");
rvHello.isa = "rv64gc";
rvHello.entry = 0x10000;
rvHello.sec.push(
  { name: ".text", flg: "rx", align: 4096, data: rvText, size: rvText.length, addr: 0x10000 },
  { name: ".rodata", flg: "r", align: 4096, data: rvMessage, size: rvMessage.length, addr: 0x20000 },
);
rvHello.ident.push("Generated RV64GC Thistle execution fixture");
const rvHelloThx = codec.pack(rvHello);
await Promise.all([
  fs.writeFile(new URL("hello.txe", assets), helloThx),
  fs.writeFile(new URL("hello.thx", assets), helloThx),
  fs.writeFile(new URL("hello.39", assets), helloThx),
  fs.writeFile(new URL("hello-rv64.thx", assets), rvHelloThx),
  fs.writeFile(new URL("hello-rv64.39", assets), rvHelloThx),
]);
await fs.mkdir(dst, { recursive: true });
await fs.copyFile(new URL("README.md", root), new URL("README.md", dst));

for (const x of await fs.readdir(src, { withFileTypes: true })) {
  if (!x.isDirectory()) continue;
  try {
    const d = new URL(`${x.name}/`, dst);
    await fs.mkdir(d, { recursive: true });
    await fs.copyFile(new URL(`${x.name}/README.md`, src), new URL("README.md", d));
  // This documented best-effort fallback intentionally continues after the optional operation fails.
  //@cg-expect-warning
  } catch { /* Source-only helper folders don't owe the build a novel. */ }
}

