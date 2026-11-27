# Host persistence

`createHostState(host)` binds the host's root-tree persistence and optional
package installer to one canonical mikuOS boot session.

`restore(os)` loads the host tree and migrates stock files when required.
Without a tree, it initialises the live root. Required tree failures propagate;
optional tree failures are logged and leave the live root available.

`flush(os)` serialises snapshots and applies the merged tree returned by the
host. Snapshots exclude virtual `/dev` and `/proc` entries. A failed save
is logged and reported to the host terminal.

`install(os)` applies the optional root package and flushes successful
changes. Installation failures are logged without preventing startup.

The native boot entry receives these operations through the typed `HostState`
interface. The adapter is imported only by `src/main/host-boot.ts`.
