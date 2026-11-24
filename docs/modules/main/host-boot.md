# main/host-boot

`boot(host, net)` supplies hosted startup defaults for the CLI, browser session and integration tests. `Host` reuses the operating-system host contract while the adapter constructs the existing `HostWasiRunner` and supplies `hostNet()` when no network is provided.

Native hosts call `main/boot.boot` with explicit WASI and network capabilities. The pinned kernel also imports hosted defaults, which still pulls `fetch` into the analysed dependency graph.

The hosted entry also obtains the resource ceilings and supplies them to canonical boot, so boot itself does not perform host environment discovery.
