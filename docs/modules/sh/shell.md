# sh/shell

The shell runs guest commands, pipelines, redirections, jobs and built-ins using a process Sys interface. It preserves environment and descriptor scope across execution and handles history, preferences and here-documents as session state.

Public names: `HereDocRequest`, `Shell`.

`exit` and `logout` set `Shell.exitRequested` and retain their numeric status in `Shell.last`. Command execution stops immediately; command substitutions save and restore the enclosing shell’s exit state. The OS and interactive shell entry points handle the request after normal I/O cleanup.
