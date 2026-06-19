function setupSheets() {
  setupPostsSheet_();
  setupMediaSheet_();
}

function setupPostsSheet_() {
  const sheet = getOrCreateSheet_(POSTS_SHEET_NAME);

  ensureColumns_(sheet, POSTS_COLUMNS);
  applyPostsLayout_(sheet);
  updateDateMarkers_();
  validatePostIds_();
}

function setupMediaSheet_() {
  const sheet = getOrCreateSheet_(MEDIA_SHEET_NAME);

  ensureColumns_(sheet, MEDIA_COLUMNS);
  applyMediaLayout_(sheet);
}

function applyPostsLayout_(sheet) {
  const cols = getHeaderMap_(sheet);

  sheet.setFrozenRows(1);

  setWidth_(sheet, cols['*date_marker'], 28);
  setWidth_(sheet, cols.post_id, 90);
  setWidth_(sheet, cols.date, 110);
  setWidth_(sheet, cols.time, 80);
  setWidth_(sheet, cols.platforms, 180);
  setWidth_(sheet, cols.text, 420);
  setWidth_(sheet, cols.media_ids, 260);
  setWidth_(sheet, cols.status, 120);

  for (let i = 1; i <= MAX_PREVIEWS; i++) {
    setWidth_(sheet, cols[`preview_${i}`], 120);

    if (cols[`preview_${i}`]) {
      sheet.getRange(2, cols[`preview_${i}`], sheet.getMaxRows() - 1, 1).clearDataValidations();
    }
  }

  if (sheet.getMaxRows() > 1) {
    sheet.setRowHeights(2, sheet.getMaxRows() - 1, 110);
  }

  applyStatusFormatting_(sheet);
}

function applyMediaLayout_(sheet) {
  const cols = getHeaderMap_(sheet);

  sheet.setFrozenRows(1);

  setWidth_(sheet, cols.preview, 120);
  setWidth_(sheet, cols.media_id, 90);
  setWidth_(sheet, cols.type, 80);
  setWidth_(sheet, cols.file_status, 90);
  setWidth_(sheet, cols.path, 260);
  setWidth_(sheet, cols.name, 240);
  setWidth_(sheet, cols.drive_url, 260);
  setWidth_(sheet, cols.file_id, 220);
  setWidth_(sheet, cols.mime_type, 140);
  setWidth_(sheet, cols.preview_url, 260);
  setWidth_(sheet, cols.used_count, 90);
  setWidth_(sheet, cols.posted_count, 100);
  setWidth_(sheet, cols.last_posted_at, 130);
  setWidth_(sheet, cols.used_in_posts, 260);

  if (sheet.getMaxRows() > 1) {
    sheet.setRowHeights(2, sheet.getMaxRows() - 1, 110);

    if (cols.used_count) {
      sheet.getRange(2, cols.used_count, sheet.getMaxRows() - 1, 1).setNumberFormat('0');
    }

    if (cols.posted_count) {
      sheet.getRange(2, cols.posted_count, sheet.getMaxRows() - 1, 1).setNumberFormat('0');
    }

    if (cols.last_posted_at) {
      sheet.getRange(2, cols.last_posted_at, sheet.getMaxRows() - 1, 1).setNumberFormat('dd.mm.yy');
    }
  }
}
