/**
 * Content Planner / Google Sheets + Drive
 *
 * ОСНОВНЫЕ ФУНКЦИИ:
 *
 * setupSheets()
 * Создаёт недостающие листы и колонки.
 * Данные не удаляет. Колонки не переставляет.
 * Запускать вручную при первом запуске или если удалил колонки.
 *
 * syncMediaFromDrive()
 * Мягко синхронизирует MEDIA с Google Drive.
 * Новые файлы добавляет, старые обновляет, удалённые помечает missing.
 * Ручные цвета/границы/пометки не стирает.
 *
 * removeMissingMediaRows()
 * Удаляет из MEDIA строки, уже помеченные как missing.
 * Google Drive не трогает. После удаления превью постов покажут NOT FOUND.
 *
 * refreshPostPreviews()
 * Обновляет preview_1..preview_10 в POSTS по media_ids.
 * Запускать после вставки media_id в POSTS.
 * Также синхронизирует post_id для незапечатанных строк.
 *
 * syncPostIds()
 * Генерирует/обновляет post_id по date, time, platforms, text, media_ids.
 * Если обязательных полей нет, очищает post_id.
 * Если строка уже posted/done/partial/processing, post_id не меняет.
 * Для публикации сервер берет только status=ready.
 * Невалидная ready-строка подсвечивается фиолетовым в *date_marker.
 *
 * sortPostsByDateTime()
 * Сортирует POSTS по date и time.
 * Запускать только вручную.
 *
 * deleteSelectedMediaFiles()
 * Перемещает выбранные файлы MEDIA в корзину Google Drive и удаляет строки.
 * Работает только на листе MEDIA и только после подтверждения.
 *
 * sortMediaByUsageNewest(), sortMediaByUsageOldest(),
 * sortMediaByCreatedNewest(), sortMediaByCreatedOldest()
 * Обновляют usage-колонки MEDIA и сортируют медиатеку.
 *
 * checkDuplicateIds()
 * Проверяет дубли media_id и post_id.
 *
 * createAutoTriggers()
 * Включает автозапуски:
 * - syncMediaFromDrive раз в час
 * - refreshPostPreviews при редактировании
 * Можно пока не запускать.
 *
 * onOpen()
 * Создаёт меню Content Planner при открытии таблицы.
 * Вручную не запускать.
 */

const CONTENT_PLANNER_VERSION = '1.2.14';

const ROOT_FOLDER_ID = '1UcE35OVOx1IwQDl4pp4sQgOGZRDzzrkq';

const POSTS_SHEET_NAME = 'POSTS';
const MEDIA_SHEET_NAME = 'MEDIA';

const MAX_PREVIEWS = 10;

const POSTS_COLUMNS = [
  '*date_marker',
  'post_id',
  'date',
  'time',
  'platforms',
  'info/photo/context',
  'text',
  'media_ids',
  'preview_1',
  'preview_2',
  'preview_3',
  'preview_4',
  'preview_5',
  'preview_6',
  'preview_7',
  'preview_8',
  'preview_9',
  'preview_10',
  'status'
];

const POSTS_HEADER_NOTES = {
  '*date_marker': [
    'Маркер календаря и готовности строки.',
    '',
    'Цвета:',
    'красный - дата в прошлом;',
    'зеленый - дата сегодня;',
    'синий - дата в будущем;',
    'фиолетовый - [status=ready], но строка невалидна и не будет опубликована.'
  ].join('\n'),
  'post_id': [
    'Внутренний ID поста.',
    '',
    'Генерируется автоматически Apps Script.',
    'Основа: date + time + platforms + text + media_ids.',
    '',
    'После публикации или обработки не меняется:',
    '[processing], [posted], [partial], [done]',
    'или уже есть message/post id платформы.',
    '',
    'Вручную обычно не редактировать.'
  ].join('\n'),
  'date': [
    'Дата публикации.',
    '',
    'Обязательное поле для автопостинга.',
    'Работает вместе с time.',
    '',
    'ПРИМЕР:',
    '[22.06.2026]',
    '',
    'Если date пустая, строка не публикуется.'
  ].join('\n'),
  'time': [
    'Время публикации.',
    '',
    'Обязательное поле для автопостинга.',
    '',
    'ФОРМАТ:',
    '[12:30]',
    '[09:05]',
    '',
    'Если time пустое, строка не публикуется.'
  ].join('\n'),
  'platforms': [
    'Платформы для публикации.',
    '',
    'Обязательное поле для автопостинга.',
    '',
    'Разделители:',
    'точка с запятой, запятая или перенос строки.',
    '',
    'ПРИМЕР:',
    '[Telegram; VK; Instagram]',
    '[Telegram;VK;Instagram]',
    '',
    'Регистр неважен:',
    '[Telegram] и [telegram] работают одинаково.',
    '',
    'Пробел после разделителя необязателен.',
    '',
    'ЗНАЧЕНИЯ:',
    '[Telegram], [TG], [телеграм]',
    '[VK], [ВК]',
    '[Instagram], [IG], [Inst], [инстаграм]',
    '[Facebook], [FB], [фейсбук]',
    '',
    'Публикуются только включенные и настроенные платформы.'
  ].join('\n'),
  'text': [
    'Исходный текст поста.',
    '',
    'DeepSeek/AI может подготовить текст под конкретную платформу.',
    '',
    'Можно оставить пустым, если заполнен media_ids.',
    'Если text и media_ids пустые, строка не публикуется.'
  ].join('\n'),
  'media_ids': [
    'ID медиа из листа MEDIA, колонка media_id.',
    '',
    'Разделители:',
    'точка с запятой, запятая или перенос строки.',
    '',
    'ПРИМЕР:',
    '[IMG_001; VID_0001]',
    '',
    'Можно оставить пустым, если заполнен text.',
    'Missing/битые медиа пропускаются, остальные медиа и текст публикуются.'
  ].join('\n'),
  'status': [
    'Ручной переключатель автопостинга.',
    '',
    'Публикуется только:',
    '[ready]',
    '',
    'Не публикуются:',
    '[пусто]',
    '[template]',
    '[draft]',
    '',
    'Сервер сам пишет:',
    '[processing] - взял в работу;',
    '[posted] - успешно опубликовано;',
    '[partial] - часть платформ успешна, часть нет;',
    '[error] - ошибка;',
    '[skipped] - пропущено.',
    '',
    'Для повторной попытки вручную поставь [ready].'
  ].join('\n')
};

const MEDIA_COLUMNS = [
  'preview',
  'media_id',
  'type',
  'file_status',
  'path',
  'name',
  'drive_url',
  'file_id',
  'mime_type',
  'preview_url',
  'created_at',
  'updated_at',
  'used_count',
  'posted_count',
  'last_posted_at',
  'used_in_posts'
];
