# Lead form, captcha and API fallback rules

Этот файл фиксирует границы работ между параллельными чатами.

## Зона ответственности этого чата

Этот чат делает только:

1. Работу формы сайта.
2. Invisible reCAPTCHA на клиенте.
3. Проверку reCAPTCHA на сервере.
4. Контракт `POST /api/lead`.
5. Клиентский fallback между API-адресами.
6. Нормализацию полей формы перед вызовом серверных функций.

Этот чат НЕ делает:

1. SMTP-настройки и мультипочту.
2. Реализацию Google Sheets бизнес-логики глубже существующего `GoogleSheetsService`.
3. Telegram/VK/Instagram/Facebook автопостинг.
4. Deploy-профили Moscow/Germany/All.
5. Боевые `.env` на серверах, кроме ключей captcha по прямой задаче.

Эти задачи должны идти в другом чате.

Backend-границы второго чата дополнительно зафиксированы в:

```text
server/BACKEND_PARALLEL_RULES_RU.md
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
  "date": "День, вечер или ночевка",
  "guests": "4-8 человек",
  "scenario": "Описание сценария",
  "consent": true,
  "captchaToken": "token-from-recaptcha",
  "page": "https://inner-circle.spi.ski/ru/kontakt/",
  "source": "inner-circle-site",
  "meta": {
    "apiEndpoint": "https://202073.com/api/lead",
    "language": "ru"
  }
}
```

Ответ успеха:

```json
{
  "ok": true,
  "results": []
}
```

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
`RECAPTCHA_SECRET_KEY` только в реальный `.env`, не в git.

## API fallback

Пока DNS не готов, frontend должен уметь работать с такими endpoint-ами:

```text
https://202073.com/api/lead
https://inner-circle.spi.ski/api/lead
http://78.17.131.89/api/lead
```

Правила:

1. На production HTTPS-странице нельзя вызывать `http://78.17.131.89` из-за mixed content.
2. `http://78.17.131.89` разрешен только для локальной проверки или до HTTPS.
3. Основной production порядок после DNS:

```text
https://api.inner-circle.spi.ski/api/lead
https://inner-circle.spi.ski/api/lead
```

4. reCAPTCHA token одноразовый. Для каждой fallback-попытки нужно получать новый token.

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
name/email/phone/date/guests/scenario/consent
ok/message response shape
```

Если второй чат расширяет Google Sheets, он должен сохранить прием этих полей на сервере.

## Границы для этого чата

Этот чат может менять:

```text
app/src/pages/ru/kontakt/index.html
app/src/scripts/**
server/src/routes/lead.routes.ts
server/src/core/LeadProcessor.ts
server/src/config/RecaptchaConfig.ts
server/src/core/RecaptchaService.ts
server/src/types/autopost.ts
```

Этот чат не должен менять боевые SMTP/Google/Telegram секреты.
