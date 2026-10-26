import { normalizeClipboardHtmlItem } from './clipboard-html-normalize.js';
import {
  encodeClipboardHtmlString,
  validateClipboardHtmlWrite,
} from './clipboard-html.js';
import { encodeClipboardText } from './clipboard-text.js';
const wipe = (item) => {
  if (item?.body instanceof Uint8Array) item.body.fill(0);
  if (item?.text instanceof Uint8Array) item.text.fill(0);
};
const live = (token) => !token.cancelled && performance.now() < token.expires;
function encoded(value, maximum) {
  let body, text;
  try {
    body = encodeClipboardHtmlString(value.html, maximum);
    if (value.text !== undefined)
      text = encodeClipboardText(value.text, maximum);
    const item = {
      body,
      fragmentOffset: 0,
      fragmentBytes: body.length,
      selectionOffset: 0,
      selectionBytes: 0,
      context: false,
      selection: false,
      ...(text === undefined ? {} : { text }),
    };
    validateClipboardHtmlWrite(item, maximum);
    return item;
  } catch {
    wipe({ body, text });
    throw new Error('Clipboard HTML unavailable');
  }
}
// This continuation retains only its finite permission token, never the view.
async function readItem(items, token) {
  let body, text;
  try {
    if (
      !live(token) ||
      !Array.isArray(items) ||
      !items.length ||
      items.length > 16
    )
      throw new Error();
    const first = items[0];
    if (
      !Array.isArray(first.types) ||
      first.types.length > 16 ||
      !first.types.includes('text/html')
    )
      throw new Error();
    const html = await first.getType('text/html');
    if (
      !live(token) ||
      !(html instanceof Blob) ||
      !/^text\/html(?:;|$)/.test(html.type) ||
      html.size > token.maximum
    )
      throw new Error();
    const plain = first.types.includes('text/plain')
      ? await first.getType('text/plain')
      : undefined;
    if (
      !live(token) ||
      (plain !== undefined &&
        (!(plain instanceof Blob) ||
          !/^text\/plain(?:;|$)/.test(plain.type))) ||
      html.size + (plain?.size ?? 0) > Math.min(token.maximum, 16777216 - 32)
    )
      throw new Error();
    body = new Uint8Array(await html.arrayBuffer());
    if (!live(token)) throw new Error();
    if (plain !== undefined) text = new Uint8Array(await plain.arrayBuffer());
    if (!live(token)) throw new Error();
    const value = normalizeClipboardHtmlItem(
      {
        body,
        fragmentOffset: 0,
        fragmentBytes: body.length,
        selectionOffset: 0,
        selectionBytes: 0,
        context: false,
        selection: false,
        ...(text === undefined ? {} : { text }),
      },
      token.maximum,
    );
    const checked = encoded(value, token.maximum);
    wipe(checked);
    if (!live(token)) throw new Error();
    return value;
  } finally {
    wipe({ body, text });
  }
}

/** Explicit rich actions; shared UI reservation prevents concurrent local reads. */
export function installClipboardHtmlView(panel, client, actions) {
  if (!panel) return { changed() {}, dispose() {} };
  const fields = Object.fromEntries(
    ['draft', 'draft-text', 'received', 'received-text'].map((name) => [
      name,
      panel.querySelector('[data-html-clipboard-' + name + ']'),
    ]),
  );
  const buttons = Object.fromEntries(
    ['paste', 'send', 'read', 'copy', 'clear'].map((name) => [
      name,
      panel.querySelector('[data-html-clipboard=' + name + ']'),
    ]),
  );
  const status = panel.querySelector('[role=status]'),
    listeners = [];
  let draft,
    received,
    transferToken,
    permission,
    timer,
    disposed = false,
    version = 0;
  const cancel = () => {
    const token = permission;
    permission = undefined;
    if (token) {
      token.cancelled = true;
      token.cancel();
    }
    clearTimeout(timer);
    timer = undefined;
    if (token && actions?.owner === token) {
      actions.owner = undefined;
      actions.changed();
    }
  };
  const display = () => {
    fields.draft.value = draft?.html ?? '';
    fields['draft-text'].value = draft?.text ?? '';
    fields.received.value = received?.html ?? '';
    fields['received-text'].value = received?.text ?? '';
    fields['draft-text'].closest('label').hidden = draft?.text === undefined;
    fields['received-text'].closest('label').hidden =
      received?.text === undefined;
  };
  const clear = () => {
    ++version;
    cancel();
    draft = received = undefined;
    transferToken = undefined;
    display();
  };
  const changed = () => {
    if (disposed) return;
    const s = client.snapshot,
      available = s.available && s.html;
    if (!available) {
      clear();
      status.textContent = 'HTML-буфер недоступен';
    }
    panel.hidden = !available;
    const busy = s.busy || Boolean(permission) || Boolean(actions?.owner);
    for (const field of Object.values(fields)) field.disabled = !available;
    buttons.send.disabled = !available || busy || !s.canSetHtml || !draft;
    buttons.read.disabled = !available || busy || !s.canReadHtml;
    buttons.paste.disabled =
      !available ||
      busy ||
      !s.toServer ||
      !isSecureContext ||
      typeof navigator.clipboard?.read !== 'function';
    let support = typeof globalThis.ClipboardItem === 'function';
    try {
      support &&=
        typeof ClipboardItem.supports !== 'function' ||
        ClipboardItem.supports('text/html');
    } catch {
      support = false;
    }
    buttons.copy.disabled =
      !available ||
      busy ||
      !received ||
      !isSecureContext ||
      !support ||
      typeof navigator.clipboard?.write !== 'function';
    buttons.clear.disabled =
      !draft && !received && !permission && !transferToken;
  };
  const on = (name, handler) => {
    const listener = (event) => {
      event.preventDefault();
      if (event.isTrusted) handler();
    };
    buttons[name].addEventListener('click', listener);
    listeners.push(() => buttons[name].removeEventListener('click', listener));
  };
  const message = (text, value) => {
    status.textContent =
      text + (value?.sanitized ? ' Неподдерживаемая разметка удалена.' : '');
  };
  const transfer = (operation) => {
    const s = client.snapshot;
    if (
      disposed ||
      !s.available ||
      !s.html ||
      s.busy ||
      permission ||
      actions?.owner
    )
      return;
    const epoch = ++version;
    const token = {};
    let promise;
    try {
      if (operation === 'set') {
        if (!draft || !s.canSetHtml) return;
        const item = encoded(draft, s.maximum);
        try {
          transferToken = token;
          promise = client.setHtml(item);
        } finally {
          wipe(item);
        }
      } else {
        transferToken = token;
        promise = client.readHtml();
      }
    } catch {
      if (transferToken === token) transferToken = undefined;
      status.textContent =
        'HTML превышает лимит или имеет неподдерживаемый формат';
      changed();
      return;
    }
    status.textContent = 'Передача HTML…';
    changed();
    void promise.then(
      (result) => {
        try {
          if (disposed || epoch !== version || !client.snapshot.available)
            return;
          if (result.status !== 'accepted') {
            status.textContent = 'Передача HTML не выполнена: ' + result.status;
            return;
          }
          if (operation === 'read') {
            received = normalizeClipboardHtmlItem(result.item, s.maximum);
            display();
            message('HTML получен. Копирование — отдельной кнопкой.', received);
          } else {
            draft = undefined;
            display();
            status.textContent =
              'HTML предложен удалённому буферу обмена. Вставьте его в удалённом приложении.';
          }
        } catch {
          status.textContent =
            'HTML превышает лимит или имеет неподдерживаемый формат';
        } finally {
          if (transferToken === token) transferToken = undefined;
          wipe(result.item);
          changed();
        }
      },
      () => {
        if (transferToken === token) transferToken = undefined;
        if (!disposed && epoch === version) {
          status.textContent = 'Передача HTML не выполнена';
          changed();
        }
      },
    );
  };
  const local = (operation) => {
    const s = client.snapshot;
    if (
      disposed ||
      !s.available ||
      !s.html ||
      s.busy ||
      permission ||
      actions?.owner ||
      !isSecureContext ||
      !navigator.userActivation?.isActive ||
      (operation === 'read' ? !s.toServer : !received)
    )
      return;
    const epoch = version,
      token = {
        maximum: s.maximum,
        expires: performance.now() + 5000,
        cancelled: false,
      };
    permission = token;
    const expiry = new Promise((resolve) => {
      token.cancel = () => resolve({ status: 'cancelled' });
      timer = setTimeout(() => resolve({ status: 'expired' }), 5000);
    });
    if (actions) {
      actions.owner = token;
      actions.changed();
    }
    let promise;
    try {
      // Invoke the browser API directly in this trusted gesture, before await.
      promise =
        operation === 'read'
          ? navigator.clipboard.read()
          : navigator.clipboard.write([
              new ClipboardItem({
                'text/html': new Blob([received.html], { type: 'text/html' }),
                ...(received.text === undefined
                  ? {}
                  : {
                      'text/plain': new Blob([received.text], {
                        type: 'text/plain',
                      }),
                    }),
              }),
            ]);
    } catch {
      promise = Promise.reject(new Error());
    }
    status.textContent = 'Ожидание разрешения браузера';
    changed();
    const completion = Promise.resolve(promise).then(
      (items) =>
        operation === 'read'
          ? readItem(items, token).then(
              (value) => ({ status: 'ok', value }),
              () => ({ status: 'invalid' }),
            )
          : { status: 'ok' },
      () => ({ status: 'denied' }),
    );
    void Promise.race([completion, expiry]).then((result) => {
      if (
        disposed ||
        permission !== token ||
        epoch !== version ||
        !client.snapshot.available
      )
        return;
      const current = live(token);
      cancel();
      if (!current || result.status === 'expired') {
        status.textContent = 'Ожидание разрешения завершено';
        changed();
        return;
      }
      if (result.status === 'denied') {
        status.textContent = 'Браузер отказал в доступе к буферу обмена';
        changed();
        return;
      }
      if (result.status !== 'ok') {
        status.textContent =
          'HTML недоступен, превышает лимит или имеет неподдерживаемый формат';
        changed();
        return;
      }
      if (operation === 'read') {
        draft = result.value;
        display();
        message('HTML вставлен локально. Отправка — отдельной кнопкой.', draft);
      } else status.textContent = 'HTML скопирован';
      changed();
    });
  };
  on('send', () => transfer('set'));
  on('read', () => transfer('read'));
  on('paste', () => local('read'));
  on('copy', () => local('write'));
  on('clear', () => {
    clear();
    status.textContent = 'Локальный HTML очищен';
    changed();
  });
  changed();
  return {
    changed,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      for (const remove of listeners) remove();
      for (const field of Object.values(fields)) field.disabled = true;
      for (const button of Object.values(buttons)) button.disabled = true;
      panel.hidden = true;
    },
  };
}
