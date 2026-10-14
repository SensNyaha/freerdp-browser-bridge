import { connectionConfig } from './connection-config.js';
import { ConnectionOwner } from './connection-owner.js';

const form = document.querySelector('#connection-form');
const connectButton = document.querySelector('#connect-session');
const disconnectButton = document.querySelector('#disconnect-session');
const message = document.querySelector('#connection-status');
let capabilities;
let authorize;
async function request(path, method = 'GET', config) {
  const body = config ? JSON.stringify(config) : undefined;
  if (config?.auth) delete config.auth.password;
  let headers;
  let authorizationTimer;
  try {
    headers = await Promise.race([
      Promise.resolve().then(() => authorize?.()),
      new Promise((_resolve, reject) => {
        authorizationTimer = setTimeout(() => reject(new Error()), 5000);
      }),
    ]);
  } catch {
    throw new Error('Не удалось подтвердить вход в bridge');
  } finally {
    clearTimeout(authorizationTimer);
  }
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'omit',
      headers: {
        ...headers,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const error = new Error(
      'Ответ bridge не получен; состояние сессии требует проверки',
    );
    error.uncertain = method !== 'GET';
    throw error;
  }
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Для подключения выполните вход в приложение bridge'
        : 'Bridge отклонил запрос подключения',
    );
  try {
    return response.status === 204 ? undefined : await response.json();
  } catch {
    const error = new Error('Некорректный ответ bridge');
    error.uncertain = method !== 'GET';
    throw error;
  }
}
const owner = new ConnectionOwner({
  request,
  attach: (created, options) => window.bridgeViewer.attach(created, options),
  detach: () => window.bridgeViewer?.detach(),
  changed: (state) => {
    connectButton.disabled =
      !capabilities?.connectCore ||
      state.pending ||
      state.connected ||
      state.uncertain;
    disconnectButton.disabled = !state.pending && !state.connected;
    form.querySelector('fieldset').disabled =
      state.pending || state.connected || state.uncertain;
  },
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  let config;
  try {
    config = connectionConfig(new FormData(form), capabilities);
  } catch (error) {
    message.textContent = error.message;
    return;
  }
  const pending = owner.connect(config.config, config.viewer);
  form.elements.password.value = '';
  message.textContent = 'Создание сессии…';
  void pending.then(
    () => {
      message.textContent = owner.snapshot().connected
        ? 'Сессия создана; состояние соединения показано ниже'
        : 'Подключение отменено';
    },
    (error) => {
      message.textContent = error.message;
    },
  );
});
disconnectButton.addEventListener('click', () => {
  form.elements.password.value = '';
  message.textContent = 'Завершение сессии…';
  void owner.stop().then(
    () => {
      message.textContent = 'Сессия завершена';
    },
    (error) => {
      message.textContent = error.message;
    },
  );
});
async function refresh() {
  try {
    const value = await request('/v1/capabilities');
    capabilities = value;
    for (const [name, choices] of [
      [
        'video',
        {
          h264: value.h264Capture && typeof VideoDecoder !== 'undefined',
          jpeg: value.jpegCapture,
        },
      ],
      [
        'audio',
        {
          off: true,
          pcm: value.pcmOutput,
          opus: value.opusOutput && typeof AudioDecoder !== 'undefined',
        },
      ],
      [
        'microphone',
        {
          off: true,
          pcm: value.pcmInput && value.microphoneReset,
          opus:
            value.opusInput &&
            value.microphoneReset &&
            typeof AudioEncoder !== 'undefined',
        },
      ],
      ['audioBuffer', { 120: true, 200: value.audioBuffer200 }],
    ]) {
      const select = form.elements[name];
      for (const option of select.options)
        option.disabled = !choices[option.value];
      if (select.selectedOptions[0]?.disabled)
        select.value =
          [...select.options].find((option) => !option.disabled)?.value ?? '';
    }
    for (const [name, available] of [
      ['dynamicResolution', value.displayControl],
      ['touch', value.touchInput],
    ]) {
      form.elements[name].disabled = !available;
      if (!available) form.elements[name].checked = false;
    }
    owner.notify();
    message.textContent = value.connectCore
      ? 'Введите параметры RDP и нажмите «Подключиться»'
      : 'RDP-подключение недоступно в этой сборке';
  } catch {
    message.textContent = 'Не удалось получить возможности bridge';
  }
}
window.bridgeConnection = {
  configure(options = {}) {
    if (
      owner.snapshot().pending ||
      owner.snapshot().connected ||
      owner.snapshot().uncertain
    )
      throw new Error('Нельзя менять авторизацию активного подключения');
    if (
      options.authorize !== undefined &&
      typeof options.authorize !== 'function'
    )
      throw new Error('Требуется функция авторизации приложения');
    authorize = options.authorize;
  },
  refresh,
  stop: () => owner.stop(),
  get state() {
    return owner.snapshot();
  },
};
window.addEventListener('pagehide', () => {
  form.elements.password.value = '';
  void owner.stop().catch(() => {});
});
form.elements.video.addEventListener('change', () => {
  const max = form.elements.video.value === 'jpeg' ? 20 : 30;
  form.elements.fps.max = String(max);
  if (Number(form.elements.fps.value) > max)
    form.elements.fps.value = String(max);
});
void refresh();
