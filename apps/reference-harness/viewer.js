import { installInput } from './input.js';
import { installText, validText } from './text.js';
import { installCursor } from './cursor.js';
import { displayState, resizeResult, displayInputReady } from './display.js';
import { touchState, touchInputReady } from './touch.js';
import { MicrophoneMediaClient } from './microphone-media.js';
import { MicrophoneOwner } from './microphone-owner.js';
const status = document.querySelector('#status');
const canvas = document.querySelector('#desktop');
const certificate = document.querySelector('#certificate');
const fingerprint = document.querySelector('#fingerprint');
const resizeForm = document.querySelector('#resize');
const resizeButton = document.querySelector('#resize-button');
const resizeStatus = document.querySelector('#resize-status');
const audioButton = document.querySelector('#audio-start');
const audioStatus = document.querySelector('#audio-status');
const microphoneStart = document.querySelector('#microphone-start');
const microphoneStop = document.querySelector('#microphone-stop');
const microphoneStatus = document.querySelector('#microphone-status');
let microphoneRetirement;
let microphoneFailed = false;
let audioRequest;
let current;
const textInput = installText(
  document.querySelector('#text-input'),
  sendText,
  () =>
    Boolean(
      current &&
        !current.closed &&
        current.connected &&
        displayInputReady(current),
    ),
);
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
  audio: undefined,
  microphone: undefined,
};
let decodeTimes = [];
class DecodeFailure extends Error {}
function closeDecoder(session) {
  const decoder = session.decoder;
  session.decoder = undefined;
  if (decoder && decoder.state !== 'closed') decoder.close();
}
function detach() {
  const pending = audioRequest;
  audioRequest = undefined;
  audioButton.hidden = true;
  audioButton.disabled = false;
  if (pending?.context && pending.context.state !== 'closed')
    void pending.context.close().catch(() => {});
  audioStatus.textContent = 'Звук выключен';
  microphoneStart.hidden = microphoneStop.hidden = true;
  microphoneStatus.textContent = 'Микрофон выключен';
  stats.closed = true;
  if (!current || current.detaching) return;
  current.detaching = true;
  current.disposeInput?.();
  current.cursor?.dispose();
  current.closed = true;
  void current.playback?.close();
  stats.audio = current.playback?.snapshot();
  if (current.textRequest) {
    clearTimeout(current.textRequest.timer);
    current.textRequest.reject(new Error('Viewer detached'));
    current.textRequest = undefined;
  }
  textInput.reset();
  if (current.resizeRequest) {
    clearTimeout(current.resizeRequest.timer);
    current.resizeRequest.reject(new Error('Viewer detached'));
    current.resizeRequest = undefined;
  }
  stats.closed = true;
  current.abortDecode?.();
  closeDecoder(current);
  current.control.close();
  retireMicrophone(current);
  current = undefined;
  certificate.hidden = true;
  updateResize();
}
function microphoneSnapshot(session) {
  const client = session?.microphone;
  if (!client) return undefined;
  const source = client.source?.source;
  return {
    ...client.stats,
    owner: session.microphoneOwner?.stats,
    retiring: Boolean(microphoneRetirement) || client.source?.retiring === true,
    cleanupFailed: microphoneFailed,
    source: source
      ? {
          ...source,
          revision: String(source.revision),
          epoch: String(source.epoch),
          timestampUs: String(source.timestampUs),
        }
      : undefined,
  };
}
function updateMicrophone(session = current) {
  if (!session || session !== current || session.closed) return;
  const client = session.microphone;
  const owner = session.microphoneOwner?.stats;
  microphoneStart.hidden = microphoneStop.hidden = !client;
  const busy = Boolean(
    owner?.preparing ||
      owner?.permissionPending ||
      owner?.activationPending ||
      owner?.active ||
      owner?.retiring ||
      client?.stats.starting ||
      client?.stats.stopping ||
      client?.source?.granted ||
      client?.source?.retiring,
  );
  microphoneStart.disabled =
    !client ||
    !session.connected ||
    session.control.readyState !== WebSocket.OPEN ||
    microphoneFailed ||
    Boolean(microphoneRetirement) ||
    owner?.failed ||
    busy ||
    client.source?.source?.availability !== 'ready';
  microphoneStop.disabled = !client || !busy;
  microphoneStatus.textContent =
    microphoneFailed || owner?.failed
      ? 'Не удалось освободить микрофон. Перезагрузите просмотрщик'
      : owner?.active
        ? 'Микрофон включён'
        : busy
          ? 'Подготовка или остановка микрофона'
          : client?.source?.source?.availability === 'ready'
            ? 'Микрофон выключен — можно включить'
            : client
              ? 'Ожидание готовности удалённого микрофона'
              : 'Микрофон выключен';
}
function retireMicrophone(session) {
  if (!session.microphoneOwner) {
    session.media.close();
    return;
  }
  // Keep only microphone replies alive until local resources and server stop settle.
  // The control attachment is already closed; no new capture can be authorized.
  const previous = microphoneRetirement;
  const closing = session.microphoneOwner.close(); // Stops tracks synchronously.
  const barrier = Promise.all([previous, closing])
    .catch(() => {
      microphoneFailed = true;
    })
    .finally(() => {
      if (
        session.microphoneOwner.stats.permissionPending ||
        session.microphoneOwner.stats.activationPending
      )
        microphoneFailed = true; // An unresolved old permission cannot overlap a new owner.
      if (microphoneRetirement === barrier) microphoneRetirement = undefined;
      stats.microphone = microphoneSnapshot(session);
      session.microphone.close();
      session.media.close();
      updateMicrophone();
    });
  microphoneRetirement = barrier;
}
microphoneStart.addEventListener('click', () => {
  const session = current;
  if (!session?.microphoneOwner || microphoneStart.disabled) return;
  void session.microphoneOwner.start().then(
    () => updateMicrophone(session),
    () => {
      if (current === session) detach();
    },
  );
  updateMicrophone(session);
});
microphoneStop.addEventListener('click', () => {
  const session = current;
  if (!session?.microphoneOwner) return;
  void session.microphoneOwner.stop().then(
    () => updateMicrophone(session),
    () => {
      if (current === session) detach();
    },
  );
  updateMicrophone(session);
});
function updateResize() {
  textInput.refresh();
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
function sendText(text) {
  const session = current;
  if (
    !validText(text) ||
    !session ||
    session.closed ||
    !session.connected ||
    !displayInputReady(session) ||
    session.control.readyState !== WebSocket.OPEN ||
    session.control.bufferedAmount > 16384
  )
    return Promise.reject(new Error('Text input unavailable'));
  if (session.textRequest) return Promise.reject(new Error('Text input busy'));
  session.disposeInput.reset();
  const seq = session.controlSequence++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (session.textRequest?.seq !== seq) return;
      session.textRequest = undefined;
      reject(new Error('Text input timed out'));
      detach(); // Outcome is uncertain: never automatically retry committed text.
    }, 7000);
    session.textRequest = { seq, timer, resolve, reject };
    session.control.send(
      JSON.stringify({
        v: 1,
        type: 'input.text',
        seq,
        ts: Date.now(),
        data: { text },
      }),
    );
  });
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
  session.disposeInput.reset();
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

function validateAttachment(created) {
  if (
    !/^[0-9a-f]{32}$/.test(created.sessionId) ||
    !['control', 'media'].every((channel) =>
      /^[A-Za-z0-9_-]{43}$/.test(created.attach[channel].token),
    )
  )
    throw new Error('Invalid attachment');
}
/** Audio sockets open only after the user activates the exclusive AudioContext. */
function attach(created, options = {}) {
  detach();
  validateAttachment(created);
  if (![undefined, 'off', 'pcm', 'opus'].includes(options.audioOutput))
    throw new Error('Unsupported audio output');
  if (![undefined, 'off', 'pcm'].includes(options.microphone))
    throw new Error('Unsupported microphone input');
  resetStats();
  if (options.audioOutput === 'pcm' || options.audioOutput === 'opus') {
    audioRequest = { created, options: { ...options }, preparing: false };
    audioButton.hidden = false;
    audioStatus.textContent = 'Нажмите кнопку для включения звука';
    status.textContent = 'Ожидание включения звука';
    stats.stage = 'audio-gesture';
    return;
  }
  attachSession(created, options);
}
audioButton.addEventListener('click', () => {
  const request = audioRequest;
  if (!request || request.preparing) return;
  request.preparing = true;
  audioButton.disabled = true;
  stats.stage = 'audio-prepare';
  const failed = () => {
    if (
      audioRequest === request ||
      (request.session && current === request.session)
    ) {
      detach();
      stats.error = 'AUDIO_FAILED';
      status.textContent = 'Не удалось включить звук';
    }
  };
  try {
    const context = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });
    request.context = context;
    const resumed = context.resume();
    void (async () => {
      await resumed;
      const createPlayback =
        request.options.audioOutput === 'opus'
          ? (await import('./opus-playback.js')).createOpusPlayback
          : (await import('./pcm-playback.js')).createPcmPlayback;
      const playback = await createPlayback(context, {
        sourceStatus: true,
        recordCredit: true,
        onFailure: failed,
        onRecordAck(sequence) {
          const session = request.session;
          if (
            !session ||
            session !== current ||
            session.closed ||
            !session.audioNegotiated ||
            session.media.readyState !== WebSocket.OPEN ||
            session.media.bufferedAmount > 16384
          )
            throw new Error('Audio acknowledgement unavailable');
          session.media.send(
            JSON.stringify({ v: 1, type: 'audio.ack', data: { sequence } }),
          );
        },
      });
      if (audioRequest !== request) {
        await playback.close();
        return;
      }
      audioRequest = undefined;
      request.context = undefined;
      try {
        request.session = attachSession(
          request.created,
          request.options,
          playback,
        );
      } catch {
        await playback.close();
        throw new Error('Audio attachment failed');
      }
      audioButton.hidden = true;
      audioStatus.textContent = 'Ожидание аудиоисточника';
    })().catch(() => {
      failed();
      if (context.state !== 'closed') void context.close().catch(() => {});
    });
  } catch {
    failed();
  }
});
function resetStats() {
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
    audio: undefined,
    microphone: undefined,
  });
  decodeTimes = [];
}
/** Same-origin reference consumer. The host application supplies fresh single-use attach tokens. */
function attachSession(created, options, playback) {
  validateAttachment(created);
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
    playback,
    audioNegotiated: false,
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
    () => !session.closed && session.connected && session === current,
    () => touchInputReady(session),
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
        session.microphoneOwner?.changed();
        updateMicrophone(session);
        status.textContent = message.data.state;
        updateResize();
      } else if (['display.info', 'display.resize'].includes(message.type)) {
        const observed = displayState(message.data, session.display);
        if (
          observed.resizing ||
          (session.display &&
            observed.generation !== session.display.generation)
        )
          session.disposeInput.reset();
        session.display = observed;
        stats.displayGeneration = session.display.generation;
        updateResize();
      } else if (message.type === 'touch.info') {
        const observed = touchState(message.data, session.touch);
        if (
          observed.availability !== 'ready' ||
          (session.touch && session.touch.generation !== observed.generation)
        )
          session.disposeInput.reset();
        session.touch = observed;
      } else if (message.type === 'input.touch.paused') {
        session.disposeInput.reset();
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
      } else if (message.type === 'input.text.result') {
        const data = message.data;
        if (
          !Number.isInteger(data.requestSeq) ||
          !['sent', 'unavailable', 'paused', 'failed'].includes(data.status)
        )
          throw new Error();
        if (session.textRequest?.seq === data.requestSeq) {
          const request = session.textRequest;
          clearTimeout(request.timer);
          session.textRequest = undefined;
          request.resolve(data.status);
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
        data: {
          codecs: offered,
          cursor: true,
          display: true,
          ...(playback
            ? { audio: { codec: options.audioOutput, sourceStatus: true } }
            : {}),
          ...(options.microphone === 'pcm'
            ? { microphone: { codec: 'pcm', sourceStatus: true } }
            : {}),
        },
      }),
    );
  }
  session.media.addEventListener('error', fail);
  let rendering = Promise.resolve();
  session.media.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data);
        if (message.type?.startsWith('microphone.')) {
          if (!session.microphone || !session.microphone.message(message))
            fail();
          return;
        }
        if (session.closed) return;
        if (message.type === 'media.ready') {
          ready(message);
          return;
        }
      } catch {
        fail();
        return;
      }
    }
    if (session.closed) return;
    if (
      event.data instanceof ArrayBuffer &&
      event.data.byteLength >= 12 &&
      new DataView(event.data).getUint32(8) === 3
    ) {
      if (!session.audioNegotiated || !playback?.record(event.data)) fail();
      else
        audioStatus.textContent =
          {
            ready: 'Вывод звука включён',
            waiting: 'Ожидание аудиоисточника',
            suspended: 'Аудиоисточник приостановлен',
            closed: 'Аудиоисточник закрыт',
            failed: 'Ошибка аудиоисточника',
            unavailable: 'Аудиоисточник недоступен',
          }[playback.snapshot().source?.availability] ??
          'Ожидание аудиоисточника';
      return;
    }
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
    textInput.refresh();
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
  function ready(message) {
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
    const audio = message.data.audio;
    if (
      playback
        ? !audio ||
          Object.keys(audio).length !== 5 ||
          audio.codec !== options.audioOutput ||
          audio.sourceStatus !== true ||
          audio.streamId !== 3 ||
          audio.maxInFlight !== 1 ||
          audio.ackTimeoutMs !== 2000
        : audio !== undefined
    )
      throw new Error('Audio negotiation mismatch');
    session.audioNegotiated = Boolean(audio);
    if (options.microphone === 'pcm') {
      session.microphone = new MicrophoneMediaClient(
        {
          write(record) {
            if (
              session.media.readyState !== WebSocket.OPEN ||
              session.media.bufferedAmount > 16384
            )
              return false;
            session.media.send(record);
            return true;
          },
          changed() {
            session.microphoneOwner?.changed();
            updateMicrophone(session);
          },
          failed: fail,
        },
        message.data.microphone,
      );
      session.microphoneOwner = new MicrophoneOwner(session.microphone, {
        controller: () =>
          session === current &&
          !session.closed &&
          session.connected &&
          session.control.readyState === WebSocket.OPEN &&
          !microphoneRetirement &&
          !microphoneFailed,
        changed: () => updateMicrophone(session),
        failed: fail,
      });
    } else if (message.data.microphone !== undefined)
      throw new Error('Microphone negotiation mismatch');
    updateMicrophone(session);
    stats.stage = 'ready';
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
      throw new Error('Unexpected media metadata');
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
  return session;
}
window.bridgeViewer = {
  attach,
  detach,
  resize,
  requestAudioStats: () => current?.playback?.requestStats() ?? false,
  get touch() {
    return current?.touch
      ? { ...current.touch, inputReady: Boolean(touchInputReady(current)) }
      : undefined;
  },
  get stats() {
    const times = [...decodeTimes].sort((a, b) => a - b);
    return {
      ...stats,
      audio: current?.playback?.snapshot() ?? stats.audio,
      microphone: microphoneSnapshot(current) ?? stats.microphone,
      decodeMeanMs: times.length
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0,
      decodeP95Ms: times.length ? times[Math.ceil(times.length * 0.95) - 1] : 0,
    };
  },
  acceptCertificate: (expectedFingerprint) => decide(true, expectedFingerprint),
};
window.addEventListener('pagehide', detach);
