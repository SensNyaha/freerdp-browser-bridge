# Установка и обслуживание standalone 0.3.0

Для интеграции Java/Python/Go/.NET backend, VM-портала или внутреннего web-портала
bridge устанавливается отдельной службой. Подробные сценарии, JWT/API и
ограничения описаны в [контракте standalone](STANDALONE.md).

## Выбор и проверка файла

Скачайте файлы из [Release v0.3.0](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.3.0).
Все дистрибутивы содержат приватный Node.js и native runtime: системные npm,
FreeRDP и компилятор для запуска не требуются.

| Хост | Файл | Режим |
| --- | --- | --- |
| Windows x64 | `freerdp-bridge-0.3.0-win32-x64.msi` | Автоматическая Windows-служба |
| Windows x64 | `freerdp-bridge-0.3.0-win32-x64.zip` | Запуск обычным пользователем |
| Linux x64/glibc, DEB | `freerdp-bridge_0.3.0_amd64.deb` | systemd-служба |
| Linux x64/glibc, RPM | `freerdp-bridge-0.3.0-1.x86_64.rpm` | systemd-служба |
| Linux x64/glibc | `freerdp-bridge-0.3.0-linux-x64-gnu.tar.gz` | Запуск обычным пользователем |

Сверьте SHA-256 скачанного файла с `freerdp-bridge-0.3.0-standalone-SHA256SUMS.txt`
и таблицей [финальной приёмки](RUNTIME_RECOVERY.md#030-public-delivery). Сохраните source companions и
notices вместе с дистрибутивом. Для проверки файла:

```powershell
Get-FileHash -Algorithm SHA256 .\freerdp-bridge-0.3.0-win32-x64.msi
```

```sh
sha256sum freerdp-bridge_0.3.0_amd64.deb
```

Автоматическая проверка установщиков пройдена на Windows Server 2025 и Ubuntu
24.04; финальный DEB/RPM дополнительно проверен на Astra 1.7.5 и RED OS 7.3.
Произвольные ОС/security profiles, macOS, ARM и musl этим не принимаются.

## Windows MSI

Запустите MSI с правами администратора и завершите установку. По умолчанию:

| Объект | Расположение |
| --- | --- |
| Служба | `FreeRDPBridge`, учётная запись LocalService |
| Программа | `C:\Program Files\FreeRDP Bridge` |
| Публичная конфигурация | `C:\ProgramData\FreeRDPBridge\config\bridge.json` |
| Приватный runtime | `C:\ProgramData\FreeRDPBridge\runtime` |

Фактические Program Files/ProgramData берутся из настроек Windows.
После правки конфигурации в PowerShell администратора:

```powershell
Restart-Service FreeRDPBridge
Get-Service FreeRDPBridge
```

Защищённые ACL создаёт установщик. Не расширяйте доступ к runtime и не
переносите его в static-каталог. Служба запускается автоматически, но начальная
конфигурация запрещает создание RDP-сессий до настройки ключей и targets.

## Linux DEB/RPM

Устанавливайте выбранный формат, не оба одновременно. Из каталога скачивания:

```sh
# Astra/Debian-подобный хост, выбран DEB:
sudo dpkg -i ./freerdp-bridge_0.3.0_amd64.deb

# RED OS/RPM-хост, выбран RPM:
sudo rpm -Uvh ./freerdp-bridge-0.3.0-1.x86_64.rpm
```

Не отключайте проверки зависимостей: при ошибке установщика сначала устраните
её причину. Для зарегистрированной службы:

```sh
systemctl status freerdp-bridge.service
# После изменения публичной конфигурации:
sudo systemctl restart freerdp-bridge.service
```

| Объект | Расположение |
| --- | --- |
| Учётная запись | Непривилегированная `freerdp-bridge` |
| Программа | `/opt/freerdp-bridge` |
| Публичная конфигурация | `/etc/freerdp-bridge/bridge.json` |
| Приватный runtime | `/run/freerdp-bridge`, режим 0700 |

Установщик задаёт владельца root:freerdp-bridge и права 0750 каталогу config,
0640 файлу. systemd запускает приложение без root и с приватным runtime.
Не запускайте отдельную root-копию Node вместо службы.

## Конфигурация и первое подключение

1. Начните с установленного `bridge.json`. В нём только публичные параметры.
2. Укажите `auth.issuer`, `auth.audience` и `auth.jwks.keys` с публичными RSA
   RS256 verification keys вашего приложения. Private signing key остаётся
   у issuer. Требования к JWT — в [identity contract](STANDALONE.md#jwt-identity).
3. Заполните точные пары host/port в `targets` и допустимые браузерные origins
   в `allowedOrigins`; [публичная конфигурация](STANDALONE.md#public-configuration).
   Этот allowlist глобальный. Разрешение конкретному пользователю конкретной
   VM проверяет backend портала перед созданием bridge-сессии.
4. Перезапустите службу. По умолчанию она слушает `127.0.0.1:8080`.
   Откройте локально `http://127.0.0.1:8080/viewer/`.
5. Для удалённого доступа настройте HTTPS reverse proxy с WebSocket upgrades.
   JWT, тела session-запросов и attach query tokens исключите из proxy-логов.
   Это same-origin сценарий; `allowedOrigins` не включает CORS автоматически.

JWT применяется в browser interface отдельно от RDP-пароля. Не сохраняйте JWT,
RDP-пароли или private keys в config, environment или командной строке.
Ключи и конфигурация перечитываются при перезапуске, не через remote JWKS.
Синхронизируйте часы сервера и issuer: проверка JWT допускает расхождение
только 5 секунд. Токен с `iat` в будущем или истёкшим `exp` получает 401;
увеличивать допуск вместо исправления часов не следует.

## Portable

Распакуйте ZIP/TGZ целиком, сохранив `node/`, `service/`, notices и launcher.
Запускайте своим пользователем: `./start.ps1` на Windows или `./start.sh` на
Linux. Закройте процесс через Ctrl+C/SIGTERM, дождитесь завершения worker.
Служба при этом не регистрируется. Полные правила путей, ACL/0700 и параметры
launcher — в [portable README](../packaging/standalone/portable/README.md).

## Обновление и удаление

Обновление заменяет программу и останавливает старые сессии. Запланируйте окно,
завершите пользовательские подключения и сохраните свою публичную конфигурацию.
Устанавливайте новую проверенную согласованную версию выбранным package manager
или MSI; portable заменяйте целиком при остановленном процессе. Переход
0.2.4 → 0.3.0 проверен; произвольный downgrade не является принятой процедурой.

MSI/DEB сохраняют публичную конфигурацию при обычном удалении. RPM может оставить
изменённый файл как `bridge.json.rpmsave`; перед переустановкой проверьте и
восстановите его осознанно. RPM upgrade перезапускает работающую службу,
а намеренно остановленную оставляет остановленной.

Удаляйте MSI через список установленных приложений Windows; DEB —
`sudo dpkg -r freerdp-bridge`, RPM — `sudo rpm -e freerdp-bridge`.
Учётная запись службы сохраняется, чтобы повторное использование UID не изменило
владение чужими файлами. Удаление конфигурации/учётной записи — отдельное решение
администратора. Для portable после остановки удаляется только его извлечённый
каталог и собственный пустой runtime.
