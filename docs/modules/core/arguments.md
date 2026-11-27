# Command argument access

`firstArgument` reads the first supplied command argument or returns null when
there are no arguments. Reading stops after the first argument.
`takeArgument` consumes that first argument with the same nullable result.
Commands retain the upstream `requireValue` check for required operands.

`argumentPrefix` reads at most three operands into an explicitly nullable tuple,
shared by bounded command forms and shell built-ins.
