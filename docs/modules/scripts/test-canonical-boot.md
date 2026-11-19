# Canonical boot regression

The Bun pseudo-terminal test starts the real CLI with a fresh overlay and the custom `.thistle.base`. It waits for interactive input, runs `which dd`, checks `/bin/dd` permissions, executes a byte copy with GNU dd and waits for the prompt again. Temporary state is removed after shutdown.
