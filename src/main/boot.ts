// This module composes kernel, toolchain or integration-test boundaries and intentionally imports their contracts.
//@cg-expect-warning
import type { WasmGuestRunner } from "../../thistle/src/wasm/guest-runner.js";
import { ensure } from "../../thistle/src/core/err.js";
import { kernelOptions } from "../native/kernel-options.js";
import { withValue } from "../../thistle/src/core/err.js";
import { requireValue } from "../../thistle/src/core/err.js";
import { Kern } from "../../thistle/src/core/kernel.js";
import { Sys } from "../../thistle/src/core/sys.js";
import { Tty } from "../../thistle/src/io/tty.js";
import { Shell } from "../sh/shell.js";
import { image, live, migrateImage, ROOT_IMAGE_VERSION } from "./image.js";
import { norm } from "../../thistle/src/fs/vfs.js";
import { Net } from "../../thistle/src/net/net.js";
import { treeFs } from "../../thistle/src/fs/tree.js";
import type { Tree } from "../../thistle/src/fs/tree.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import type { AccountConfig, SystemConfig } from "../core/config.js";

export type Ch = "out" | "err" | "sys" | "in";

export interface Host {
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
  private save = Promise.resolve();

  constructor(readonly host: Host, net: Net) {
    const config = host.config ?? DEFAULT_CONFIG;
    this.k = new Kern(kernelOptions(net, config, host.setId ?? false, host.wasiGuest));
    this.k.ttyFn = (x, e) => { Promise.resolve(host.put(x, e ? "err" : "out")).catch(console.error); };
    image(this.k);
    this.tty = new Tty(
      (x, e) => host.put(x, e ? "err" : "out"),
      n => n === 2 ? this.sh.interrupt() : false,
    );
    this.p = this.k.session({ sin: this.tty.input, sout: this.tty.output, serr: this.tty.error }, host.account ?? config.accounts.cli);
    this.s = new Sys(this.k, this.p);
    this.sh = new Shell(this.s);
    this.k.setHalt(() => withValue(host.halt ?? null, callable => callable.call(host)));
    this.k.log("thsh: interactive session ready");
    this.ready = this.init();
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
        withValue(this.host.halt ?? null, callable => callable.call(this.host));
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
    if (!this.host.tree) return;
    const ent = this.snapshot();
    this.save = this.save.then(async () => {
      const merged = await requireValue(this.host.tree ?? null, "src/main/boot.ts:123").push(ent, ROOT_IMAGE_VERSION);
      if (merged) {
        treeFs.load(this.k.fs, merged);
        live(this.k);
      }
    }, null).catch(async <T>(caughtValue: T) => { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
      this.k.log(`persist: save failed: ${e instanceof Error ? e.message : String(e)}`);
      await this.host.put(`Persistence save failed: ${e instanceof Error ? e.message : String(e)}\n`, "err");
     });
    await this.save;
  }

  private async restore(): Promise<void> {
    if (!this.host.tree) { live(this.k); return; }
    try {
      const ent = await this.host.tree.pull();
      withValue(this.host.onBootProgress ?? null, callable => callable.call(this.host, 4));
      const before = this.host.tree.imageVersion ?? 0;
      if (ent) treeFs.load(this.k.fs, ent);
      this.k.disk = true;
      const after = ent ? migrateImage(this.k, before) : ROOT_IMAGE_VERSION;
      live(this.k);
      if (ent) {
        (after !== before) && (await this.host.tree.push(this.snapshot(), after));
        this.k.log(`hostfs: restored / from ${ent.length} entries in ${this.host.tree.label}`);
      } else {
        await this.host.tree.push(this.snapshot(), after);
        this.k.log(`hostfs: initialized / in ${this.host.tree.label}`);
      }
    } catch (caughtValue) { const e = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
      if (this.host.requireTree) throw e;
      this.k.disk = false;
      live(this.k);
      this.k.log(`persist: restore failed: ${e instanceof Error ? e.message : String(e)}`);
      await this.host.put(`Persistent root was not mounted: ${e instanceof Error ? e.message : String(e)}\n`, "err");
    }
  }


  private async configureKernelMode(): Promise<void> {
    withValue(this.host.onBootProgress ?? null, callable => callable.call(this.host, 5));
    this.k.name = "Thistle";
    this.p.env.set("MIKUOS_KERNEL_MODE", "thistle");
    this.p.env.delete("THISTLE_RV_CORE");
    this.p.env.delete("THISTLE_PORTABLE_PROBE");
    this.p.env.delete("THISTLE_TETO_STRICT");
    this.k.executionCore = "Thistle TypeScript";
  }

  private async init(): Promise<void> {
    await this.restore();
    await this.configureKernelMode();
    withValue(this.host.onBootProgress ?? null, callable => callable.call(this.host, 6));
    this.sh.ensureUserState(true);
    if (this.host.pkg) {
      try {
        // An installed package is flushed only after its successful guest-tree update.
        //@cg-expect-warning
        if (await this.host.pkg.install(this.k)) {
          live(this.k);
          await this.flush();
        }
      } catch (caughtValue) { const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
        const code = withValue((error as Error & { code: string | null } | null) ?? null, value => value.code);
        const message = error instanceof Error && error.message
          ? error.message
          : `${error instanceof Error ? error.name : "Error"}${code ? ` (${String(code)})` : ""}`;
        this.k.log(`pkg: install failed: ${message}`);
        await this.host.put(`Optional root package was not installed: ${message}\n`, "err");
      }
    }
  }

  private snapshot(): ReturnType<typeof treeFs.dump> {
    return treeFs.dump(this.k.fs).filter(entry =>
      !["/dev", "/proc"].some(path => entry.p === path || entry.p.startsWith(`${path}/`)),
    );
  }
}

export const boot = (host: Host, net: Net): Os => new Os(host, net);
