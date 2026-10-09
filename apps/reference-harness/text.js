export function validText(text) {
  return (
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= 256 &&
    !/[\ud800-\udfff]/u.test(text) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text)
  );
}

/** Explicit committed-text fallback. No composition/preedit data is forwarded. */
export function installText(form, send, ready) {
  const field = form.querySelector('textarea');
  const button = form.querySelector('button');
  const status = form.querySelector('[role="status"]');
  let composing = false,
    pending = false,
    disposed = false,
    generation = 0;
  const listeners = [];
  function on(name, handler) {
    form.addEventListener(name, handler);
    listeners.push(() => form.removeEventListener(name, handler));
  }
  function refresh() {
    button.disabled =
      disposed || pending || composing || !ready() || !validText(field.value);
    field.disabled = disposed || pending;
  }
  function reset() {
    generation++;
    pending = composing = false;
    field.value = '';
    status.textContent = '';
    refresh();
  }
  on('compositionstart', () => {
    composing = true;
    refresh();
  });
  on('compositionend', () => {
    composing = false;
    refresh();
  });
  on('input', refresh);
  on('submit', (event) => {
    event.preventDefault();
    if (disposed || pending || composing || !ready()) return;
    if (!validText(field.value)) {
      status.textContent =
        'Введите корректный текст длиной до 256 UTF-16 единиц.';
      refresh();
      return;
    }
    pending = true;
    const text = field.value;
    const epoch = generation;
    status.textContent = 'Отправка текста';
    refresh();
    void Promise.resolve()
      .then(() => {
        if (!disposed && epoch === generation) return send(text);
      })
      .then((result) => {
        if (disposed || epoch !== generation) return;
        if (result === 'sent') field.value = '';
        status.textContent =
          result === 'sent'
            ? 'Текст отправлен'
            : result === 'unavailable'
              ? 'Сервер не поддерживает ввод Unicode'
              : result === 'paused'
                ? 'Дождитесь окончания изменения разрешения'
                : 'Не удалось отправить текст';
      })
      .catch(() => {
        if (!disposed && epoch === generation)
          status.textContent = 'Не удалось отправить текст';
      })
      .finally(() => {
        if (disposed || epoch !== generation) return;
        pending = false;
        refresh();
      });
  });
  refresh();
  return {
    refresh,
    reset,
    dispose() {
      disposed = true;
      reset();
      for (const remove of listeners) remove();
    },
  };
}
