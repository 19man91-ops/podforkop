export function parseHostPort(hostPortPart: string): { host: string; port: string } {
  const trimmed = hostPortPart.trim();
  if (trimmed.startsWith('[')) {
    const bracketIndex = trimmed.indexOf(']');
    if (bracketIndex !== -1) {
      const host = trimmed.slice(1, bracketIndex);
      const rest = trimmed.slice(bracketIndex + 1);
      const port = rest.startsWith(':') ? rest.slice(1) : '';
      return { host, port };
    }
  }
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon !== -1) {
    return {
      host: trimmed.slice(0, lastColon),
      port: trimmed.slice(lastColon + 1),
    };
  }
  return { host: trimmed, port: '' };
}
