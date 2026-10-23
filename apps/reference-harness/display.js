const outcomes = [
  'applied',
  'unchanged',
  'unavailable',
  'invalid',
  'busy',
  'send-failed',
  'timeout',
  'disconnected',
];
export function resizeResult(value) {
  if (
    !Number.isInteger(value?.requestSeq) ||
    value.requestSeq < 0 ||
    value.requestSeq > 0xffffffff ||
    !outcomes.includes(value.status)
  )
    throw new Error('Invalid display result');
  return value.status;
}
export function displayState(value, previous) {
  const u64 = (text) =>
    typeof text === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(text) &&
    BigInt(text) <= 0xffffffffffffffffn;
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (
    !value ||
    !u64(value.generation) ||
    !u64(value.framebufferRevision) ||
    !integer(value.width, 1, 7680) ||
    !integer(value.height, 1, 4320) ||
    typeof value.dynamicResolution !== 'boolean' ||
    typeof value.negotiated !== 'boolean' ||
    typeof value.resizing !== 'boolean' ||
    value.pixelFormat !== 'BGRA8' ||
    value.desktopScale !== 100 ||
    value.deviceScale !== 100 ||
    value.orientation !== 0 ||
    (value.negotiated
      ? value.maxWidth !== 3840 ||
        value.maxHeight !== 2160 ||
        !integer(value.maxArea, 1, 8294400)
      : value.maxWidth !== 0 || value.maxHeight !== 0 || value.maxArea !== 0)
  )
    throw new Error('Invalid display metadata');
  if (
    previous &&
    (BigInt(value.generation) < BigInt(previous.generation) ||
      (value.generation === previous.generation &&
        (value.width !== previous.width ||
          value.height !== previous.height ||
          value.framebufferRevision !== previous.framebufferRevision)) ||
      (BigInt(value.generation) > BigInt(previous.generation) &&
        BigInt(value.framebufferRevision) <=
          BigInt(previous.framebufferRevision)))
  )
    throw new Error('Stale display metadata');
  return { ...value };
}
export function displayInputReady(session) {
  return (
    !session.resizeRequest &&
    !session.display?.resizing &&
    (!session.display ||
      (session.renderedGeneration === session.display.generation &&
        session.renderedWidth === session.display.width &&
        session.renderedHeight === session.display.height))
  );
}
