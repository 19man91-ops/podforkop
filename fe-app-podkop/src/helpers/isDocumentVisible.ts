export function isDocumentVisible() {
  return (
    typeof document === 'undefined' ||
    !document.visibilityState ||
    document.visibilityState === 'visible'
  );
}

export function whenDocumentVisible(callback: () => void) {
  if (isDocumentVisible()) {
    callback();
    return;
  }

  const onChange = () => {
    if (!isDocumentVisible()) {
      return;
    }
    document.removeEventListener('visibilitychange', onChange);
    callback();
  };
  document.addEventListener('visibilitychange', onChange);
}
