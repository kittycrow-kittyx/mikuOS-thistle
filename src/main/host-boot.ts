import { HostWasiRunner } from "../../thistle/src/wasm/host-wasi.js";
import { hostNet } from "../../thistle/src/net/host-fetch.js";
import type { Net } from "../../thistle/src/net/net.js";
import { boot as start } from "./boot.js";
import type { Host as RuntimeHost, Os } from "./boot.js";

export type Host = Omit<RuntimeHost, "wasiGuest">;

/** Compose the real JavaScript host adapters outside the native operating-system graph. */
export const boot = (host: Pick<Host, "put"> & Partial<Host>, net: Net | null = null): Os => start({
  halt: null, tree: null, requireTree: null, pkg: null, config: null,
  account: null, setId: null, onBootProgress: null, ...host,
  wasiGuest: new HostWasiRunner(),
}, net ?? hostNet());
