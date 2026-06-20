# Server hosting map

Этот файл фиксирует реальные IP и назначение серверов Inner Circle. Перед DNS/deploy правками сверяться с ним.

## Servers

| Name | IP | Purpose | Notes |
| --- | --- | --- | --- |
| Moscow / static / secondary | `155.212.245.24` | Статика `inner-circle.spi.ski`, root/wildcard `spi.ski`, secondary API `api2.inner-circle.spi.ski` | Центральные `Caddyfile` и `docker-compose.yml` живут в проекте `Spi.Ski/server.host`; Inner Circle не должен перетирать host-файлы. |
| Germany / primary API | `78.17.131.89` | Основной API `api.inner-circle.spi.ski`, полный сервер с Telegram/Google Sheets/email/autopost | Standalone API VPS; Caddyfile для этого профиля хранится в `server/deploy/default-ip/Caddyfile`. Не путать с Moscow. |

## DNS records in REG.RU

Текущий минимум для статики:

```text
A      @                 155.212.245.24
A      *                 155.212.245.24
A      inner-circle      155.212.245.24
CNAME  www.inner-circle  inner-circle.spi.ski.
```

Для API добавить явно:

```text
A      api.inner-circle          78.17.131.89
A      api2.inner-circle         155.212.245.24
```

`*` уже отправляет неизвестные поддомены на Moscow/static IP, но `api.inner-circle` должен быть явной записью на Germany IP, чтобы wildcard его не перехватывал.

## Public URLs

```text
https://inner-circle.spi.ski
https://www.inner-circle.spi.ski
https://api.inner-circle.spi.ski
https://api2.inner-circle.spi.ski
```

## Env profiles

```text
server/env/moscow.env   -> PUBLIC_BASE_URL=https://api2.inner-circle.spi.ski
server/env/germany.env  -> PUBLIC_BASE_URL=https://api.inner-circle.spi.ski
```

## Deploy defaults

```text
npm run deploy:moscow   -> root@155.212.245.24
npm run deploy:germany  -> root@78.17.131.89
```

## Host ownership

Moscow:

```text
/Users/trbrmrdr/Documents/Project/Spi.Ski/server.host/Caddyfile
/Users/trbrmrdr/Documents/Project/Spi.Ski/server.host/docker-compose.yml
/Users/trbrmrdr/Documents/Project/Spi.Ski/synch_to_server.sh
```

Эти файлы обслуживают статику `inner-circle.spi.ski` и secondary API `api2.inner-circle.spi.ski` вместе с другими доменами/проектами. Их нельзя автоматически заменять из Inner Circle deploy-скрипта.

Для `api2.inner-circle.spi.ski` в этом Caddyfile нужен отдельный блок:

```caddy
api2.inner-circle.spi.ski {
	reverse_proxy innercircle-moscow-server:4100
}
```

Сервис `innercircle-moscow-server` должен быть описан в `Spi.Ski/server.host/docker-compose.yml`, чтобы `land-static-caddy` видел его по имени внутри общего compose-проекта.

Inner Circle deploy для Moscow делает только:

- сборку локального `server`;
- выгрузку кода в `/opt/server.inner-circle-moscow`;
- выгрузку `server/env/moscow.env` как `/opt/server.inner-circle-moscow/.env`;
- выгрузку Google credentials как `/opt/server.inner-circle-moscow/private/google-service-account.json`.

Запуск/перезапуск контейнера и Caddy на Moscow делает `Spi.Ski/synch_to_server.sh`.

Главная точка входа для ручного запуска из этого проекта:

```bash
cd /Users/trbrmrdr/Documents/Project/Inner-Circle
bash ./synch_to_server.sh --static          # только статика
bash ./synch_to_server.sh --secondary       # secondary API + host Caddy через Spi.Ski
bash ./synch_to_server.sh --primary         # primary API + Caddy на Germany
bash ./synch_to_server.sh --all             # статика + secondary API + primary API
bash ./synch_to_server.sh --caddy-secondary # только host Caddy на Moscow
```

`Inner-Circle/synch_to_server.sh` не хранит московский Caddy/compose. Он только вызывает нужный `Spi.Ski/synch_to_server.sh`, где эти файлы реально лежат.

Germany:

```text
server/deploy/default-ip/Caddyfile
```

На Германии это отдельный API-хост, поэтому Caddy можно держать внутри Inner Circle deploy-профиля.
