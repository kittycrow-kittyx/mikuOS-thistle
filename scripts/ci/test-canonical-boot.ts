import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, Terminal } from "bun";

const root = await mkdtemp(join(tmpdir(), "mikuos-canonical-boot-"));
let output = "";
const terminal = new Terminal({ cols: 100, rows: 30,
  data(_terminal, bytes) { output += new TextDecoder().decode(bytes); },
});
const child = spawn([process.execPath, "mikuos.ts", "--kernel=thistle", "--root", root], { terminal });
const plain = (): string => output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replaceAll("\r", "");
const waitFor = async (pattern: RegExp): Promise<string> => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const text = plain();
    if (pattern.test(text)) return text;
    if (child.exitCode !== null) throw new Error(`mikuOS exited before input was ready: ${text}`);
    await Bun.sleep(20);
  }
  throw new Error(`mikuOS boot or command timed out: ${plain()}`);
};
const command = async (line: string, result: RegExp): Promise<string> => {
  output = "";
  terminal.write(line + "\r");
  return waitFor(result);
};
try {
  const boot = await waitFor(/root@mikuos:[^\n]*# $/);
  assert.match(boot, /Kernel source: Thistle\./);
  console.log("Canonical Thistle boot reached interactive input with .thistle.base");
  await command("which dd", /\n\/bin\/dd\n[\s\S]*root@mikuos:[^\n]*# $/);
  console.log("which dd: /bin/dd");
  const installed = await command("ls -l /bin/dd", /\n-rwx[^\n]+ dd\n[\s\S]*root@mikuos:[^\n]*# $/);
  assert.match(installed, /-rwxr-xr-x/);
  await command("printf canonical-dd > /tmp/dd-input; dd if=/tmp/dd-input of=/tmp/dd-output bs=1 count=12; cat /tmp/dd-output; echo", /\ncanonical-dd\n[\s\S]*root@mikuos:[^\n]*# $/);
  console.log("/bin/dd copied the expected bytes and returned to input");
} finally {
  child.kill();
  await child.exited;
  terminal.close();
  await rm(root, { recursive: true, force: true });
}
