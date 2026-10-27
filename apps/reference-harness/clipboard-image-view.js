import { ClipboardImageConversion } from './clipboard-image-conversion.js';
import {
  validateClipboardImageItem,
  validateClipboardImageWrite,
} from './clipboard-image.js';

const wipe = (item) => {
  if (item?.rgba instanceof Uint8Array) item.rgba.fill(0);
};
const live = (token) => !token.cancelled && performance.now() < token.expires;

// A pending browser permission/type promise retains only this finite token and
// conversion owner. It never captures the panel or sends a remote operation.
async function readItem(items, token, conversion) {
  let item;
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
      !first ||
      !Array.isArray(first.types) ||
      first.types.length > 16 ||
      !first.types.includes('image/png')
    )
      throw new Error();
    const blob = await first.getType('image/png');
    if (!live(token)) throw new Error();
    const result = await conversion.run('decode', blob, token.maximum);
    item = result.item;
    if (!live(token) || result.status !== 'accepted') throw new Error();
    validateClipboardImageWrite(item, token.maximum);
    const owned = item;
    item = undefined;
    return owned;
  } finally {
    wipe(item);
  }
}

// Fixed at most 320x240 pixels/iterations. No full-size DOM canvas or URL is
// created; the source remains the one retained item, and temporary pixels wipe.
function preview(canvas, item, maximum) {
  canvas.width = canvas.height = 0;
  if (!item) return;
  validateClipboardImageItem(item, maximum);
  const scale = Math.min(1, 320 / item.width, 240 / item.height),
    width = Math.max(1, Math.floor(item.width * scale)),
    height = Math.max(1, Math.floor(item.height * scale)),
    pixels = new ImageData(width, height, { colorSpace: 'srgb' });
  try {
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(
        item.height - 1,
        Math.floor(((y + 0.5) * item.height) / height),
      );
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(
            item.width - 1,
            Math.floor(((x + 0.5) * item.width) / width),
          ),
          source = (sourceY * item.width + sourceX) * 4,
          target = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel++)
          pixels.data[target + channel] = item.rgba[source + channel];
      }
    }
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!context) throw new Error();
    context.putImageData(pixels, 0, 0);
  } catch {
    canvas.width = canvas.height = 0;
    throw new Error('Image preview unavailable');
  } finally {
    pixels.data.fill(0);
  }
}

/** Explicit image actions; the control client and UI reservation are shared. */
export function installClipboardImageView(panel, client, actions) {
  if (!panel) return { changed() {}, dispose() {} };
  const conversion = new ClipboardImageConversion(),
    listeners = [],
    buttons = Object.fromEntries(
      ['paste', 'send', 'read', 'copy', 'clear'].map((name) => [
        name,
        panel.querySelector('[data-image-clipboard=' + name + ']'),
      ]),
    ),
    canvases = Object.fromEntries(
      ['draft', 'received'].map((name) => [
        name,
        panel.querySelector('[data-image-clipboard-' + name + ']'),
      ]),
    ),
    descriptions = Object.fromEntries(
      ['draft', 'received'].map((name) => [
        name,
        panel.querySelector('[data-image-clipboard-' + name + '-info]'),
      ]),
    ),
    status = panel.querySelector('[role=status]');
  let draft,
    received,
    permission,
    timer,
    transferToken,
    disposed = false,
    version = 0;
  const display = () => {
    for (const [name, item] of [
      ['draft', draft],
      ['received', received],
    ]) {
      preview(canvases[name], item, client.snapshot.maximum);
      descriptions[name].textContent = item
        ? `${item.width} × ${item.height}, ${item.rgba.length} байт RGBA`
        : 'Изображения нет';
      canvases[name].hidden = !item;
    }
  };
  const cancel = () => {
    const token = permission;
    permission = undefined;
    if (token) {
      token.cancelled = true;
      token.cancel();
    }
    clearTimeout(timer);
    timer = undefined;
    conversion.cancel();
    if (token && actions?.owner === token) {
      actions.owner = undefined;
      actions.changed();
    }
  };
  const clear = () => {
    ++version;
    cancel();
    wipe(draft);
    wipe(received);
    draft = received = transferToken = undefined;
    display();
  };
  const supported = () => {
    try {
      return (
        typeof Worker === 'function' &&
        typeof OffscreenCanvas === 'function' &&
        typeof createImageBitmap === 'function' &&
        typeof ImageData === 'function' &&
        typeof ClipboardItem === 'function' &&
        (typeof ClipboardItem.supports !== 'function' ||
          ClipboardItem.supports('image/png'))
      );
    } catch {
      return false;
    }
  };
  const changed = () => {
    if (disposed) return;
    const s = client.snapshot,
      available = s.available && s.image;
    if (!available) {
      clear();
      status.textContent = 'Буфер изображений недоступен';
    }
    panel.hidden = !available;
    const busy =
      s.busy ||
      Boolean(permission) ||
      Boolean(transferToken) ||
      Boolean(actions?.owner);
    buttons.send.disabled = !available || busy || !s.canSetImage || !draft;
    buttons.read.disabled = !available || busy || !s.canReadImage;
    buttons.paste.disabled =
      !available ||
      busy ||
      !s.toServer ||
      !globalThis.isSecureContext ||
      !supported() ||
      typeof navigator.clipboard?.read !== 'function';
    buttons.copy.disabled =
      !available ||
      busy ||
      !received ||
      !globalThis.isSecureContext ||
      !supported() ||
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
  const transfer = (operation) => {
    const s = client.snapshot;
    if (
      disposed ||
      !s.available ||
      !s.image ||
      s.busy ||
      permission ||
      transferToken ||
      actions?.owner ||
      (operation === 'set' ? !draft || !s.canSetImage : !s.canReadImage)
    )
      return;
    const epoch = ++version,
      token = {};
    let promise;
    try {
      transferToken = token;
      if (operation === 'set') {
        validateClipboardImageWrite(draft, s.maximum);
        promise = client.setImage(draft);
      } else promise = client.readImage();
    } catch {
      transferToken = undefined;
      status.textContent =
        'Изображение превышает лимит или имеет неподдерживаемый формат';
      changed();
      return;
    }
    status.textContent = 'Передача изображения…';
    changed();
    void Promise.resolve(promise).then(
      (result) => {
        let item = result.item;
        try {
          if (
            disposed ||
            epoch !== version ||
            !client.snapshot.available ||
            !client.snapshot.image
          )
            return;
          if (result.status !== 'accepted') {
            status.textContent =
              'Передача изображения не выполнена: ' + result.status;
            return;
          }
          if (operation === 'read') {
            validateClipboardImageItem(item, s.maximum);
            wipe(received);
            received = {
              width: item.width,
              height: item.height,
              rgba: item.rgba,
            };
            item = undefined;
            display();
            status.textContent =
              'Изображение получено. Копирование — отдельной кнопкой.';
          } else {
            wipe(draft);
            draft = undefined;
            display();
            status.textContent =
              'Изображение предложено удалённому буферу обмена. Вставьте его в удалённом приложении.';
          }
        } catch {
          wipe(received);
          received = undefined;
          display();
          status.textContent =
            'Изображение превышает лимит или имеет неподдерживаемый формат';
        } finally {
          wipe(item);
          if (transferToken === token) transferToken = undefined;
          changed();
        }
      },
      () => {
        if (transferToken === token) transferToken = undefined;
        if (!disposed && epoch === version) {
          status.textContent = 'Передача изображения не выполнена';
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
      !s.image ||
      s.busy ||
      permission ||
      transferToken ||
      actions?.owner ||
      !globalThis.isSecureContext ||
      !navigator.userActivation?.isActive ||
      !supported() ||
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
      // Start read/write directly in this trusted gesture. Promised PNG keeps
      // encoding asynchronous without delaying the OS write API invocation.
      if (operation === 'read') promise = navigator.clipboard.read();
      else {
        const png = conversion
          .run('encode', received, s.maximum)
          .then((result) => {
            if (!live(token) || result.status !== 'accepted')
              throw new Error('Image clipboard unavailable');
            return result.blob;
          });
        void png.catch(() => {}); // A constructor/API refusal may never consume it.
        promise = navigator.clipboard.write([
          new ClipboardItem({ 'image/png': png }),
        ]);
      }
    } catch {
      promise = Promise.reject(new Error());
    }
    status.textContent = 'Ожидание разрешения браузера';
    changed();
    const completion = Promise.resolve(promise).then(
      (items) =>
        operation === 'read'
          ? readItem(items, token, conversion).then(
              (value) => ({ status: 'ok', value }),
              () => ({ status: 'invalid' }),
            )
          : { status: 'ok' },
      () => ({ status: 'denied' }),
    );
    // If expiry wins immediately before a conversion reply, no unobserved item
    // may survive in a settled completion promise.
    void completion.then((result) => {
      if (!live(token)) wipe(result.value);
    });
    void Promise.race([completion, expiry]).then((result) => {
      if (
        disposed ||
        permission !== token ||
        epoch !== version ||
        !client.snapshot.available ||
        !client.snapshot.image
      ) {
        wipe(result.value);
        return;
      }
      const current = live(token);
      cancel();
      if (!current || result.status === 'expired') {
        wipe(result.value);
        status.textContent = 'Ожидание разрешения завершено';
      } else if (result.status === 'denied')
        status.textContent = 'Браузер отказал в доступе к буферу обмена';
      else if (result.status !== 'ok')
        status.textContent =
          'Изображение недоступно, превышает лимит или имеет неподдерживаемый формат';
      else if (operation === 'read') {
        try {
          wipe(draft);
          draft = result.value;
          display();
          status.textContent =
            'Изображение вставлено локально. Отправка — отдельной кнопкой.';
        } catch {
          wipe(draft);
          draft = undefined;
          display();
          status.textContent = 'Предпросмотр изображения недоступен';
        }
      } else status.textContent = 'Изображение скопировано';
      changed();
    });
  };
  on('paste', () => local('read'));
  on('send', () => transfer('set'));
  on('read', () => transfer('read'));
  on('copy', () => local('write'));
  on('clear', () => {
    clear();
    status.textContent = 'Локальные изображения очищены';
    changed();
  });
  display();
  changed();
  return {
    changed,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      conversion.dispose();
      for (const remove of listeners) remove();
      for (const button of Object.values(buttons)) button.disabled = true;
      panel.hidden = true;
    },
  };
}
