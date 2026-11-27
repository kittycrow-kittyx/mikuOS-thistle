/** Read the first supplied command argument, with explicit absence and no copy. */
export function firstArgument(arguments_: readonly string[]): string | null {
  for (const argument of arguments_) return argument;
  return null;
}

/** Consume one argument while retaining the same explicit absence contract. */
export function takeArgument(arguments_: string[]): string | null {
  const argument = firstArgument(arguments_);
  arguments_.shift();
  return argument;
}
