# Правила работы с Google-таблицей, медиа и нейронкой

Этот файл нужен для любого нового чата, агента или человека, который будет
работать с контент-планом Inner Circle. Его можно вставлять в начало задачи как
рабочий промпт.

## Короткий промпт для нейронки

Ты работаешь в проекте Inner Circle. База контента находится в Google Sheets.
Медиа лежат в Google Drive и продублированы локально в проекте. Не скачивай
массово фото/видео из Google Drive: для визуального выбора используй локальные
файлы и маленькие превью.

Главная задача контента: развивать проект Ближний круг / Inner Circle как
камерное, эстетичное место рядом с Петербургом для музыки, встреч, закрытых
ужинов, съёмок, танцев, мэппинга, бани/сауны, прогулок и тихих заездов. Тон не
продажный. Не писать как объявление об аренде. Писать как культурный журнал
места: дорого не через цену, а через качество, тишину, звук, ритм, вкус и
редкость.

При создании планов:

- создавай отдельные листы (`POSTS_WEEK`, `POSTS_MONTH`, `POSTS_...`);
- не ломай рабочий лист `POSTS`;
- не меняй опубликованные строки со статусом `posted`;
- медиа выбирай только через `media_id` из листа `MEDIA`;
- не используй папки, начинающиеся с `old_`, если пользователь явно не просит;
- не повторяй одни и те же медиа без причины;
- добавляй колонку с тем, что нужно доснять: `missing_shots`, `shoot_brief`;
- для Instagram делай больше Reels/Stories/каруселей;
- для Telegram делай живой дневниковый тон;
- для Facebook/VK делай чуть больше контекста и понятных сценариев;
- не редактируй Apps Script без отдельного запроса и бэкапа.

## Структура проекта

```text
app/                         сайт Inner Circle
app-info/                    справочная информация, старые аудиты, конспекты
resources/                   большие локальные ресурсы, не хранятся в git
resources/Place-Location-Photos/
                             локальные оригиналы фото/видео для выбора медиа
secrets/                     ключи Google service account, не хранятся в git
tools/google-workspace/      утилиты для Google Sheets, Drive, Apps Script
tools/site-media/            локальная медиаподборка и WebP-экспорт для сайта
```

Папки `resources/`, `secrets/`, `tools/google-workspace/out/`,
`tools/site-media/out/` должны быть в
`.gitignore`. В репозиторий не кладём ключи и большие медиа.

Если задача касается фотографий для сайта, а не Google Sheets/Drive, использовать
отдельные правила:

```text
tools/site-media/AI_WORKFLOW_RU.md
```

## Google-доступ

Используется service account:

```text
inner-circle-sheets-writer@inner-circle-499809.iam.gserviceaccount.com
```

В Google Cloud должны быть включены API:

- Google Sheets API;
- Google Drive API;
- Apps Script API, если нужно читать или редактировать Apps Script.

Ключ service account лежит локально в `secrets/*.json`. Ключ нельзя отправлять в
чат, коммитить в git или вставлять в документы.

Доступ даётся так:

1. Создать service account в Google Cloud.
2. Скачать JSON key.
3. Положить JSON в `secrets/`.
4. Добавить service account как `Editor` в Google Sheets.
5. Добавить service account в папку Google Drive с медиа.
6. Если нужно работать с Apps Script, включить Apps Script API и дать доступ к
   скрипту.

Целевая таблица:

```text
Spreadsheet: Inner-Circle
Spreadsheet ID: 1SRmEToiokN560sk-H-to3kIR6qF7uPXVOsXBmrobU7g
```

Apps Script:

```text
Script ID: 1gzxdR2rldUXXqP0ha5p0dH8lSW48mZ-1lLHLybOdm1uQ57hhjMXmakAQ
```

## Как устроена Google-таблица

Основные листы:

- `POSTS` - рабочий лист автопостинга;
- `MEDIA` - индекс медиа из Google Drive;
- `POSTS_WEEK`, `POSTS_MONTH`, `POSTS_*` - экспериментальные планы;
- `_codex_healthcheck` - безопасная проверка записи.

### POSTS

В `POSTS` строка = один пост или один вариант поста. Колонки ищутся по названию,
а не по букве, потому что таблицу можно сортировать и расширять.

Ключевые колонки:

```text
*date_marker
post_id
date
time
platforms
info/photo/context
text
media_ids
preview_1 ... preview_10
status
```

Правила:

- `post_id` - стабильный ID поста;
- `date`, `time` - план публикации;
- `platforms` - куда публиковать;
- `info/photo/context` - человеческая заметка о смысле/визуале;
- `text` - текст поста;
- `media_ids` - список ID из `MEDIA`, например `M0078;M0015;M0101`;
- `preview_*` - генерируемые превью;
- `status` - состояние: `concept`, `draft`, `ready`, `posted`, `error`.

Строки со статусом `posted` не изменять. Если нужно переработать опубликованный
пост, создать новую строку или отдельный экспериментальный лист.

### MEDIA

`MEDIA` создаётся и обновляется Apps Script по папке Google Drive.

Ключевые колонки:

```text
preview
media_id
type
file_status
path
name
drive_url
file_id
mime_type
preview_url
created_at
updated_at
used_count
posted_count
last_posted_at
used_in_posts
```

Правила:

- `media_id` - единственный ID, который вставляется в посты;
- `file_id` - Google Drive file ID;
- `preview_url` - URL для табличного превью;
- `file_status` может показывать, что файл активен или пропал;
- `used_count` и `posted_count` заполняются Apps Script по листу `POSTS`;
- `last_posted_at` показывает последнюю дату опубликованного поста с этим
  `media_id`;
- `used_in_posts` показывает `post_id`, где встречается медиа;
- если файл удалён из Drive, Apps Script должен пометить его как missing;
- если строку удалить из `MEDIA`, файл на Google Drive не удаляется;
- если удалить строку через меню Content Planner, файл перемещается в корзину
  Google Drive, строка удаляется из `MEDIA`, а превью в `POSTS` покажет
  `NOT FOUND` или `MISSING`;
- при пересборке медиа могут появиться новые ID, поэтому опубликованные посты
  лучше не трогать.

Медиа из папок `old_*` использовать только по отдельному запросу. Они нужны как
архив/крайний случай, но не для эстетичного основного продвижения.

## Apps Script

Apps Script живёт внутри Google Sheets и обслуживает таблицу.

Локальная копия Apps Script хранится в:

```text
tools/google-workspace/apps-script/
```

Перед изменениями Apps Script:

```bash
cd tools/google-workspace
npm run apps:pull
npm run apps:diff
```

Для выгрузки Apps Script нужен OAuth реального Google-пользователя. Service
account подходит для Sheets/Drive, но не для `projects.updateContent`.

Один раз нужно создать OAuth Client ID типа `Desktop app` в Google Cloud Console,
скачать JSON в `secrets/` и авторизоваться:

```bash
npm run apps:auth -- --oauth-credentials ../../secrets/apps-script-oauth-client.json
```

Токен сохраняется в:

```text
secrets/apps-script-oauth-token.json
```

После изменений:

```bash
npm run apps:push -- --dry-run
npm run apps:push
```

Если `apps:push` возвращает ошибку `User has not enabled the Apps Script API`,
нужно включить Apps Script API в настройках пользователя:

```text
https://script.google.com/home/usersettings
```

Важно: включать нужно для того Google-аккаунта, который проходил
`npm run apps:auth`, а не для service account.

Основные функции:

- `setupSheets()` - создаёт недостающие листы и колонки;
- `syncMediaFromDrive()` - синхронизирует `MEDIA` с Google Drive;
- `refreshPostPreviews()` - обновляет `preview_1...preview_10` по `media_ids`;
- `refreshMediaUsage()` - обновляет `used_count`, `posted_count`,
  `last_posted_at`, `used_in_posts`;
- `sortPostsByDateTime()` - сортирует `POSTS` по дате и времени;
- `sortMediaByUsageNewest()` - сортирует `MEDIA`: использованные/опубликованные
  сверху, внутри новые сверху;
- `sortMediaByUsageOldest()` - сортирует `MEDIA`: использованные/опубликованные
  сверху, внутри старые сверху;
- `sortMediaByCreatedNewest()` - сортирует `MEDIA`: новые файлы сверху;
- `sortMediaByCreatedOldest()` - сортирует `MEDIA`: старые файлы сверху;
- `deleteSelectedMediaFiles()` - перемещает выбранные файлы `MEDIA` в корзину
  Google Drive и удаляет строки `MEDIA` после подтверждения;
- `updateDateMarkers_()` - красит маркеры прошлого/сегодня/будущего;
- `checkDuplicateIds()` - проверяет дубли ID.

Apps Script не редактировать без явного запроса. Если всё-таки нужно менять:

1. сначала прочитать текущий код;
2. сохранить бэкап;
3. менять минимально;
4. проверить `npm run apps:push -- --dry-run`;
5. выгружать только через `npm run apps:push`;
6. не переписывать весь проект без необходимости.

## Локальные медиа

Локальная папка:

```text
/Users/trbrmrdr/Documents/Project/Inner-Circle/resources/Place-Location-Photos
```

Имена файлов совпадают с файлами в Google Drive. Поэтому рабочий алгоритм такой:

1. читать `MEDIA` из Google Sheets;
2. брать `media_id`, `path`, `name`;
3. искать файл локально по `path/name`;
4. строить маленькие превью локально;
5. выбирать медиа визуально;
6. в таблицу писать только `media_id`.

Если проект запускается на другом компьютере, локальную папку с медиа нужно
перенести отдельно и указать путь:

```bash
INNER_CIRCLE_LOCAL_MEDIA_ROOT=/path/to/Place-Location-Photos npm run media:contact
```

или:

```bash
npm run media:contact -- --media-root /path/to/Place-Location-Photos
```

Массово скачивать превью или оригиналы из Google Drive нельзя, если локальные
файлы доступны.

## Утилиты

Рабочая папка:

```bash
cd tools/google-workspace
```

Установка:

```bash
npm install
```

Проверка доступа к таблице и Drive:

```bash
npm run inspect
```

Безопасная проверка записи:

```bash
npm run inspect:write
```

Она пишет только в `_codex_healthcheck`, рабочие посты не трогает.

Локальная сборка contact sheets:

```bash
npm run media:contact
```

Результаты появляются в:

```text
tools/google-workspace/out/local-media-contact/
```

Drive-вариант для contact sheets оставлен только как fallback:

```bash
npm run media:contact:drive
```

Его не использовать без причины.

Проверка Apps Script:

```bash
node inspect-apps-script.mjs --script-id 1gzxdR2rldUXXqP0ha5p0dH8lSW48mZ-1lLHLybOdm1uQ57hhjMXmakAQ
```

## Правила для AI при создании контента

### Нельзя

- не раскрывать и не печатать содержимое `secrets/*.json`;
- не коммитить `secrets/`, `resources/`, `out/`;
- не скачивать массово фото/видео из Drive;
- не менять `posted`-посты;
- не удалять строки из `MEDIA`, если пользователь прямо не попросил;
- не менять заголовки рабочих колонок;
- не использовать `old_*` медиа без разрешения;
- не редактировать Apps Script без отдельного запроса;
- не превращать тексты в прямую аренду/продажу.

### Можно

- создавать новые листы для экспериментов;
- читать `POSTS` и `MEDIA`;
- создавать недельные/месячные планы;
- писать `text`, `media_ids`, `platforms`, `date`, `time` в экспериментальные
  листы;
- добавлять `preview_*` формулы в экспериментальные листы;
- добавлять колонки `goal`, `hook`, `marketing_logic`, `missing_shots`,
  `shoot_brief`;
- предлагать досъём;
- подсвечивать важные колонки форматированием.

### Для рабочего `POSTS`

В рабочий `POSTS` переносить только утверждённые посты. Перед переносом:

1. проверить, что `post_id` уникален;
2. проверить, что `media_ids` существуют в `MEDIA`;
3. проверить, что медиа не из `old_*`, если это не согласовано;
4. проверить, что строка не `posted`;
5. после изменения запустить или дождаться `refreshPostPreviews()`;
6. не менять служебные колонки без причины.

## Контентная стратегия

Ближний круг не позиционируется как обычный дом в аренду.

Рабочие темы:

- тишина рядом с городом;
- дом в зелени;
- сложная и камерная музыка;
- звук, которому не нужно бороться с шумом;
- закрытые ужины;
- баня/сауна как ритуал;
- съёмки и бекстейдж;
- танцы, тело, перформанс;
- мэппинг, свет, визуальное искусство;
- маршруты, прогулки, кони, квадроциклы, мотоциклы;
- семейные и дружеские заезды;
- малые команды и творческие offsite;
- люди с вкусом, которым не нужна массовая реклама.

Тон:

- спокойно;
- точно;
- дорого через качество, а не через слова про luxury;
- без крика и скидок;
- без "успейте забронировать";
- мягкий call to action через самоидентификацию:
  "если вы понимаете такой ритм, нам есть о чём говорить".

## Что нужно доснимать

Текущих фото хватает для зелени, дома, событий, людей, музыки и бекстейджа.
Не хватает:

- баня/сауна красиво и современно;
- еда, сервировка, завтрак, ужин;
- дождь, туман, пасмурная погода;
- ночной фасад и свет в окнах;
- прогулки и маршруты;
- кони, квадроциклы, мотоциклы;
- танцы и телесные практики;
- мэппинг и проекции;
- музыкальное оборудование без хаоса;
- пустой зал утром/вечером;
- спальни, текстиль, санузлы, детали качества;
- понятные коммерческие hero-кадры для заявок.

В новых планах обязательно добавлять `missing_shots`, чтобы было видно, где
текущая медиатека не закрывает идею.
