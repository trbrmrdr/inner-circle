# Inner Circle: Google Sheets + Drive + AI

Короткий конспект, как устроена текущая система контент-плана.

## Что уже настроено

- Google Sheet `Inner-Circle` используется как простая база данных контента.
- Google Drive хранит фото и видео.
- Apps Script внутри таблицы синхронизирует медиа, создаёт `media_id` и превью.
- Service account получает доступ к таблице, Drive и Apps Script.
- Локальные утилиты лежат в `tools/google-workspace/`.
- Большие локальные фото/видео лежат в `resources/Place-Location-Photos/` и не
  попадают в git.
- Ключ service account лежит в `secrets/` и не попадает в git.

## Как создавался доступ

1. В Google Cloud создан project для Inner Circle.
2. Включены Google Sheets API и Google Drive API.
3. Включён Apps Script API для чтения кода Apps Script.
4. Создан service account.
5. Скачан JSON key и положен в `secrets/`.
6. Email service account добавлен в Google Sheet как редактор.
7. Email service account добавлен в Google Drive-папку с медиа.
8. Для Apps Script открыт доступ и проверено чтение кода.

Ключи, токены и JSON-файлы не публикуются и не передаются в чат.

## Основные листы

- `POSTS` - рабочий лист автопостинга.
- `MEDIA` - индекс медиа из Google Drive.
- `POSTS_WEEK`, `POSTS_MONTH` - экспериментальные контент-планы.
- `_codex_healthcheck` - техническая проверка записи.

## Основной принцип

Google Sheet - база. Google Drive - хранилище. Apps Script - синхронизация и
превью. AI - редактор, стратег и помощник по выбору `media_id`.

AI не должен работать с большими файлами напрямую, если они уже есть локально.
Для визуального выбора используются локальные превью из
`resources/Place-Location-Photos`.

Подробные правила для нового чата или другого человека:

```text
tools/google-workspace/AI_WORKFLOW_RU.md
```
