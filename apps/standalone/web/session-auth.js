import './session-form.js';

const form = document.querySelector('#application-auth');
const input = form.elements.accessToken;
const status = document.querySelector('#application-auth-status');
let token = '';
const configure = () =>
  window.bridgeConnection.configure({
    basePath: '/rdp',
    authorize: () => (token ? { Authorization: 'Bearer ' + token } : {}),
  });
configure();
form.querySelector('button').disabled = false;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const next = input.value.trim();
  input.value = '';
  if (
    next.length > 8185 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(next)
  ) {
    status.textContent = 'Проверьте токен доступа приложения.';
    return;
  }
  try {
    configure();
    token = next;
    status.textContent = 'Токен применяется только на этой странице.';
  } catch {
    status.textContent = 'Сначала завершите текущее подключение.';
  }
});
window.addEventListener('pagehide', () => {
  input.value = '';
  // Keep the in-memory identity until the already bounded owner DELETE joins.
  void window.bridgeConnection
    .stop()
    .catch(() => {})
    .finally(() => {
      token = '';
    });
});
