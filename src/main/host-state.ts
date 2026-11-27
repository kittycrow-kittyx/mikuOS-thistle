import { requireValue, withValue } from "../../thistle/src/core/err.js";
import { treeFs } from "../../thistle/src/fs/tree.js";
import type { Kern } from "../../thistle/src/core/kernel.js";
import { live, migrateImage, ROOT_IMAGE_VERSION } from "./image.js";
import type { Host, HostState, Os } from "./boot.js";

type HostCapabilities = Pick<Host, "tree" | "pkg" | "requireTree" | "put" | "onBootProgress">;

const snapshot = (k: Kern): ReturnType<typeof treeFs.dump> =>
  treeFs.dump(k.fs).filter(entry =>
    !["/dev", "/proc"].some(path => entry.p === path || entry.p.startsWith(`${path}/`))
  );

/** Bind host persistence and optional package installation to one boot session. */
export function createHostState(host: HostCapabilities): HostState {
  let save = Promise.resolve();

  const flush = async (os: Os): Promise<void> => {
    if (host.tree === null) return;
    const entries = snapshot(os.k);
    save = save.then(async () => {
      const tree = requireValue(host.tree ?? null, "src/main/host-state.ts:flush");
      const merged = await tree.push(entries, ROOT_IMAGE_VERSION);
      if (merged) {
        treeFs.load(os.k.fs, merged);
        live(os.k);
      }
    }, null).catch(async <T>(caughtValue: T) => {
      const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
      os.k.log(`persist: save failed: ${error.message}`);
      await host.put(`Persistence save failed: ${error.message}\n`, "err");
    });
    await save;
  };

  const restore = async (os: Os): Promise<void> => {
    const tree = host.tree;
    if (tree === null) {
      live(os.k);
      return;
    }
    try {
      const entries = await tree.pull();
      withValue(host.onBootProgress ?? null, callback => callback.call(host, 4));
      const before = tree.imageVersion ?? 0;
      if (entries) treeFs.load(os.k.fs, entries);
      os.k.disk = true;
      const after = entries ? migrateImage(os.k, before) : ROOT_IMAGE_VERSION;
      live(os.k);
      if (entries && after !== before) await tree.push(snapshot(os.k), after);
      if (entries) {
        os.k.log(`hostfs: restored / from ${entries.length} entries in ${tree.label}`);
      } else {
        await tree.push(snapshot(os.k), after);
        os.k.log(`hostfs: initialized / in ${tree.label}`);
      }
    } catch (caughtValue) {
      const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
      if (host.requireTree) throw error;
      os.k.disk = false;
      live(os.k);
      os.k.log(`persist: restore failed: ${error.message}`);
      await host.put(`Persistent root was not mounted: ${error.message}\n`, "err");
    }
  };

  const install = async (os: Os): Promise<void> => {
    const pkg = host.pkg;
    if (pkg === null) return;
    try {
      if (await pkg.install(os.k)) {
        live(os.k);
        await flush(os);
      }
    } catch (caughtValue) {
      const error = caughtValue instanceof Error ? caughtValue : new Error(typeof caughtValue === "undefined" ? "undefined" : String(caughtValue));
      const code = withValue((error as Error & { code: string | null } | null) ?? null, value => value.code);
      const message = error.message || `${error.name}${code ? ` (${String(code)})` : ""}`;
      os.k.log(`pkg: install failed: ${message}`);
      await host.put(`Optional root package was not installed: ${message}\n`, "err");
    }
  };

  return { restore, flush, install };
}
