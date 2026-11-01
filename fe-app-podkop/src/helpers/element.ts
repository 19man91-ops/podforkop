function element(...args: unknown[]) {
  if (
    args.length >= 3 &&
    (typeof args[2] === 'string' || typeof args[2] === 'number')
  ) {
    args[2] = [String(args[2])];
  }
  return (E as unknown as (...args: unknown[]) => HTMLElement)(...args);
}

const textE = element as unknown as typeof E;

export { textE as E };
