# apps/net

Network commands translate command-line options into bounded device requests. Downloads report HTTP and transport failures separately and write a file only after a complete permitted response has arrived.

Public names: `Wget`.

Each request returns a numeric exit status. The command retains a previous failure when a later request succeeds, and converts rejected I/O into its existing transport or destination error status.
