# apps/proc

Process commands inspect or signal guest processes using the calling session's Sys interface. Their output and exit codes reflect the kernel's process state and access checks rather than the host process table.

Public names: `Ps`, `Kill`, `Sleep`, `Time`, `durationMillis`.

Sleep durations accept non-negative decimal values with milliseconds, seconds, minutes or hours. An omitted unit means seconds; malformed input fails before calling the kernel sleep operation.
