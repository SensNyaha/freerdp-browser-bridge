/** Bounded readiness metadata; no capability inferred from a pointer event. */
export function touchState(value, previous) {
  const u64 = (text) =>
    typeof text === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(text) &&
    BigInt(text) <= 0xffffffffffffffffn;
  const integer = (n, max) => Number.isInteger(n) && n > 0 && n <= max;
  if (
    !value ||
    !u64(value.revision) ||
    !u64(value.generation) ||
    !integer(value.width, 7680) ||
    !integer(value.height, 4320) ||
    typeof value.enabled !== 'boolean' ||
    ![
      'unavailable',
      'ready',
      'suspended',
      'draining',
      'handshake',
      'incompatible',
    ].includes(value.availability) ||
    (!value.enabled && value.availability !== 'unavailable') ||
    (value.availability === 'ready'
      ? !integer(value.maxContacts, 10)
      : value.maxContacts !== 0) ||
    (previous &&
      (BigInt(value.revision) <= BigInt(previous.revision) ||
        BigInt(value.generation) < BigInt(previous.generation) ||
        (value.generation === previous.generation &&
          (value.width !== previous.width ||
            value.height !== previous.height))))
  )
    throw new Error('Invalid touch metadata');
  return { ...value };
}
export function touchInputReady(session) {
  const state = session.touch;
  return state?.enabled &&
    state.availability === 'ready' &&
    session.display &&
    !session.display.resizing &&
    !session.resizeRequest &&
    session.display.generation === state.generation &&
    session.renderedGeneration === state.generation &&
    session.renderedWidth === state.width &&
    session.renderedHeight === state.height &&
    session.display.width === state.width &&
    session.display.height === state.height
    ? { generation: state.generation, maxContacts: state.maxContacts }
    : undefined;
}
