function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const syncMenu = ui
    .createMenu('Sync (Синхронизация)')
    .addItem('Sync media from Drive (Синхронизировать медиа из Drive)', 'syncMediaFromDrive')
    .addItem('Remove missing MEDIA rows (Удалить missing-строки MEDIA)', 'removeMissingMediaRows')
    .addSeparator()
    .addItem('Sync post IDs (Синхронизировать post_id)', 'syncPostIds')
    .addSeparator()
    .addItem('Refresh post previews (Обновить превью постов)', 'refreshPostPreviews');

  const sortMenu = ui
    .createMenu('Sort (Сортировка)')
    .addItem('POSTS by date/time (POSTS по дате/времени)', 'sortPostsByDateTime')
    .addSeparator()
    .addItem('MEDIA by usage, newest first (MEDIA: использованные, новые сверху)', 'sortMediaByUsageNewest')
    .addItem('MEDIA by usage, oldest first (MEDIA: использованные, старые сверху)', 'sortMediaByUsageOldest')
    .addItem('MEDIA newest first (MEDIA: новые сверху)', 'sortMediaByCreatedNewest')
    .addItem('MEDIA oldest first (MEDIA: старые сверху)', 'sortMediaByCreatedOldest');

  SpreadsheetApp.getUi()
    .createMenu(`Content Planner v${CONTENT_PLANNER_VERSION} (Контент-планер)`)
    .addItem('Setup sheets (Настроить листы)', 'setupSheets')
    .addSubMenu(syncMenu)
    .addSubMenu(sortMenu)
    .addSeparator()
    .addItem('Open media links for selected post (Открыть медиа выбранного поста)', 'openMediaLinksForSelectedPost')
    .addItem('Delete selected media files (Удалить выбранные медиафайлы)', 'deleteSelectedMediaFiles')
    .addSeparator()
    .addItem('Check duplicate IDs (Проверить дубли ID)', 'checkDuplicateIds')
    .addItem('Create auto triggers (Создать автозапуски)', 'createAutoTriggers')
    .addToUi();

  setupSheets();
  refreshPostPreviews();
}

function createAutoTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const fn = trigger.getHandlerFunction();

    if (fn === 'syncMediaFromDrive' || fn === 'refreshPostPreviews') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncMediaFromDrive')
    .timeBased()
    .everyHours(1)
    .create();

  ScriptApp.newTrigger('refreshPostPreviews')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  SpreadsheetApp.getUi().alert('Auto triggers created. (Автозапуски созданы.)');
}
