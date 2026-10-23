import { measureClipboardText } from './clipboard-text.js';
/** Explicit local actions only. Async permission results never send text to RDP. */
export function installClipboardView(panel, client) {
  if (!panel) return { changed() {}, dispose() {} };
  const draft = panel.querySelector('[data-clipboard-draft]');
  const received = panel.querySelector('[data-clipboard-received]');
  const status = panel.querySelector('[role=status]');
  const buttons = Object.fromEntries(
    ['send', 'read', 'paste', 'copy', 'clear'].map((name) => [
      name,
      panel.querySelector('[data-clipboard=' + name + ']'),
    ]),
  );
  let hasReceived = false,
    disposed = false,
    permission,
    permissionTimer,
    version = 0;
  const listeners = [];
  const cancelPermission = () => {
    permission?.cancel();
    permission = undefined;
    if (permissionTimer) clearTimeout(permissionTimer);
    permissionTimer = undefined;
  };
  const clear = () => {
    ++version;
    cancelPermission();
    draft.value = '';
    received.value = '';
    hasReceived = false;
  };
  const changed = () => {
    if (disposed) return;
    const s = client.snapshot;
    if (!s.available) {
      clear();
      status.textContent = 'Буфер обмена недоступен';
    }
    const busy = s.busy || Boolean(permission);
    draft.disabled = !s.available || busy || !s.toServer;
    draft.maxLength = s.maximum ?? 1;
    buttons.send.disabled = busy || !s.canSet;
    buttons.read.disabled = busy || !s.canRead;
    buttons.paste.disabled =
      !s.available ||
      busy ||
      !s.toServer ||
      !globalThis.isSecureContext ||
      typeof navigator.clipboard?.readText !== 'function';
    buttons.copy.disabled =
      !s.available ||
      busy ||
      !hasReceived ||
      !globalThis.isSecureContext ||
      typeof navigator.clipboard?.writeText !== 'function';
    buttons.clear.disabled = !draft.value && !hasReceived && !permission;
  };
  const on = (name, handler) => {
    const listener = (event) => {
      event.preventDefault();
      handler();
    };
    buttons[name].addEventListener('click', listener);
    listeners.push(() => buttons[name].removeEventListener('click', listener));
  };
  const transfer = (operation) => {
    if (
      disposed ||
      !client.snapshot.available ||
      client.snapshot.busy ||
      permission
    )
      return;
    const epoch = ++version;
    const promise =
      operation === 'set' ? client.set(draft.value) : client.read();
    status.textContent = 'Передача текста…';
    changed();
    void promise.then(
      (result) => {
        if (disposed || epoch !== version || !client.snapshot.available) return;
        if (result.status === 'accepted') {
          if (operation === 'read') {
            received.value = result.text;
            hasReceived = true;
          } else draft.value = '';
          status.textContent =
            operation === 'read'
              ? 'Текст получен. Копирование — отдельной кнопкой.'
              : 'Текст предложен удалённому буферу обмена. Вставьте его в удалённом приложении командой «Вставить».';
        } else status.textContent = 'Передача не выполнена: ' + result.status;
        changed();
      },
      () => {
        if (!disposed && epoch === version) {
          status.textContent = 'Передача не выполнена';
          changed();
        }
      },
    );
  };
  on('send', () => transfer('set'));
  on('read', () => transfer('read'));
  on('clear', () => {
    clear();
    status.textContent = 'Локальный текст очищен';
    changed();
  });
  const local = (operation) => {
    const s = client.snapshot;
    if (
      disposed ||
      !s.available ||
      s.busy ||
      permission ||
      !globalThis.isSecureContext ||
      (operation === 'read' ? !s.toServer : !hasReceived)
    )
      return;
    const epoch = version,
      token = { expires: performance.now() + 5000, maximum: s.maximum };
    permission = token;
    const expiry = new Promise((resolve) => {
      token.cancel = () => resolve({ status: 'cancelled' });
      permissionTimer = setTimeout(() => resolve({ status: 'expired' }), 5000);
    });
    let promise;
    try {
      // Called directly during this click, before any await or remote request.
      promise =
        operation === 'read'
          ? navigator.clipboard.readText()
          : navigator.clipboard.writeText(received.value);
    } catch {
      promise = Promise.reject(new Error());
    }
    status.textContent = 'Ожидание разрешения браузера';
    changed();
    // A hung browser promise retains only the race resolver after cancellation.
    const completion = Promise.resolve(promise).then(
      (text) => ({ status: 'ok', text }),
      () => ({ status: 'denied' }),
    );
    void Promise.race([completion, expiry]).then(
      (result) => {
        if (
          disposed ||
          permission !== token ||
          epoch !== version ||
          !client.snapshot.available
        )
          return;
        cancelPermission();
        if (result.status === 'expired' || performance.now() >= token.expires) {
          status.textContent = 'Ожидание разрешения завершено';
          changed();
          return;
        }
        if (result.status !== 'ok') {
          status.textContent = 'Браузер отказал в доступе к буферу обмена';
          changed();
          return;
        }
        try {
          if (operation === 'read') {
            measureClipboardText(result.text, token.maximum);
            draft.value = result.text;
          }
          status.textContent =
            operation === 'read'
              ? 'Текст вставлен локально. Отправка — отдельной кнопкой.'
              : 'Текст скопирован';
        } catch {
          status.textContent =
            'Текст превышает лимит или имеет недопустимый формат';
        }
        changed();
      },
      () => {
        if (disposed || permission !== token || epoch !== version) return;
        cancelPermission();
        status.textContent = 'Браузер отказал в доступе к буферу обмена';
        changed();
      },
    );
  };
  on('paste', () => local('read'));
  on('copy', () => local('write'));
  const input = () => changed();
  draft.addEventListener('input', input);
  changed();
  return {
    changed,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      for (const remove of listeners) remove();
      draft.removeEventListener('input', input);
      for (const button of Object.values(buttons)) button.disabled = true;
      draft.disabled = true;
      status.textContent = 'Буфер обмена выключен';
    },
  };
}
