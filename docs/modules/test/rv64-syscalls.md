# Real RV64 syscall fixtures

`runGuestSyscalls` builds a small THX2 RV64 executable and runs it through the
canonical loader. `GuestSyscall` specifies the Linux syscall number and register
arguments. A null argument preserves the preceding register, allowing a getpid
result to feed kill without assuming a PID. `GUEST_DATA` is the fixture's guest
data address.

The executable writes syscall results and its data section to an ordinary
captured descriptor before exiting. Tests inspect that output and a credential
snapshot, then reap the child. The helper verifies that the child uses the
kernel's canonical memory. It never installs replacement memory or invokes
private interpreter methods.
