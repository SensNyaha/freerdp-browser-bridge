# Identity и cookies при встраивании bridge

Этот контракт общий для принятых Fastify, NestJS и node:http adapters. Host
проверяет пользователя приложения; bridge отдельно передаёт RDP credentials
native worker через private IPC. Application bearer и пароль удалённой RDP
учётной записи — разные значения, их нельзя подменять друг другом.

## Callback приложения

`authenticate(IncomingMessage)` получает исходный request и возвращает
`{ id: verifiedPrincipalId }` либо undefined, синхронно или через Promise.
`id` — непустая стабильная строка до 256 символов. Bridge ограничивает ожидание
пятью секундами и выдаёт фиксированный отказ при ошибке; сам host verifier также
должен ограничивать свои сетевые операции и не писать токены в диагностику.

Callback обращается к существующему JWT/bearer verifier либо к проверенной
host mTLS identity. Наличие Authorization само по себе не является проверкой.
Controller guards, поздний Express middleware и framework request.user не
становятся защитой raw bridge HTTP/WS автоматически. Подключайте свой auth
service явно, до передачи identity в bridge. Не возвращайте одного постоянного
пользователя для всех внешних запросов.

Application identity не является разрешением на произвольный RDP target.
В этих adapters нет отдельного per-target allowlist callback. Destination
ограничивается доверенным host orchestration и сетевой egress-политикой.
Лимиты SessionManager относятся к конкретному экземпляру, не ко всей машине.

## Запрет Cookie header относится и к WebSocket

Текущий core отказывает authenticated REST при наличии **любого Cookie header**,
даже если одновременно передан корректный bearer. WS upgrade тоже отклоняется
при Cookie header. Это сильнее формулировки «cookie не используется как identity»:
посторонний session cookie приложения также влияет на результат. Cookie/CSRF
adapter здесь не реализован и не принимается по сходству с host framework.

Для собственного REST клиента задавайте:

```js
await fetch('/rdp/v1/diagnostics', {
  credentials: 'omit',
  headers: applicationAuthorizationHeaders(),
});
```

Reference connection form уже использует `credentials: 'omit'`. Однако это
не управляет cookies браузерного WebSocket: его handshake использует cookies
по правилам браузера, без аналогичной опции constructor. Это следует из
[WebSockets Standard, opening handshake](https://websockets.spec.whatwg.org/#opening-handshake).

Для same-port приложения согласуйте Cookie Path/Domain так, чтобы `/rdp`
не получал cookies. Например, cookies приложения могут быть ограничены `/app`,
если его защищённые маршруты действительно находятся под этим путём, а bridge
работает под `/rdp`. Cookie с `Path=/` на том же host не подходит текущему WS
профилю. Изменение Path должно соответствовать реальным маршрутам приложения.

Cookie-free API origin — другой вариант размещения, но host тогда отдельно
реализует точный CORS/preflight и proxy policy; сам `allowedOrigins` не добавляет
CORS headers и не принимает такой deployment без проверки. Domain-wide cookie
родительского домена может попасть и на другой subdomain. Не считайте удаление
Cookie header после чтения host session реализацией принятого cookie/CSRF adapter.

## Attach и журналы

После authenticated session create выдаются отдельные короткоживущие одноразовые
control/media tokens. WS использует эти tokens и разрешённый Origin; browser
constructor не получает application bearer через произвольные HTTP headers.
При reattach получайте новые tokens через authenticated HTTP владельца.
Один token нельзя использовать повторно или для другого канала/сессии.

Храните application/RDP/attach credentials только в необходимой памяти текущего
flow. Не записывайте их в argv/env, профили, source, логи, errors или metrics.
Host/proxy должны исключать Authorization, Cookie, session bodies и attach query
из access logs. Redaction bridge не отменяет уже выполненный host/proxy logger.
Browser permission и server capability/policy остаются разными проверками.

Framework-specific wiring: [Fastify](FASTIFY_USAGE.md), [NestJS](NESTJS_USAGE.md),
[node:http](NODE_HTTP_USAGE.md). Полная исходная программа cookie/auth/device
расширений и deployment acceptance остаётся в [TODO](../TODO.md).
