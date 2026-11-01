function getLuciE(): (...args: unknown[]) => HTMLElement {
  if (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { E?: unknown }).E === 'function'
  ) {
    return (window as unknown as { E: (...args: unknown[]) => HTMLElement }).E;
  }
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as unknown as { E?: unknown }).E === 'function'
  ) {
    return (globalThis as unknown as { E: (...args: unknown[]) => HTMLElement })
      .E;
  }
  return (tag: unknown, attrs: unknown, children: unknown) => {
    const el = document.createElement(String(tag));
    if (attrs && typeof attrs === 'object') {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class' && typeof v === 'string') el.className = v;
        else if (typeof v === 'string') el.setAttribute(k, v);
      });
    }
    if (Array.isArray(children)) {
      children.forEach((c) => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else if (c instanceof Node) el.appendChild(c);
      });
    } else if (typeof children === 'string') {
      el.appendChild(document.createTextNode(children));
    }
    return el;
  };
}

export function element(...args: unknown[]): HTMLElement {
  if (
    args.length >= 3 &&
    (typeof args[2] === 'string' || typeof args[2] === 'number')
  ) {
    args[2] = [String(args[2])];
  }
  return getLuciE()(...args);
}

export { element as E };
