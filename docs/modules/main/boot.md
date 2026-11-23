# main/boot

Boot combines configuration, image construction, persistence and kernel-mode selection into a guest operating-system session. Readiness resolves only after restoration and validation; output callbacks and snapshots belong to the supplied host.

`boot(host, net)` and `Os(host, net)` require an explicit network and a concrete `Host`. The host supplies its `wasiGuest` capability. This module imports capability contracts rather than browser or Node adapter implementations. Hosted callers use [main/host-boot](host-boot.md) to retain the normal startup defaults.

Public names: `Ch`, `Host`, `HostState`, `Os`, `boot`.

`HostState` supplies the asynchronous `restore(os)`, `flush(os)` and `install(os)` callbacks. Hosted construction uses [main/host-state](host-state.md) to provide the actual implementations.

`Os.run` consumes the shell’s explicit exit request and calls the host halt callback. Its existing finalisation still clears busy state, resets terminal input and flushes persistence.
