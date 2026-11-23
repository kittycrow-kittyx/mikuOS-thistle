import { Lim } from "../../thistle/src/core/cap.js";
import type { SystemConfig } from "../../thistle/src/core/config.js";
import type { Net } from "../../thistle/src/net/net.js";
import type { WasmGuestRunner } from "../../thistle/src/wasm/guest-runner.js";

/**
 * The canonical mikuOS integration supplies every kernel capability explicitly.
 * Neither its native target nor its hosted boot needs Thistle's implicit
 * browser/Node network and WASI providers.
 */
export interface KernelOptions {
  net: Net;
  lim: Lim;
  config: SystemConfig;
  setId: boolean;
  wasiGuest: WasmGuestRunner;
}

export const kernelOptions = (
  net: Net,
  config: SystemConfig,
  setId: boolean,
  wasiGuest: WasmGuestRunner,
): KernelOptions => ({
  net,
  lim: Lim.host(),
  config,
  setId,
  wasiGuest,
});

/** Fail closed if another caller attempts an implicit host dependency. */
export const defaultKernelOptions = (): KernelOptions => {
  throw new Error("mikuOS requires explicit kernel options; implicit host adapters are unavailable");
};
