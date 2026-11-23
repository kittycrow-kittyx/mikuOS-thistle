import { HostWasiRunner } from "../../thistle/src/wasm/host-wasi.js";
import { hostNet } from "../../thistle/src/net/host-fetch.js";
import type { Net } from "../../thistle/src/net/net.js";
import { boot as start } from "./boot.js";
import { createHostState } from "./host-state.js";
import type { Host as RuntimeHost, Os } from "./boot.js";

export type Host = Omit<RuntimeHost, "wasiGuest" | "state">;

/** Supply host capabilities and persistence callbacks to the canonical boot. */
export const boot = (host: Pick<Host, "put"> & Partial<Host>, net: Net | null = null): Os => {
  const resolved: Host = {
    halt: null, tree: null, requireTree: null, pkg: null, config: null,
    account: null, setId: null, onBootProgress: null, ...host,
  };
  return start({
    ...resolved,
    state: createHostState(resolved),
    wasiGuest: new HostWasiRunner(),
  }, net ?? hostNet());
};
