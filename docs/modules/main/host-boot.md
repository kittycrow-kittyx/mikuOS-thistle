# main/host-boot

`boot(host, net)` provides the hosted startup defaults for the CLI, browser session and integration tests. `Host` reuses the operating-system host contract without requiring callers to construct the WASI runner themselves.

The adapter constructs the existing `HostWasiRunner` and uses the supplied network or the existing `hostNet()` implementation. It delegates OS construction to `main/boot`, preserving the hosted networking and WebAssembly guest capabilities. It contains no kernel implementation.

mikuOS boot does not directly import browser and Node adapters. The pinned kernel still imports its own hosted defaults transitively, so this boundary alone does not make the complete graph host-independent. Native hosts call `main/boot.boot` with their explicit host capabilities and network instead. This module does not implement a native host bridge.
