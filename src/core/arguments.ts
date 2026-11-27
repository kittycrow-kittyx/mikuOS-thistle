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

type ArgumentPrefix = [string | null, string | null, string | null];

/** Read the bounded operand prefix shared by unary and binary command forms. */
export function argumentPrefix(arguments_: readonly string[]): ArgumentPrefix {
  const prefix: ArgumentPrefix = [null, null, null];
  let position = 0;
  for (const argument of arguments_) {
    if (position === 3) break;
    prefix[position++] = argument;
  }
  return prefix;
}
