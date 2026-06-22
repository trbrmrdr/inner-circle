# Backend parallel rules

Этот файл фиксирует границы backend-чата, чтобы параллельная работа с captcha/frontend-чатом не конфликтовала.

Общий индекс правил лежит в `server/rules/README.md`. Перед изменением команд в `package.json` обязательно сверяться с `server/rules/PACKAGE_JSON_RULES_RU.md`.

## Главный принцип

Код сервера один и тот же для local/Moscow/Germany. Поведение сервера отличается только `.env`.

Не вводим абстрактные роли вида:

```text
SERVER_ROLE
SERVER_PROFILE
```

Включение и выключение возможностей делается простыми feature flags:

```text
EMAIL_ENABLED
GOOGLE_SHEETS_ENABLED
TELEGRAM_POST_ENABLED
TELEGRAM_TECH_ENABLED
TELEGRAM_STARTUP_STATUS_ENABLED
AUTOPOST_ENABLED
DEEPSEEK_ENABLED
VK_ENABLED
INSTAGRAM_ENABLED
FACEBOOK_ENABLED
```

## Ожидаемые env-профили

Реальные файлы для ручной отладки:

```text
server/env/local.env
server/env/moscow.env
server/env/germany.env
```

Они нужны, чтобы визуально видеть настройки разных серверов и запускать один и тот же код в разных режимах. Эти файлы содержат пароли и токены, поэтому stage/git контролируется вручную владельцем проекта.

Запуск локально должен поддерживать явный выбор файла:

```bash
ENV_FILE=env/local.env npm run dev
ENV_FILE=env/moscow.env npm run dev
ENV_FILE=env/germany.env npm run dev
```

### Local

Локально можно включать сервисы по одному для отладки.

```text
EMAIL_ENABLED=true
GOOGLE_SHEETS_ENABLED=true
TELEGRAM_POST_ENABLED=true
TELEGRAM_TECH_ENABLED=true
AUTOPOST_ENABLED=false
```

### Moscow

Moscow fallback-сервер должен принимать заявки и сохранять/уведомлять, но не обязан делать автопостинг и Meta/VK/DeepSeek.

```text
EMAIL_ENABLED=true
GOOGLE_SHEETS_ENABLED=true
TELEGRAM_POST_ENABLED=false
TELEGRAM_TECH_ENABLED=true
AUTOPOST_ENABLED=false
DEEPSEEK_ENABLED=false
VK_ENABLED=false
INSTAGRAM_ENABLED=false
FACEBOOK_ENABLED=false
```

### Germany

Germany основной сервер. На нем можно включать полный набор интеграций.

```text
EMAIL_ENABLED=true
GOOGLE_SHEETS_ENABLED=true
TELEGRAM_POST_ENABLED=false
TELEGRAM_TECH_ENABLED=true
AUTOPOST_ENABLED=true
DEEPSEEK_ENABLED=true
VK_ENABLED=true
INSTAGRAM_ENABLED=true
FACEBOOK_ENABLED=true
```

## Lead flow

Captcha/frontend-чат отвечает за:

- captcha на клиенте;
- server-side captcha validation;
- fallback между Germany API и Moscow API;
- форму и поля `name/email/phone/date/guests/scenario/consent/captchaToken`;
- сохранение контракта `POST /api/lead`.

Backend-чат отвечает за функции, которые вызывает endpoint после успешной captcha:

- нормализация и форматирование заявки;
- Google Sheets append;
- email отправка через один или несколько SMTP provider-ов;
- Telegram tech notification;
- server health/test CLI;
- deploy/env profiles.

## Надежность заявки

`POST /api/lead` возвращает два уровня результата:

- `accepted` - хотя бы один реальный канал принял заявку;
- `ok` / `requiredOk` - все включенные обязательные каналы отработали успешно;
- `shouldFallback` - frontend должен вызвать второй сервер, если `true`.

Для Germany baseline такой:

- `EMAIL_ENABLED=true`;
- `GOOGLE_SHEETS_ENABLED=true`;
- `TELEGRAM_TECH_ENABLED=true`.

Germany отвечает `ok=true`, только если одновременно сработали:

- Google Sheets append;
- Telegram tech notification, если `TELEGRAM_TECH_ENABLED=true`;
- хотя бы один SMTP provider из включенных email-провайдеров.

Если Google Sheets не сработал, Telegram tech не сработал или не сработала ни одна почта, Germany отвечает `ok=false`, `accepted` может быть `true`, а frontend вызывает Moscow fallback.

Telegram флаги разделены:

- `TELEGRAM_POST_ENABLED` - только публичный Telegram-постинг/автопостинг;
- `TELEGRAM_TECH_ENABLED` - только технический чат, заявки, ошибки и статусы;
- `TELEGRAM_STARTUP_STATUS_ENABLED` - только сообщение о запуске сервера в технический чат; локально держим `false`, на VPS `true`;
- `TELEGRAM_TECH_ENABLED` не зависит от `TELEGRAM_POST_ENABLED`.

Технический Telegram-чат:

- повторяющийся статус автопостинга - это только heartbeat-marker: последнее время проверки, окно публикации и наличие due-постов;
- если после heartbeat-marker появилось событие, следующая проверка создает новый marker ниже и по возможности удаляет старый;
- события автопостинга всегда отдельными сообщениями: старт поста, успех конкретной сети, ошибка конкретной сети;
- старт поста пишет UID, строку, реально запускаемые платформы, плановое время, длину текста и плановое количество медиа;
- успех сети пишет platform id/message id, URL, фактическое количество медиа и длину текста;
- ошибка сети пишет UID, строку и ошибку этой сети;
- выключенные, не настроенные и не выбранные сети в технический чат не пишем.

Для Moscow можно включить только надежные каналы приема заявки:

- email; отправляем во все включенные почты, но успешность email-канала считается по правилу "хотя бы одна почта отправилась";
- Google Sheets;
- Telegram tech, если включен в env-профиле Moscow.

## Email

Email должен быть универсальным:

- если настроена одна почта, отправляем через одну;
- если настроены Google и Yandex, отправляем через обе;
- ошибка одного SMTP не должна отменять попытку второго SMTP;
- результат каждого SMTP возвращается в `results`.
- `channels.email.ok=true`, если успешно отправилась хотя бы одна включенная почта;
- `EMAIL_SEND_STRATEGY` не нужен и не вводится: стратегия всегда одна - отправить через все включенные SMTP provider-ы.

Базовые provider names:

```text
google
yandex
legacy
```

## Google Sheets

Серверный sync отвечает за обязательные листы и колонки.

`POSTS.post_id` - стабильный ключ строки, а не номер строки. Номер строки нельзя
использовать как постоянный ID, потому что строки можно сортировать и переносить.
Apps Script генерирует `post_id` для незапечатанных строк по `date`, `time`,
`platforms`, `text`, `media_ids`; если обязательных полей нет, очищает ID; если
статус уже `processing`, `posted`, `done`, `partial` или есть platform message/post
id, ID не меняет. Дубли и отсутствующие ID в готовых/запечатанных строках
подсвечиваются красным.

Для реального автопостинга обязательны `status=ready`, `post_id`, `date`, `time`,
`platforms` и хотя бы один контентный блок: `text` или `media_ids`. Если `status`
пустой, `template` или `draft`, строка не публикуется. Если `platforms` пустой,
сервер не подставляет Telegram по умолчанию.

`*date_marker` остается календарным маркером: прошлое красное, сегодня зеленое,
будущее синее. Если строка со `status=ready` невалидна для публикации, Apps Script
красит marker фиолетовым.

`platforms` можно разделять запятой, точкой с запятой или переносом строки.
Поддерживаем алиасы: `telegram`/`tg`/`телеграм`, `vk`/`вк`,
`instagram`/`ig`/`inst`, `facebook`/`fb`.

Комментарии к заголовкам Google Sheets и описания `SETTINGS.description` пишем
обычным plain text: notes не поддерживают жирный текст. Чтобы строгие значения не
сливались с пояснениями, каждое значение или пример оформляем в квадратных
скобках: `[ready]`, `[telegram; vk; instagram]`, `[true]`, `[60000]`. В длинных
комментариях используем секции `ЗНАЧЕНИЯ`, `ПРИМЕР`, `ФОРМАТ VALUE` и переносы
строк.

`MEDIA.preview_url` используется только для превью в таблице. Для публикации
используются `file_id`, `media_url` или `public_url`.

Команды:

```bash
npm run sheets:check
npm run sheets:sync
```

По умолчанию скрипт держит управляемые листы компактными:

- создает недостающие листы;
- добавляет недостающие колонки;
- добавляет дефолтные строки `SETTINGS`;
- расширяет сетку, если не хватает строк/колонок;
- сжимает пустые trailing-строки и trailing-столбцы до фактически используемой области плюс 1 строка и 1 столбец;
- не сжимает сетку ниже непустых данных.

Expand-only режим включается только явным флагом:

```bash
npm run sheets:sync -- --no-trim-grid
```

`GoogleSheetsService.AppendLead` пишет заявку по именам колонок листа `LEADS`, а не по жесткому диапазону `A:I`. Минимальная схема лидов сейчас: `created_at`, `name`, `phone`, `email`, `telegram`, `date`, `guests`, `scenario`, `consent`, `meta_json`.

Runtime-правило для лидов: если лист `LEADS` существует, но часть колонок еще не создана, сервер все равно должен создать ряд по доступным/известным полям и не падать из-за порядка колонок. Полную синхронизацию схемы делаем командой `npm run sheets:sync`, особенно перед deploy.

Старые колонки `lead_uid`, `message`, `page`, `source` не входят в текущий контракт. Обычный `sheets:sync` их не удаляет. Если такие колонки уже есть в живой таблице, удаляем их вручную после проверки данных.

## Static class call style

В коде должен быть виден прямой порядок вызовов:

```ts
DeepSeekTextHelper.Prepare(...)
InstagramPublisher.PublishPost(...)
FacebookPublisher.PublishPost(...)
VkPublisher.PublishPost(...)
TelegramPublisher.PublishPost(...)
EmailPublisher.SendLead(...)
GoogleSheetsService.AppendLead(...)
```

Правила:

- классы статические;
- методы вызываются через `ClassName.MethodName(...)`;
- `getInstance`, сервис-контейнеры и hidden singleton facade не используются;
- проверка `ENABLED` живет внутри класса конкретного сервиса;
- orchestration-класс только перечисляет понятные вызовы и собирает результаты.

DeepSeek не публикует посты. Он только подготавливает текст. Если `DEEPSEEK_ENABLED=false` или DeepSeek упал, автопостинг использует исходный текст из таблицы.

## Deploy and sync

Перед выкладкой на Moscow/Germany deploy-скрипт должен уметь запускать:

```bash
npm run sheets:check
npm run sheets:sync
```

Но это не должно происходить на каждый входящий лид. Схему таблицы синхронизируем перед deploy или вручную, а runtime append должен быть устойчивым к уже существующим пользовательским колонкам и строкам.

## Что не трогать в backend-чате

Без прямого запроса не менять:

```text
app/src/pages/ru/kontakt/index.html
app/src/scripts/**
captcha frontend logic
client fallback endpoint order
```

## Что не трогать в captcha/frontend-чате

Без прямого запроса не менять:

```text
server/src/publishers/EmailPublisher.ts
server/src/config/EmailConfig.ts
server/src/publishers/TelegramPublisher.ts
server/src/sheets/GoogleSheetsService.ts
server/src/sheets/SheetsSchema.ts
server/scripts/sync-google-sheets.ts
```
