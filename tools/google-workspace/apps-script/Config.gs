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
 * refreshPostPreviews()
 * Обновляет preview_1..preview_10 в POSTS по media_ids.
 * Запускать после вставки media_id в POSTS.
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

const CONTENT_PLANNER_VERSION = '1.2.5';

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
