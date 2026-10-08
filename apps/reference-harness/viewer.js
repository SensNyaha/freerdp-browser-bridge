const status = document.querySelector('#status');
const canvas = document.querySelector('#desktop');
const certificate = document.querySelector('#certificate');
const fingerprint = document.querySelector('#fingerprint');
let current;
const stats = {
  closed: true,
  frames: 0,
  bytes: 0,
  width: 0,
  height: 0,
  error: undefined,
};
function detach() {
  if (!current) return;
  current.closed = true;
  stats.closed = true;
  current.control.close();
  current.media.close();
  current = undefined;
  certificate.hidden = true;
}
function decide(accept, expectedFingerprint) {
  const session = current;
  if (
    !session?.prompt ||
    (expectedFingerprint && session.prompt.fingerprint !== expectedFingerprint)
  )
    return false;
  session.control.send(
    JSON.stringify({
      v: 1,
      type: 'certificate.response',
      seq: session.controlSequence++,
      ts: Date.now(),
      data: {
        challenge: session.prompt.challenge,
        fingerprint: session.prompt.fingerprint,
        accept,
      },
    }),
  );
  session.prompt = undefined;
  certificate.hidden = true;
  return true;
}
document.querySelector('#accept').addEventListener('click', () => decide(true));
document
  .querySelector('#reject')
  .addEventListener('click', () => decide(false));

/** Same-origin reference consumer. The host application supplies fresh single-use attach tokens. */
function attach(created) {
  detach();
  if (
    !/^[0-9a-f]{32}$/.test(created.sessionId) ||
    !['control', 'media'].every((channel) =>
      /^[A-Za-z0-9_-]{43}$/.test(created.attach[channel].token),
    )
  )
    throw new Error('Invalid attachment');
  Object.assign(stats, {
    closed: false,
    frames: 0,
    bytes: 0,
    width: 0,
    height: 0,
    error: undefined,
  });
  const socket = (channel) => {
    const url = new URL(
      '/v1/sessions/' + created.sessionId + '/' + channel,
      location.href,
    );
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', created.attach[channel].token);
    return new WebSocket(url, 'freerdp-bridge-v1');
  };
  const session = {
    control: socket('control'),
    media: socket('media'),
    controlSequence: 0,
    mediaSequence: 0,
    prompt: undefined,
    decoding: false,
    closed: false,
    configured: false,
  };
  current = session;
  status.textContent = 'Подключение';
  const fail = () => {
    if (session !== current || session.closed) return;
    stats.error = 'MEDIA_OR_CONTROL_FAILED';
    status.textContent = 'Просмотр завершён с ошибкой';
    detach();
  };
  for (const ws of [session.control, session.media])
    ws.addEventListener('close', () => {
      if (!session.closed && session === current) {
        status.textContent = 'Просмотр завершён';
        detach();
      }
    });
  session.control.addEventListener('message', (event) => {
    if (session.closed) return;
    try {
      const message = JSON.parse(event.data);
      if (message.v !== 1) throw new Error();
      if (message.type === 'certificate.prompt') {
        session.prompt = message.data;
        fingerprint.textContent = message.data.fingerprint;
        certificate.hidden = false;
      } else if (message.type === 'session.state')
        status.textContent = message.data.state;
      else if (message.type === 'session.error') fail();
    } catch {
      fail();
    }
  });
  session.control.addEventListener('error', fail);
  session.media.binaryType = 'arraybuffer';
  session.media.addEventListener('open', () =>
    session.media.send(
      JSON.stringify({
        v: 1,
        type: 'media.hello',
        data: { codecs: ['jpeg'] },
      }),
    ),
  );
  session.media.addEventListener('error', fail);
  session.media.addEventListener('message', (event) => {
    void render(event.data).catch(fail);
  });
  async function render(bytes) {
    if (session.closed) return;
    if (typeof bytes === 'string') {
      const message = JSON.parse(bytes);
      if (
        message.v !== 1 ||
        message.type !== 'media.ready' ||
        message.data.codec !== 'jpeg'
      )
        throw new Error();
      return;
    }
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength < 28 ||
      bytes.byteLength > 8 * 1024 * 1024 + 28
    )
      throw new Error();
    const view = new DataView(bytes);
    if (
      view.getUint32(0) !== 0x52574231 ||
      view.getUint8(4) !== 1 ||
      view.getUint32(8) !== 1 ||
      view.getUint32(12) !== session.mediaSequence++ ||
      view.getUint32(24) !== bytes.byteLength - 28 ||
      session.decoding
    )
      throw new Error();
    const type = view.getUint8(5),
      flags = view.getUint16(6);
    if (type === 1) {
      if (
        bytes.byteLength !== 36 ||
        flags !== 2 ||
        view.getUint8(28) !== 1 ||
        view.getUint8(29) !== 2 ||
        view.getUint16(34) !== 0
      )
        throw new Error();
      const width = view.getUint16(30),
        height = view.getUint16(32);
      if (width < 1 || width > 7680 || height < 1 || height > 4320)
        throw new Error();
      canvas.width = width;
      canvas.height = height;
      stats.width = width;
      stats.height = height;
      session.configured = true;
      return;
    }
    if (type !== 2 || !session.configured || ![1, 3].includes(flags))
      throw new Error();
    session.decoding = true;
    let bitmap;
    try {
      bitmap = await createImageBitmap(
        new Blob([bytes.slice(28)], { type: 'image/jpeg' }),
      );
      if (session.closed) return;
      if (bitmap.width !== canvas.width || bitmap.height !== canvas.height)
        throw new Error();
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      stats.frames++;
      stats.bytes += bytes.byteLength - 28;
      session.media.send(
        JSON.stringify({
          v: 1,
          type: 'media.ack',
          data: { sequence: view.getUint32(12) },
        }),
      );
    } finally {
      bitmap?.close();
      session.decoding = false;
    }
  }
}
window.bridgeViewer = {
  attach,
  detach,
  stats,
  acceptCertificate: (expectedFingerprint) => decide(true, expectedFingerprint),
};
window.addEventListener('pagehide', detach);
