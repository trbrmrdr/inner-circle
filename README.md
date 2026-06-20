# Inner Circle Deploy

```bash
bash ./synch_to_server.sh
```

Все основные команды вызываются из корня `Inner-Circle`. Без аргументов скрипт
только показывает help и ничего не пушит.

## Частые команды

```bash
bash ./synch_to_server.sh --static
bash ./synch_to_server.sh --secondary
bash ./synch_to_server.sh --primary
bash ./synch_to_server.sh --all
bash ./synch_to_server.sh --caddy-secondary
```

- `--static` - собрать сайт и выгрузить статику на Moscow.
- `--secondary` - выгрузить secondary API на Moscow и обновить host Caddy.
- `--primary` - выгрузить primary API на Germany с отдельным Caddy.
- `--all` - статика + Moscow API + Germany API.
- `--caddy-secondary` - только обновить Moscow Caddy/host-файлы.

## Google Sheets

По умолчанию deploy не синхронизирует таблицу.

```bash
bash ./synch_to_server.sh --sheets-check
bash ./synch_to_server.sh --sheets-sync
bash ./synch_to_server.sh --all --sheets-sync
```

- `--sheets-check` - dry-run, покажет будущие изменения.
- `--sheets-sync` - создаст недостающие листы/колонки.
- При `--all --sheets-sync` таблица синхронизируется один раз.

## Где лежит инфраструктура

- Moscow host: `/Users/trbrmrdr/Documents/Project/Spi.Ski/server.host`
- Moscow Caddy/API2: `api2.inner-circle.spi.ski`
- Germany standalone API: `server/deploy/default-ip`
- Germany Caddy/API: `api.inner-circle.spi.ski`

## Соседний Spi.Ski

```bash
/Users/trbrmrdr/Documents/Project/Spi.Ski/synch_to_server.sh
```

- `--inner-circle-server` - код/env/credentials + secondary API + Caddy.
- `--caddy` - только host Caddy/compose, без статики и API-кода.

## `server/scripts/deploy-profile.sh`

- `moscow` - пушит код, `env/moscow.env` и Google credentials в
  `/opt/server.inner-circle-moscow`; контейнер запускает host-скрипт `Spi.Ski`.
- `germany` - пушит код, `env/germany.env`, Google credentials и сам поднимает
  API + Caddy на Germany.

Обычно его не нужно вызывать вручную. Используй `./synch_to_server.sh`.

## Служебные проверки

```bash
cd server
npm run telegram:updates
npm run telegram:chat -- --chat @channel
npm run email:test
npm run deploy:network
npm run deploy:static
```

У этих команд есть `--help`; они нужны для точечной проверки Telegram, email,
доступности внешних API и опубликованной статики.
