// This module composes kernel, toolchain or integration-test boundaries and intentionally imports their contracts.
//@cg-expect-warning
import type { WasmGuestRunner } from "../../thistle/src/wasm/guest-runner.js";
import { ensure } from "../../thistle/src/core/err.js";
import type { KernelOptions } from "../../thistle/src/core/host-options.js";
import { withValue } from "../../thistle/src/core/err.js";
import { Kern } from "../../thistle/src/core/kernel.js";
import { Sys } from "../../thistle/src/core/sys.js";
import { Tty } from "../../thistle/src/io/tty.js";
import { Shell } from "../sh/shell.js";
import { image, live } from "./image.js";
import { norm } from "../../thistle/src/fs/vfs.js";
import { Net } from "../../thistle/src/net/net.js";
import type { Tree } from "../../thistle/src/fs/tree.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import type { AccountConfig, SystemConfig } from "../core/config.js";

export type Ch = "out" | "err" | "sys" | "in";

export interface HostState {
  restore(os: Os): Promise<void>;
  flush(os: Os): Promise<void>;
  install(os: Os): Promise<void>;
}

export interface Host {
  state: HostState | null;
  lim: KernelOptions["lim"];
  wasiGuest: WasmGuestRunner;
  put(s: string, ch: Ch): void | Promise<void>;
  halt: (() => void) | null;
  tree: Tree | null;
  requireTree: boolean | null;
  pkg: { install(kernel: Kern): Promise<boolean> } | null;
  config: SystemConfig | null;
  account: AccountConfig | null;
  setId: boolean | null;
  /** Real browser startup milestones; no simulated elapsed-time progress. */
  onBootProgress: ((phase: number) => void) | null;
}

export class Os {
  readonly k;
  readonly p;
  readonly s;
  readonly sh;
  readonly tty;
  readonly ready: Promise<void>;
  busy = false;
  readonly activeKernelMode = "thistle";

  constructor(readonly host: Host, net: Net) {
    const config = host.config ?? DEFAULT_CONFIG;
    this.k = new Kern({ net, config, lim: host.lim, setId: host.setId ?? false, wasiGuest: host.wasiGuest });
    this.k.ttyFn = (x, e) => { Promise.resolve(host.put(x, e ? "err" : "out")).catch(console.error); };
    image(this.k);
    this.tty = new Tty(
      (x, e) => host.put(x, e ? "err" : "out"),
      n => n === 2 ? this.sh.interrupt() : false,
    );
    this.p = this.k.session({ sin: this.tty.input, sout: this.tty.output, serr: this.tty.error }, host.account ?? config.accounts.cli);
    // Restore the canonical root before retaining a home-directory inode.
    // Root replacement deliberately refuses live non-root cwd references.
    const initialDirectory = this.p.cwd;
    this.p.cwd = "/";
    this.s = new Sys(this.k, this.p);
    this.sh = new Shell(this.s);
    this.k.setHalt(() => withValue(host.halt, callable => callable.call(host)));
    this.k.log("thsh: interactive session ready");
    this.ready = this.init(initialDirectory);
  }

  async hello(): Promise<void> {
    await this.ready;
    if (!this.sh.prefs.showWelcome) return;
    try {
      const motd = this.s.read("/etc/motd");
      await this.host.put(motd, "sys");
    }
    // This documented best-effort fallback intentionally continues after the optional operation fails.
    //@cg-expect-warning
    catch { /* A deleted motd should not brick the login. */ }
  }

  async run(
    line: string,
    heredocBodies: readonly string[] = [],
    recordHistory = true,
  ): Promise<number> {
    await this.ready;
    this.busy = true;
    try {
      const code = await this.sh.run(line, recordHistory, heredocBodies);
      if (this.sh.exitRequested) {
        this.sh.exitRequested = false;
        withValue(this.host.halt, callable => callable.call(this.host));
      }
      return code;
    }
    finally {
      this.busy = false;
      this.tty.reset();
      await this.flush();
    }
  }

  input(s: string | Uint8Array): void { this.tty.feed(s); }
  resize(rows: number, cols: number): void { this.tty.resize(rows, cols); }
  prompt(): string { return this.sh.prompt(); }
  interrupt(): void { this.sh.interrupt(); }
  complete(line: string): { line: string; list: string[] } { return this.sh.complete(line); }

  load(name: string, b: Uint8Array, mode = 0o755): string {
    const safe = name.replace(/[^A-Za-z0-9._+-]/g, "_") || "guest.thx";
    const p = norm(`/tmp/${safe}`);
    try { this.s.writeb(p, b); } catch { this.s.mkfile(p, b, mode); }
    this.s.chmod(p, mode);
    return p;
  }

  async flush(): Promise<void> {
    if (this.host.state !== null) await this.host.state.flush(this);
  }

  private async restore(): Promise<void> {
    if (this.host.state !== null) await this.host.state.restore(this);
    else live(this.k);
  }

  private async configureKernelMode(): Promise<void> {
    withValue(this.host.onBootProgress, callable => callable.call(this.host, 5));
    this.k.name = "Thistle";
    this.p.env.set("MIKUOS_KERNEL_MODE", "thistle");
    this.p.env.delete("THISTLE_RV_CORE");
    this.p.env.delete("THISTLE_PORTABLE_PROBE");
    this.p.env.delete("THISTLE_TETO_STRICT");
    this.k.executionCore = "Thistle TypeScript";
  }

  private async init(initialDirectory: string): Promise<void> {
    await this.restore();
    await this.configureKernelMode();
    withValue(this.host.onBootProgress, callable => callable.call(this.host, 6));
    if (this.host.state !== null) await this.host.state.install(this);
    this.p.cwd = initialDirectory;
    this.sh.ensureUserState(true);
  }

}

export const boot = (host: Host, net: Net): Os => new Os(host, net);
