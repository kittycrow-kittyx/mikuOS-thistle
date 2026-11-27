# Terminal key bindings

`bindingNames` splits a comma-separated binding list. `keySequences` resolves aliases, supported terminal escape sequences and hexadecimal byte notation. `keyMatches` compares input against the resolved sequences, and `keyBindingWarnings` reports unrecognised names. The table accepts several terminal encodings of modified arrow keys.

Aliases and sequence names use frozen records. Own-key checks narrow the input
to a supported name before lookup; unknown names keep the existing fallback.
