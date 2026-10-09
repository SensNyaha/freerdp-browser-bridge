import { installInput } from './input.js';
import { installCursor } from './cursor.js';
import { displayState, resizeResult, displayInputReady } from './display.js';
const status = document.querySelector('#status');
const canvas = document.querySelector('#desktop');
const certificate = document.querySelector('#certificate');
const fingerprint = document.querySelector('#fingerprint');
const resizeForm = document.querySelector('#resize');
const resizeButton = document.querySelector('#resize-button');
const resizeStatus = document.querySelector('#resize-status');
let current;
const stats = {
  closed: true,
  frames: 0,
  cursorShapes: 0,
  bytes: 0,
  width: 0,
  height: 0,
  error: undefined,
  codec: undefined,
  maxFps: undefined,
  resets: 0,
  keyframes: 0,
  configurations: 0,
  displayGeneration: undefined,
  renderedGeneration: undefined,
  resizeStatus: undefined,
  stage: 'waiting',
};
let decodeTimes = [];
class DecodeFailure extends Error {}
function closeDecoder(session) {
  const decoder = session.decoder;
  session.decoder = undefined;
  if (decoder && decoder.state !== 'closed') decoder.close();
}
function detach() {
  if (!current || current.detaching) return;
  current.detaching = true;
  current.disposeInput?.();
  current.cursor?.dispose();
  current.closed = true;
  if (current.resizeRequest) {
    clearTimeout(current.resizeRequest.timer);
    current.resizeRequest.reject(new Error('Viewer detached'));
    current.resizeRequest = undefined;
  }
  stats.closed = true;
  current.abortDecode?.();
  closeDecoder(current);
  current.control.close();
  current.media.close();
  current = undefined;
  certificate.hidden = true;
  updateResize();
}
function updateResize() {
  const state = current?.display;
  resizeButton.disabled =
    !current?.connected ||
    !state?.dynamicResolution ||
    !state.negotiated ||
    Boolean(current.resizeRequest) ||
    state.resizing;
  resizeStatus.textContent = state
    ? `${state.width} × ${state.height}${current.resizeRequest || state.resizing ? ' — изменение размера' : ''}${stats.resizeStatus ? ' · ' + stats.resizeStatus : ''}`
    : 'Ожидание параметров дисплея';
}
function resize(width, height, deviceScale = 1) {
  const session = current;
  if (
    !session ||
    !session.connected ||
    session.control.readyState !== WebSocket.OPEN ||
    session.control.bufferedAmount > 16384
  )
    return Promise.reject(new Error('Control unavailable'));
  if (session.resizeRequest) return Promise.resolve('busy');
  const seq = session.controlSequence++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (session.resizeRequest?.seq !== seq) return;
      session.resizeRequest = undefined;
      stats.resizeStatus = 'timeout';
      updateResize();
      reject(new Error('Display response deadline'));
    }, 8000);
    session.resizeRequest = { seq, resolve, reject, timer };
    updateResize();
    session.control.send(
      JSON.stringify({
        v: 1,
        type: 'display.resize.request',
        seq,
        ts: Date.now(),
        data: { width, height, deviceScale },
      }),
    );
  });
}
resizeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void resize(
    Number(document.querySelector('#resize-width').value),
    Number(document.querySelector('#resize-height').value),
  ).catch(() => {
    resizeStatus.textContent = 'Не удалось получить ответ на изменение размера';
  });
});
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
function attach(created, options = {}) {
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
    cursorShapes: 0,
    bytes: 0,
    width: 0,
    height: 0,
    error: undefined,
    codec: undefined,
    maxFps: undefined,
    resets: 0,
    keyframes: 0,
    configurations: 0,
    displayGeneration: undefined,
    renderedGeneration: undefined,
    resizeStatus: undefined,
    stage: 'waiting',
  });
  decodeTimes = [];
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
    connected: false,
    mediaSequence: 0,
    prompt: undefined,
    decoding: false,
    closed: false,
    configured: false,
    decoder: undefined,
    abortDecode: undefined,
    codec: undefined,
    needKeyframe: true,
    timestamp: undefined,
    queued: 0,
    queuedBytes: 0,
    cursor: installCursor(canvas),
  };
  current = session;
  session.disposeInput = installInput(
    canvas,
    (type, data) => {
      if (
        session.control.readyState !== WebSocket.OPEN ||
        session.control.bufferedAmount > 16384
      )
        return false;
      session.control.send(
        JSON.stringify({
          v: 1,
          type,
          seq: session.controlSequence++,
          ts: Date.now(),
          data,
        }),
      );
      return true;
    },
    () =>
      !session.closed &&
      session.connected &&
      session === current &&
      displayInputReady(session),
    () => detach(),
  );
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
      } else if (message.type === 'session.state') {
        session.connected = message.data.state === 'connected';
        status.textContent = message.data.state;
        updateResize();
      } else if (['display.info', 'display.resize'].includes(message.type)) {
        session.display = displayState(message.data, session.display);
        stats.displayGeneration = session.display.generation;
        updateResize();
      } else if (message.type === 'display.resize.result') {
        const result = resizeResult(message.data);
        if (session.resizeRequest?.seq === message.data.requestSeq) {
          const pending = session.resizeRequest;
          clearTimeout(pending.timer);
          session.resizeRequest = undefined;
          stats.resizeStatus = result;
          updateResize();
          pending.resolve(result);
        }
      } else if (message.type === 'input.paused') {
        status.textContent = 'Ввод приостановлен на время изменения дисплея';
      } else if (message.type === 'cursor.position')
        session.cursor.position(message.data);
      else if (message.type === 'cursor.visibility')
        session.cursor.visibility(message.data);
      else if (message.type === 'session.error') fail();
    } catch {
      fail();
    }
  });
  session.control.addEventListener('error', fail);
  session.media.binaryType = 'arraybuffer';
  let offered;
  session.media.addEventListener('open', () => {
    void negotiate().catch(fail);
  });
  async function negotiate() {
    stats.stage = 'negotiate';
    const requested = options.codecs ?? ['h264', 'jpeg'];
    if (
      !Array.isArray(requested) ||
      requested.length < 1 ||
      requested.length > 2 ||
      new Set(requested).size !== requested.length ||
      requested.some((codec) => !['h264', 'jpeg'].includes(codec))
    )
      throw new Error();
    let h264 = false;
    if (requested.includes('h264') && typeof VideoDecoder === 'function')
      h264 = (
        await VideoDecoder.isConfigSupported({
          codec: 'avc1.42E028',
          optimizeForLatency: true,
        })
      ).supported;
    offered = requested.filter((codec) => codec === 'jpeg' || h264);
    if (!offered.length) throw new Error();
    if (session.closed) return;
    session.media.send(
      JSON.stringify({
        v: 1,
        type: 'media.hello',
        data: { codecs: offered, cursor: true, display: true },
      }),
    );
  }
  session.media.addEventListener('error', fail);
  let rendering = Promise.resolve();
  session.media.addEventListener('message', (event) => {
    if (session.closed) return;
    if (
      event.data instanceof ArrayBuffer &&
      event.data.byteLength >= 6 &&
      new DataView(event.data).getUint8(5) === 5
    ) {
      try {
        session.cursor.shape(event.data);
        stats.cursorShapes++;
      } catch {
        fail();
      }
      return;
    }
    const size =
      typeof event.data === 'string'
        ? event.data.length * 2
        : event.data.byteLength;
    if (
      ++session.queued > 5 ||
      (session.queuedBytes += size) > 8 * 1024 * 1024 + 8192
    ) {
      fail();
      return;
    }
    rendering = rendering
      .then(() => render(event.data))
      .catch(fail)
      .finally(() => {
        session.queued--;
        session.queuedBytes -= size;
      });
  });
  function acknowledge(sequence) {
    session.media.send(
      JSON.stringify({ v: 1, type: 'media.ack', data: { sequence } }),
    );
  }
  function draw(image) {
    const width = image.displayWidth ?? image.width,
      height = image.displayHeight ?? image.height;
    if (width !== canvas.width || height !== canvas.height)
      throw new DecodeFailure();
    canvas.getContext('2d').drawImage(image, 0, 0);
    stats.frames++;
    session.renderedGeneration = stats.renderedGeneration =
      session.configuredGeneration;
    session.renderedWidth = width;
    session.renderedHeight = height;
  }
  async function configureAvc(description) {
    closeDecoder(session);
    if (
      typeof VideoDecoder !== 'function' ||
      description.length < 17 ||
      description.length > 2059 ||
      description[0] !== 1 ||
      description[4] !== 255 ||
      description[5] !== 225
    )
      throw new Error();
    const config = {
      codec:
        'avc1.' +
        Array.from(description.subarray(1, 4), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
      description,
      codedWidth: canvas.width,
      codedHeight: canvas.height,
      optimizeForLatency: true,
    };
    if (!(await VideoDecoder.isConfigSupported(config)).supported)
      throw new Error();
    if (session.closed) return;
    let pending;
    const decoder = new VideoDecoder({
      output(frame) {
        try {
          if (session.closed || session.decoder !== decoder) return;
          if (!pending) {
            fail();
            return;
          }
          if (frame.timestamp !== pending.timestamp) throw new DecodeFailure();
          draw(frame);
        } catch {
          pending?.reject(new DecodeFailure());
          return;
        } finally {
          frame.close();
        }
        pending.resolve();
      },
      error() {
        pending?.reject(new DecodeFailure());
      },
    });
    decoder.configure(config);
    session.decoder = decoder;
    session.decode = (data, timestamp, keyframe) =>
      new Promise((resolve, reject) => {
        if (pending || decoder.decodeQueueSize > 0) {
          reject(new DecodeFailure());
          return;
        }
        const finish = (error) => {
          if (!pending) return;
          clearTimeout(timer);
          pending = undefined;
          session.abortDecode = undefined;
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => finish(new DecodeFailure()), 1500);
        pending = { timestamp, resolve: () => finish(), reject: finish };
        session.abortDecode = () => finish(new DecodeFailure());
        try {
          decoder.decode(
            new EncodedVideoChunk({
              type: keyframe ? 'key' : 'delta',
              timestamp,
              data,
            }),
          );
        } catch {
          finish(new DecodeFailure());
        }
        // Per-frame flush would require a new keyframe for every following decode.
      });
    session.needKeyframe = true;
  }
  async function render(bytes) {
    if (session.closed) return;
    if (typeof bytes === 'string') {
      const message = JSON.parse(bytes);
      if (
        message.v === 1 &&
        ['display.info', 'display.resize'].includes(message.type)
      ) {
        session.streamDisplay = displayState(
          message.data,
          session.streamDisplay,
        );
        return;
      }
      if (
        message.v !== 1 ||
        message.type !== 'media.ready' ||
        session.codec ||
        !offered?.includes(message.data.codec) ||
        message.data.maxInFlight !== 1
      )
        throw new Error();
      if (
        !Number.isInteger(message.data.maxFps) ||
        message.data.maxFps < 1 ||
        message.data.maxFps > (message.data.codec === 'h264' ? 30 : 20)
      )
        throw new Error();
      session.codec = stats.codec = message.data.codec;
      stats.maxFps = message.data.maxFps;
      stats.stage = 'ready';
      return;
    }
    if (
      !session.codec ||
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
      stats.stage = 'config';
      if (
        bytes.byteLength < 36 ||
        flags !== 2 ||
        view.getUint8(28) !== 1 ||
        view.getUint8(29) !== (session.codec === 'h264' ? 1 : 2) ||
        view.getUint16(34) !== 0
      )
        throw new Error();
      const width = view.getUint16(30),
        height = view.getUint16(32);
      if (width < 1 || width > 7680 || height < 1 || height > 4320)
        throw new Error();
      if (session.codec === 'jpeg' && bytes.byteLength !== 36)
        throw new Error();
      if (
        session.codec === 'h264' &&
        (width < 16 ||
          height < 16 ||
          width > 3840 ||
          height > 2160 ||
          width % 2 ||
          height % 2)
      )
        throw new Error();
      canvas.width = width;
      canvas.height = height;
      session.cursor.displayReset();
      stats.width = width;
      stats.height = height;
      if (
        session.streamDisplay &&
        (width !== session.streamDisplay.width ||
          height !== session.streamDisplay.height)
      )
        throw new Error('Display config mismatch');
      session.configuredGeneration = session.streamDisplay?.generation;
      stats.configurations++;
      if (session.codec === 'h264')
        await configureAvc(new Uint8Array(bytes, 36));
      session.configured = true;
      return;
    }
    if (
      type !== 2 ||
      !session.configured ||
      !(session.codec === 'h264' ? [0, 1, 3] : [1, 3]).includes(flags)
    )
      throw new Error();
    const timestamp = Number(view.getBigUint64(16));
    if (
      !Number.isSafeInteger(timestamp) ||
      (session.timestamp !== undefined && timestamp <= session.timestamp)
    )
      throw new Error();
    session.timestamp = timestamp;
    if (session.codec === 'h264' && session.needKeyframe && !(flags & 1))
      throw new Error();
    session.decoding = true;
    const decodeStart = performance.now();
    stats.stage = 'decode';
    let bitmap;
    try {
      if (session.codec === 'h264') {
        try {
          await session.decode(
            new Uint8Array(bytes, 28),
            timestamp,
            Boolean(flags & 1),
          );
        } catch (error) {
          if (session.closed) return;
          if (!(error instanceof DecodeFailure) || stats.resets >= 3)
            throw error;
          stats.resets++;
          closeDecoder(session);
          session.configured = false;
          session.media.send(
            JSON.stringify({
              v: 1,
              type: 'media.reset',
              data: { sequence: view.getUint32(12) },
            }),
          );
          return;
        }
        session.needKeyframe = false;
        if (flags & 1) stats.keyframes++;
      } else {
        bitmap = await createImageBitmap(
          new Blob([bytes.slice(28)], { type: 'image/jpeg' }),
        );
        if (session.closed) return;
        draw(bitmap);
        bitmap.close();
        bitmap = undefined;
      }
      if (session.closed) return;
      stats.stage = 'render';
      if (decodeTimes.length === 128) decodeTimes.shift();
      decodeTimes.push(performance.now() - decodeStart);
      stats.bytes += bytes.byteLength - 28;
      acknowledge(view.getUint32(12));
    } finally {
      bitmap?.close();
      session.decoding = false;
    }
  }
}
window.bridgeViewer = {
  attach,
  detach,
  resize,
  get stats() {
    const times = [...decodeTimes].sort((a, b) => a - b);
    return {
      ...stats,
      decodeMeanMs: times.length
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0,
      decodeP95Ms: times.length ? times[Math.ceil(times.length * 0.95) - 1] : 0,
    };
  },
  acceptCertificate: (expectedFingerprint) => decide(true, expectedFingerprint),
};
window.addEventListener('pagehide', detach);
