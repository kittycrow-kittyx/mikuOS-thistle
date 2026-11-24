# sh/shell

The shell runs guest commands, pipelines, redirections, jobs and built-ins using a process Sys interface. It preserves environment and descriptor scope across execution and handles history, preferences and here-documents as session state.

Public names: `HereDocRequest`, `Shell`.

`exit` and `logout` set `Shell.exitRequested` and retain their numeric status in `Shell.last`. Command execution stops immediately; command substitutions save and restore the enclosing shell’s exit state. The OS and interactive shell entry points handle the request after normal I/O cleanup.

History recording and command execution have separate asynchronous failure boundaries. History failure warns once without preventing command execution; command failure reports the error and sets status 2. Here-document preparation retains its existing boundary.

History metadata, backup-name probing, saving and clearing are awaited in sequence. Only ENOENT is treated as absence; other filesystem errors propagate to the existing history or command error boundary. These methods retain the permission checks of `Sys.stat` and `Sys.mv`.
