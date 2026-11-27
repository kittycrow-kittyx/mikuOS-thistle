import { hostLimits } from "../../thistle/src/host/limits.js";
import { HostWasiRunner } from "../../thistle/src/wasm/host-wasi.js";
import { hostNet } from "../../thistle/src/net/host-fetch.js";
import type { Net } from "../../thistle/src/net/net.js";
import { boot as start } from "./boot.js";
import { createHostState } from "./host-state.js";
import type { Host as RuntimeHost, Os } from "./boot.js";

// The hosted API intentionally omits its internally created WASI and state adapters.
export type Host = Omit<RuntimeHost, "wasiGuest" | "state" | "lim">;

/** Supply host capabilities and persistence callbacks to the canonical boot. */
export const boot = (host: Pick<Host, "put"> & Partial<Host>, net: Net | null = null): Os => {
  const resolved: Host = {
    halt: null, tree: null, requireTree: null, pkg: null, config: null,
    account: null, setId: null, onBootProgress: null, ...host,
  };
  return start({
    ...resolved,
    state: createHostState(resolved),
    lim: hostLimits(),
    wasiGuest: new HostWasiRunner(),
  }, net ?? hostNet());
};
