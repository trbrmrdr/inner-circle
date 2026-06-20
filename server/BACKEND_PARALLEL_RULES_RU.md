# Backend parallel rules

Этот файл фиксирует границы backend-чата, чтобы параллельная работа с captcha/frontend-чатом не конфликтовала.

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
TELEGRAM_ENABLED
TELEGRAM_TECH_ENABLED
AUTOPOST_ENABLED
DEEPSEEK_ENABLED
VK_ENABLED
INSTAGRAM_ENABLED
FACEBOOK_ENABLED
```

## Ожидаемые env-профили

### Local

Локально можно включать сервисы по одному для отладки.

```text
EMAIL_ENABLED=true
GOOGLE_SHEETS_ENABLED=true
TELEGRAM_ENABLED=true
TELEGRAM_TECH_ENABLED=true
AUTOPOST_ENABLED=false
```

### Moscow

Moscow fallback-сервер должен принимать заявки и сохранять/уведомлять, но не обязан делать автопостинг и Meta/VK/DeepSeek.

```text
EMAIL_ENABLED=true
GOOGLE_SHEETS_ENABLED=true
TELEGRAM_ENABLED=true
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
TELEGRAM_ENABLED=true
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
- `TELEGRAM_ENABLED=true`;
- `TELEGRAM_TECH_ENABLED=true`.

Если один из этих включенных каналов не отработал, Germany отвечает `ok=false`, `accepted` может быть `true`, а frontend вызывает Moscow fallback.

Для Moscow можно включить только надежные каналы приема заявки:

- email;
- Google Sheets;
- Telegram tech.

## Email

Email должен быть универсальным:

- если настроена одна почта, отправляем через одну;
- если настроены Google и Yandex, отправляем через обе;
- ошибка одного SMTP не должна отменять попытку второго SMTP;
- результат каждого SMTP возвращается в `results`.

Базовые provider names:

```text
google
yandex
legacy
```

## Google Sheets

Серверный sync отвечает за обязательные листы и колонки.

Команды:

```bash
npm run sheets:check
npm run sheets:sync
```

По умолчанию скрипт работает expand-only:

- создает недостающие листы;
- добавляет недостающие колонки;
- добавляет дефолтные строки `SETTINGS`;
- расширяет сетку, если не хватает строк/колонок;
- не сжимает сетку;
- не удаляет пользовательские строки, колонки и данные.

Сжатие сетки разрешается только явным флагом:

```bash
npm run sheets:sync -- --trim-grid
```

`GoogleSheetsService.AppendLead` пишет заявку по именам колонок листа `LEADS`, а не по жесткому диапазону `A:I`. Поэтому параллельный frontend/captcha-чат может добавлять поля формы через schema/sync, не ломая порядок существующих колонок.

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
