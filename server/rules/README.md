# Server rules index

Главная папка правил сервера. Новые backend/captcha/deploy/env задачи должны сначала сверяться с этими файлами.

## Files

- `SERVER_RULES.md` - базовая архитектура сервера и стиль статических классов.
- `BACKEND_PARALLEL_RULES_RU.md` - границы backend-чата и frontend/captcha-чата.
- `LEAD_FORM_CAPTCHA_RULES_RU.md` - контракт формы, captcha и API fallback.
- `SHEETS_CONTRACT.md` - контракт Google Sheets.
- `PACKAGE_JSON_RULES_RU.md` - стиль команд и comment-ключей в `package.json`.
- `SERVER_HOSTING_MAP_RU.md` - карта IP, DNS и назначения Moscow/Germany серверов.

## Mandatory reference rule

Если создается новый rules-файл для параллельного чата, он должен ссылаться на эту папку и не дублировать уже описанные правила без необходимости.
