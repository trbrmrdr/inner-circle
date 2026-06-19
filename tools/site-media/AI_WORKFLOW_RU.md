# Правила работы с медиатекой сайта Inner Circle

Этот файл нужен для нового чата, агента или человека, который будет выбирать
фотографии для сайта Inner Circle. Его можно вставлять как рабочий промпт перед
задачей по сайту.

## Короткий промпт для нейронки

Ты работаешь в проекте Inner Circle. Для сайта используются локальные фото из
`resources/Place-Location-Photos/`. Не скачивай фото из Google Drive: оригиналы
уже лежат на компьютере. Для выбора используй маленькие contact sheets и
экспортируй в сайт только утверждённые кадры.

Главный тон сайта: дом, место, событие, тишина, качество, люди, камерная
культура. Не делать обычную рекламу аренды. Показывать, что это живой дом для
музыки, закрытых встреч, съёмок, ужинов, работы, ночёвки, бани и спокойного
загородного ритма рядом с Петербургом.

## Где что лежит

```text
resources/Place-Location-Photos/      локальные оригиналы фото
tools/site-media/                     утилиты выбора и экспорта фото для сайта
tools/site-media/out/                 временные contact sheets, не коммитить
app/public/assets/formats/            готовые WebP для сайта
app/src/partials/sections/accordions/details.ru.place-catalog.html
                                      общий RU-каталог услуг и возможностей
app/src/partials/sections/accordions/details.ru.formats.html
                                      обёртка на общий каталог
```

`tools/site-media/out/` игнорируется git. Оригиналы из `resources/` тоже не
должны попадать в git.

## Чем этот инструмент отличается от Google Workspace

`tools/google-workspace/` работает с Google Sheets, Google Drive и Apps Script:
там автопостинг, `POSTS`, `MEDIA`, `media_id`, превью в таблице.

`tools/site-media/` работает только с локальными файлами сайта:

- не читает Google Sheets;
- не пишет в Google Drive;
- не знает `media_id`;
- выбирает реальные файлы по локальному пути;
- экспортирует WebP в `app/public/assets/formats/`.

Если задача про автопостинг, таблицу, `POSTS`, `MEDIA` или Apps Script - идти в
`tools/google-workspace/AI_WORKFLOW_RU.md`.

Если задача про фотографии для сайта - использовать этот файл.

## Базовый flow

1. Построить общие contact sheets:

```bash
node tools/site-media/build-photo-contact-sheets.mjs
```

2. Если нужно быстро предложить варианты для сайта, построить пять подборок:

```bash
node tools/site-media/build-site-selection-variants.mjs
```

3. Пользователь выбирает номера с листов (`01-03`, `04-25`) и/или диктует имена
   файлов.

4. Зафиксировать выбор в `build-user-site-selection.mjs` и собрать проверочную
   подборку:

```bash
node tools/site-media/build-user-site-selection.mjs
```

5. Разбить выбранные фото по смысловым группам:

- события и люди;
- дом и территория;
- комнаты, залы, аренда;
- настроение и интерфейс.

6. Зафиксировать финальный список в `export-format-assets.mjs` и экспортировать:

```bash
node tools/site-media/export-format-assets.mjs
```

7. Вставить фото в HTML сайта через пути:

```text
/assets/formats/<file>.webp
```

8. Проверить, что все экспортированные фото используются и нет дублей.

9. Собрать сайт:

```bash
cd app
npm run build
```

10. После утверждения выгрузить:

```bash
bash ./synch_to_server.sh
```

## Правила выбора фотографий

### Использовать в первую очередь

- кадры с несколькими людьми;
- события, показы, мастер-классы, дети, творческий процесс;
- музыкантов только в удачных кадрах, где есть контекст и нет случайного мусора;
- дом в зелени и снаружи, если кадр не повторяет уже видимый hero;
- комнаты и интерьер, когда нужен блок аренды, ночёвки, зала или оснащения;
- еду, свет, окно, вечер, огонь и детали, если они добавляют настроение.

### Использовать осторожно

- пустые помещения;
- старые фото дома;
- слишком тёмные или блеклые кадры;
- почти одинаковые кадры рядом друг с другом;
- фото из папок `old_*`.

Папки `old_*` можно использовать только когда нужен конкретный интерьер, комната,
сауна, кухня, веранда, зал или старый референс. Для основного эстетичного
продвижения они не являются первым выбором.

### Не использовать без отдельного запроса

- видео;
- папку/блок `Досуг, маршруты и занятия`;
- фото для маршрутов, квадроциклов, коней, прогулок и других будущих активностей,
  если пользователь просит этот блок пока не трогать.

## Текущая важная договорённость по сайту

В русской версии общий каталог живёт в
`details.ru.place-catalog.html`. Файлы `details.ru.formats.html`,
`details.ru.space.html` и `details.ru.veranstaltungen.html` являются обёртками
и подключают один и тот же общий каталог.

В общем каталоге раздел
`Досуг, маршруты и занятия` восстановлен из исходного макета. Его фото и тексты
не относятся к текущей подборке локальных фотографий для сайта.

Локальные выбранные фото нужно распределять в другие разделы:

- `Площадки, вместимость и события`;
- `Залы, размеры и оснащение`;
- `Ночёвка, стол и прайс`;
- `Фото и настроение`.

Раздел `Досуг, маршруты и занятия` трогать только по явному запросу.

## Текущая финальная подборка для блока форматов

Экспортируется скриптом:

```text
tools/site-media/export-format-assets.mjs
```

Текущие WebP-файлы:

```text
site-kids-workshop.webp
event-fashion-room.webp
event-photoshoot-table.webp
event-hair-close.webp
music-cello-room.webp
event-prep-team.webp
event-fashion-prep.webp
event-makeup-close.webp
event-fashion-stage.webp
house-entry-green.webp
house-side-summer.webp
house-facade-meadow.webp
location-valley.webp
hall-main.webp
hall-plants.webp
lounge-fireplace.webp
kitchen-wide.webp
bedroom.webp
sauna-jacuzzi.webp
veranda-winter.webp
dinner-fire.webp
window-light.webp
location-open-view.webp
sunset-field.webp
house-sunset-field.webp
flowers-interface.webp
event-model-green.webp
event-field-model.webp
event-model-sunset.webp
event-dark-detail.webp
```

После изменения списка нужно снова проверить, что:

- файлов `.webp` в `app/public/assets/formats/` столько же, сколько ссылок в
  HTML;
- каждый локальный файл используется;
- нет повторов, если повтор не был согласован;
- блок `Досуг, маршруты и занятия` не содержит `/assets/formats/`.

## Команда проверки локальных фото

Из корня проекта:

```bash
node -e "const fs=require('fs');const html=fs.readFileSync('app/src/partials/sections/accordions/details.ru.place-catalog.html','utf8');const refs=[...html.matchAll(/\\/assets\\/formats\\/([^\\s\\\"]+)/g)].map(m=>m[1]);const files=fs.readdirSync('app/public/assets/formats').filter(f=>f.endsWith('.webp')).sort();console.log({localRefs:refs.length,uniqueRefs:new Set(refs).size,files:files.length,missing:refs.filter(f=>!files.includes(f)),unused:files.filter(f=>!refs.includes(f))});"
```

## Что нельзя делать

- Не удалять и не править оригиналы в `resources/Place-Location-Photos/`.
- Не скачивать гигабайты из Google Drive для сайта.
- Не оставлять в `app/public/assets/formats/` неиспользуемые `.webp`.
- Не менять суммы, метраж и коммерческие цифры, если пользователь сказал не
  трогать.
- Не заменять блок досуга без явного запроса.
- Не смешивать автопостинг Google Sheets и медиаподборку сайта.

## Что можно делать

- Создавать contact sheets.
- Предлагать несколько подборок.
- Группировать фото по блокам сайта.
- Экспортировать выбранные фото в WebP.
- Переписывать тексты блоков под реальный дом, если пользователь попросил.
- Добавлять заметки, каких фото не хватает: еда, баня, дождь, ночь, прогулки,
  маршруты, танцы, мэппинг, оборудование, сервировка, спальни и детали качества.
