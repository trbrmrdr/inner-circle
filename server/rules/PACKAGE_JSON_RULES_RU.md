# Package JSON rules

Этот файл фиксирует стиль команд в `server/package.json`.

## Комментарии к scripts

JSON не поддерживает настоящие комментарии. Поэтому описание команд пишем отдельными ключами внутри `scripts`.

Формат:

```json
{
  "scripts": {
    "___________comment_build": "Собрать TypeScript сервер в папку dist.",
    "build": "tsc -p tsconfig.json"
  }
}
```

Правила:

- comment-ключ начинается с `___________comment_`;
- comment-ключ всегда стоит прямо перед командой или группой команд;
- между логическими группами команд оставляем пустую строку;
- для одиночной команды используем имя команды: `___________comment_build`;
- для группы команд используем маску: `___________comment_dev:*`;
- comment-ключи должны быть уникальными;
- отдельный объект `scripts_info` не используем, чтобы описания не дублировались;
- значения comment-ключей пишем на русском языке;
- сами имена команд и env-ключи оставляем латиницей.

## Example

```json
{
  "scripts": {
    "___________comment_dev": "Запустить сервер в watch-режиме с env/local.env.",
    "dev": "ENV_FILE=env/local.env tsx watch src/server.ts",

    "___________comment_dev:*": "Запустить сервер в watch-режиме с конкретным env-профилем.",
    "dev:local": "ENV_FILE=env/local.env tsx watch src/server.ts",
    "dev:moscow": "ENV_FILE=env/moscow.env tsx watch src/server.ts",
    "dev:germany": "ENV_FILE=env/germany.env tsx watch src/server.ts"
  }
}
```
