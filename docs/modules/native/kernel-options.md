# Native kernel host options

mikuOS imports the **canonical pinned Thistle** kernel. This module defines
the small integration contract used to pass network, limits, configuration,
set-ID policy and WASI guest execution into the kernel explicitly.

## Exports

- `KernelOptions`: structured host capability contract, matching Thistle's
  pinned `KernelOptions` interface.
- `kernelOptions(net, config, capabilities)`: constructs that contract with
  an explicitly supplied resource-limit, set-ID and WASI record. Resource
  discovery occurs only in `src/main/host-boot.ts`.
- `defaultKernelOptions()`: rejects implicit host configuration with an
  explicit error. Native mikuOS must provide options; this function never
  invents network access or a WASI runner.

## Lowering boundary

The canonical `src/main/boot.ts` always constructs `Kern` using
`kernelOptions()`. During native/WASM source lowering, Leek rebinds only
Thistle's unused default host-options import in the **staged** pinned kernel
source to this module. It does not edit upstream Thistle, supply a second
kernel, suppress Bake diagnostics or replace mikuOS source.

Hosted mikuOS retains its real supplied `Net` and `WasmGuestRunner`.
A missing explicit host provider remains a hard error. The import binding
is native-specific and does not claim that remaining hosted runtime modules
have already been migrated.
