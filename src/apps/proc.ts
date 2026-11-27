import { firstArgument, takeArgument } from "../core/arguments.js";
import { requireValue } from "../../thistle/src/core/err.js";
import { App } from "../../thistle/src/apps/base.js";
import type { Sys } from "../../thistle/src/core/sys.js";
import type { Sig } from "../../thistle/src/core/proc.js";
import { bad } from "../../thistle/src/core/err.js";
import { narg } from "./util.js";

export class Ps extends App {
  constructor() { super("ps", "Report live kernel processes.", "ps [-ef]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    const all = a.some(x => x.includes("e") || x.includes("f"));
    await s.out("  PID  PPID  PGID UID STAT    TIME COMMAND\n");
    for (const p of s.ps()) if (all || p.ppid === s.pid || p.pid === s.pid) {
      const t = `${Math.floor(p.ms / 60000)}:${String(Math.floor(p.ms / 1000) % 60).padStart(2, "0")}`;
      await s.out(`${String(p.pid).padStart(5)} ${String(p.ppid).padStart(5)} ${String(p.pgid).padStart(5)} ${String(p.uid).padStart(3)} ${p.state.padEnd(6)} ${t.padStart(5)} ${p.cmd}\n`);
    }
    return 0;
  }
}

export class Kill extends App {
  constructor() { super("kill", "Send a signal to a process or process group.", "kill [-SIGNAL] pid ..."); }
  override async run(s: Sys, a: string[]): Promise<number> {
    let sig: Sig = 15;
    const option = firstArgument(a);
    switch (true) {
case !!(option !== null && option.startsWith("-S")): {  const x = requireValue(takeArgument(a), "src/apps/proc.ts:24").slice(1); sig = x === "SIGKILL" ? 9 : x === "SIGINT" ? 2 : x === "SIGPIPE" ? 13 : x === "SIGHUP" ? 1 : 15;
break; }
case !!(/^-(1|2|9|13|15)$/.test(option ?? "")): { sig = Number(requireValue(takeArgument(a), "src/apps/proc.ts:25").slice(1)) as Sig;
break; }
}
    if (!a.length) bad("EINVAL", "kill: missing pid");
    for (const p of a) s.kill(Math.trunc(narg(p, "pid")), sig);
    return 0;
  }
}

/** Parse the sleep command's decimal duration and optional unit suffix. */
export const durationMillis = (duration: string | null): number => {
  if (duration === null) return bad("EINVAL", "sleep: duration required");
  if (!/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.test(duration)) return bad("EINVAL", duration);
  const multiplier = duration.endsWith("ms") ? 1 : duration.endsWith("m") ? 60000 : duration.endsWith("h") ? 3600000 : 1000;
  return Number.parseFloat(duration) * multiplier;
};

export class Sleep extends App {
  constructor() { super("sleep", "Pause for a duration.", "sleep number[s|m|h]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    await s.sleep(durationMillis(firstArgument(a)));
    return 0;
  }
}

export class Time extends App {
  constructor() { super("time", "Run a command and report elapsed time.", "time command [arg ...]"); }
  override async run(s: Sys, a: string[]): Promise<number> {
    if (!a.length) bad("EINVAL", "time: command required");
    const t = performance.now();
    const p = s.start(requireValue(firstArgument(a), "src/apps/proc.ts:49"), a.slice(1));
    const n = await s.wait(p.pid);
    await s.err(`\nreal\t${((performance.now() - t) / 1000).toFixed(3)}s\n`);
    return n;
  }
}
