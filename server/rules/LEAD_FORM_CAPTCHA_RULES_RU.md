# Lead form, captcha and API fallback rules

Этот файл фиксирует границы работ между параллельными чатами.

## Зона ответственности этого чата

Этот чат делает только:

1. Работу формы сайта.
2. Invisible reCAPTCHA на клиенте.
3. Проверку reCAPTCHA на сервере.
4. Контракт `POST /api/lead`.
5. Клиентский fallback между API-адресами.
6. Передачу полей формы в серверный endpoint без изменения бизнес-логики каналов.

Этот чат НЕ делает:

1. SMTP-настройки и мультипочту.
2. Реализацию Google Sheets бизнес-логики глубже существующего `GoogleSheetsService`.
3. Telegram/VK/Instagram/Facebook автопостинг.
4. Deploy-профили Moscow/Germany/All.
5. Боевые `.env` на серверах, кроме ключей captcha по прямой задаче.

Эти задачи должны идти в другом чате.

Backend-границы второго чата дополнительно зафиксированы в:

```text
server/rules/BACKEND_PARALLEL_RULES_RU.md
```

## Текущая форма

Основная форма находится в:

```text
app/src/pages/ru/kontakt/index.html
```

Поля формы:

```text
name
email
phone
telegram
date
guests
scenario
consent
```

Серверный endpoint должен принять эти поля как JSON.

## Серверный контракт

Основной endpoint:

```text
POST /api/lead
Content-Type: application/json
```

Минимальное тело запроса:

```json
{
  "name": "Имя",
  "email": "name@example.com",
  "phone": "+79990000000",
  "telegram": "@username",
  "date": "День, вечер или ночевка",
  "guests": "4-8 человек",
  "scenario": "Описание сценария",
  "consent": true,
  "captchaToken": "token-from-recaptcha",
  "meta": {
    "apiEndpoint": "https://api.inner-circle.spi.ski/api/lead",
    "formName": "inner-circle-request",
    "language": "ru",
    "referrer": ""
  }
}
```

Правило контакта: пользователь должен оставить хотя бы один контакт из `phone`, `email`, `telegram`. Telegram проверяется только по формату `@username` / `t.me/username`; подтверждение существования аккаунта не является частью frontend/captcha-контракта.

Ответ успеха:

```json
{
  "ok": true,
  "accepted": true,
  "requiredOk": true,
  "shouldFallback": false,
  "message": "Lead processed",
  "channels": {
    "sheets": { "required": true, "ok": true },
    "email": { "required": true, "ok": true },
    "telegramTech": { "required": true, "ok": true }
  },
  "results": []
}
```

Частичный ответ от основного Germany API:

```json
{
  "ok": false,
  "accepted": true,
  "requiredOk": false,
  "shouldFallback": true,
  "message": "Lead accepted partially or failed on a required channel",
  "results": []
}
```

Правило frontend fallback: если `shouldFallback=true` или `ok=false`, клиент получает новый reCAPTCHA token и вызывает следующий API endpoint. Если `accepted=true`, можно показывать пользователю мягкий успех только после завершения fallback-цепочки или если второй endpoint тоже недоступен.

Правило backend-успеха для основного Germany API: `ok=true`, только если сработали Google Sheets, Telegram tech и хотя бы одна включенная почта. Если настроены Google и Yandex, backend пытается отправить через обе почты, но `channels.email.ok=true` уже при успешной отправке хотя бы одной из них.

Ответ ошибки:

```json
{
  "ok": false,
  "message": "Human readable error"
}
```

## reCAPTCHA

Используется invisible reCAPTCHA v2.

Клиент:

1. Загружает Google reCAPTCHA script.
2. На submit вызывает `grecaptcha.execute`.
3. Получает token.
4. Отправляет token в `captchaToken`.

Сервер:

1. Берет `captchaToken` из body.
2. Проверяет через Google `siteverify`.
3. При ошибке возвращает `400/403`.
4. Не вызывает `LeadProcessor.Handle`, если captcha не прошла.

Env keys:

```text
RECAPTCHA_ENABLED
RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY
RECAPTCHA_ALLOWED_HOSTS
```

`RECAPTCHA_SITE_KEY` публичный и может попасть во frontend.
`RECAPTCHA_SECRET_KEY` только в реальные `server/env/*.env`, под ручным контролем stage/git.

Важное правило по env:

1. Все реальные env-профили лежат в `server/env`.
2. Основные файлы: `server/env/local.env`, `server/env/moscow.env`, `server/env/germany.env`.
3. `server/src/config/Env.ts` по умолчанию читает `server/env/local.env`, если `ENV_FILE` не задан.
4. `server/scripts/deploy-profile.sh` при деплое берет выбранный профиль из `server/env` и загружает его на сервер как `.env`.
5. `server/deploy/default-ip/.env.disabled` не содержит рабочих captcha-ключей, это безопасный disabled-шаблон.

## API fallback

Frontend production endpoint-ы:

```text
https://api.inner-circle.spi.ski/api/lead
https://api2.inner-circle.spi.ski/api/lead
```

Правила:

1. На production HTTPS-странице нельзя вызывать прямые `http://IP` endpoint-ы из-за mixed content.
2. Локально frontend игнорирует `data-lead-endpoints` и отправляет только на `form.action`, то есть `/api/lead`, через dev-server proxy.
3. Production порядок:

```text
https://api.inner-circle.spi.ski/api/lead
https://api2.inner-circle.spi.ski/api/lead
```

4. reCAPTCHA token одноразовый. Для каждой fallback-попытки нужно получать новый token.
5. Если Germany вернул `ok=false` и `shouldFallback=true`, это не обязательно полный провал: часть каналов могла принять заявку. Клиент все равно вызывает Moscow для дублирования.

## Границы для второго чата

Второй чат может менять:

```text
server/src/publishers/EmailPublisher.ts
server/src/config/EmailConfig.ts
server/src/sheets/GoogleSheetsService.ts
server/src/sheets/SheetsSchema.ts
server/deploy/**
server/.env.example
```

Но второй чат не должен ломать контракт:

```text
POST /api/lead
captchaToken
name/email/phone/telegram/date/guests/scenario/consent
ok/accepted/requiredOk/shouldFallback/message response shape
```

Если второй чат расширяет Google Sheets, он должен сохранить прием этих полей на сервере.

## Границы для этого чата

Этот чат может менять:

```text
app/src/pages/ru/kontakt/index.html
app/src/scripts/**
server/src/routes/lead.routes.ts
server/src/config/RecaptchaConfig.ts
server/src/core/RecaptchaService.ts
```

Этот чат не должен менять боевые SMTP/Google/Telegram секреты.

`LeadProcessor`, `server/src/types/autopost.ts`, `GoogleSheetsService`, `SheetsSchema`, email providers и deploy/env профили считаются backend-зоной второго чата. Этот чат трогает их только если без этого невозможно подключить captcha route, и только после сверки с `server/rules/BACKEND_PARALLEL_RULES_RU.md`.
