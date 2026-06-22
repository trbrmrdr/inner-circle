function syncMediaFromDrive() {
  setupSheets();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEDIA_SHEET_NAME);
  const cols = getHeaderMap_(sheet);

  const existing = readExistingMedia_(sheet, cols);
  const scanned = [];

  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  scanFolderSoft_(rootFolder, '', scanned);

  const scannedByFileId = {};
  scanned.forEach(item => scannedByFileId[item.fileId] = item);

  const updateSummary = updateExistingMediaRows_(sheet, cols, existing, scannedByFileId);
  const appendSummary = appendNewMediaRows_(sheet, cols, existing, scanned);

  refreshMediaUsage_();
  applyMediaVisuals_();
  refreshPostPreviews();

  const statusSummary = countMediaRowsByStatus_(sheet, cols);
  SpreadsheetApp.getUi().alert(buildMediaSyncMessage_(scanned.length, updateSummary, appendSummary, statusSummary));
}

function refreshMediaUsage() {
  setupSheets();
  refreshMediaUsage_();
  applyMediaVisuals_();

  SpreadsheetApp.getUi().alert('MEDIA usage refreshed. (Использование медиа обновлено.)');
}

function removeMissingMediaRows() {
  const ui = SpreadsheetApp.getUi();
  setupMediaSheet_();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEDIA_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('MEDIA has no rows to clean. (В MEDIA нет строк для очистки.)');
    return;
  }

  const cols = getHeaderMap_(sheet);

  if (!cols.file_status) {
    ui.alert('MEDIA is missing file_status column. (В MEDIA нет колонки file_status.)');
    return;
  }

  const rowCount = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const rowsToDelete = [];
  const mediaIds = [];

  values.forEach((row, index) => {
    const status = String(row[cols.file_status - 1] || '').trim().toLowerCase();

    if (status !== 'missing') {
      return;
    }

    rowsToDelete.push(index + 2);

    if (cols.media_id) {
      const mediaId = String(row[cols.media_id - 1] || '').trim();

      if (mediaId) {
        mediaIds.push(mediaId);
      }
    }
  });

  if (!rowsToDelete.length) {
    ui.alert('Missing MEDIA rows not found. (Missing-строки MEDIA не найдены.)');
    return;
  }

  const preview = mediaIds.slice(0, 25).join(', ');
  const suffix = mediaIds.length > 25 ? `, ...and ${mediaIds.length - 25} more` : '';
  const response = ui.alert(
    'Remove missing MEDIA rows? (Удалить missing-строки MEDIA?)',
    `Rows will be deleted from MEDIA only. Google Drive files will not be touched.\nСтроки будут удалены только из MEDIA. Файлы Google Drive не трогаем.\n\nRows: ${rowsToDelete.length}\nMedia IDs: ${preview}${suffix}\n\nPosts that still reference these IDs will show NOT FOUND.`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  deleteSheetRows_(sheet, rowsToDelete);
  refreshMediaUsage_();
  applyMediaVisuals_();
  refreshPostPreviews();

  ui.alert(`Removed ${rowsToDelete.length} missing MEDIA rows.\nУдалено missing-строк MEDIA: ${rowsToDelete.length}.`);
}

function refreshMediaUsage_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mediaSheet = ss.getSheetByName(MEDIA_SHEET_NAME);
  const postsSheet = ss.getSheetByName(POSTS_SHEET_NAME);

  if (!mediaSheet || !postsSheet || mediaSheet.getLastRow() < 2) {
    return;
  }

  const mediaCols = getHeaderMap_(mediaSheet);
  const requiredMediaCols = [
    'media_id',
    'used_count',
    'posted_count',
    'last_posted_at',
    'used_in_posts'
  ];

  if (requiredMediaCols.some(name => !mediaCols[name])) {
    return;
  }

  const postCols = getHeaderMap_(postsSheet);
  const usage = buildMediaUsageMap_(postsSheet, postCols);
  const rowCount = mediaSheet.getLastRow() - 1;
  const values = mediaSheet.getRange(2, 1, rowCount, mediaSheet.getLastColumn()).getValues();

  const usedCountValues = [];
  const postedCountValues = [];
  const lastPostedAtValues = [];
  const usedInPostsValues = [];

  values.forEach(row => {
    const mediaId = String(row[mediaCols.media_id - 1] || '').trim();
    const item = usage[mediaId] || {
      usedCount: 0,
      postedCount: 0,
      lastPostedAt: '',
      postIds: []
    };

    usedCountValues.push([item.usedCount]);
    postedCountValues.push([item.postedCount]);
    lastPostedAtValues.push([item.lastPostedAt || '']);
    usedInPostsValues.push([item.postIds.join(';')]);
  });

  mediaSheet.getRange(2, mediaCols.used_count, rowCount, 1).setValues(usedCountValues);
  mediaSheet.getRange(2, mediaCols.posted_count, rowCount, 1).setValues(postedCountValues);
  mediaSheet.getRange(2, mediaCols.last_posted_at, rowCount, 1).setValues(lastPostedAtValues);
  mediaSheet.getRange(2, mediaCols.used_in_posts, rowCount, 1).setValues(usedInPostsValues);
}

function buildMediaUsageMap_(postsSheet, postCols) {
  const usage = {};

  if (!postCols.media_ids || postsSheet.getLastRow() < 2) {
    return usage;
  }

  const values = postsSheet.getRange(2, 1, postsSheet.getLastRow() - 1, postsSheet.getLastColumn()).getValues();

  values.forEach(row => {
    const postId = postCols.post_id ? String(row[postCols.post_id - 1] || '').trim() : '';
    const status = postCols.status ? String(row[postCols.status - 1] || '').trim().toLowerCase() : '';
    const dateValue = postCols.date ? row[postCols.date - 1] : '';
    const mediaIds = splitMediaIds_(row[postCols.media_ids - 1]);
    const uniqueMediaIds = {};

    mediaIds.forEach(mediaId => {
      uniqueMediaIds[mediaId] = true;
    });

    Object.keys(uniqueMediaIds).forEach(mediaId => {
      if (!usage[mediaId]) {
        usage[mediaId] = {
          usedCount: 0,
          postedCount: 0,
          lastPostedAt: '',
          postIds: []
        };
      }

      usage[mediaId].usedCount += 1;

      if (postId) {
        usage[mediaId].postIds.push(postId);
      }

      if (status === 'posted') {
        usage[mediaId].postedCount += 1;

        if (dateValue instanceof Date) {
          const previous = usage[mediaId].lastPostedAt;
          if (!previous || dateValue.getTime() > previous.getTime()) {
            usage[mediaId].lastPostedAt = dateValue;
          }
        }
      }
    });
  });

  return usage;
}

function sortMediaByUsageNewest() {
  sortMedia_([
    { name: 'posted_count', ascending: false },
    { name: 'used_count', ascending: false },
    { name: 'created_at', ascending: false },
    { name: 'media_id', ascending: true }
  ], 'MEDIA sorted by usage, newest first. (MEDIA отсортирован: использованные и новые сверху.)');
}

function sortMediaByUsageOldest() {
  sortMedia_([
    { name: 'posted_count', ascending: false },
    { name: 'used_count', ascending: false },
    { name: 'created_at', ascending: true },
    { name: 'media_id', ascending: true }
  ], 'MEDIA sorted by usage, oldest first. (MEDIA отсортирован: использованные и старые сверху.)');
}

function sortMediaByCreatedNewest() {
  sortMedia_([
    { name: 'created_at', ascending: false },
    { name: 'media_id', ascending: true }
  ], 'MEDIA sorted by newest first. (MEDIA отсортирован: новые сверху.)');
}

function sortMediaByCreatedOldest() {
  sortMedia_([
    { name: 'created_at', ascending: true },
    { name: 'media_id', ascending: true }
  ], 'MEDIA sorted by oldest first. (MEDIA отсортирован: старые сверху.)');
}

function sortMedia_(sortSpec, message) {
  setupMediaSheet_();
  refreshMediaUsage_();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEDIA_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 3) {
    return;
  }

  const cols = getHeaderMap_(sheet);
  const sortColumns = sortSpec
    .filter(item => cols[item.name])
    .map(item => ({
      column: cols[item.name],
      ascending: item.ascending
    }));

  if (!sortColumns.length) {
    SpreadsheetApp.getUi().alert('Required sort columns were not found. (Не найдены колонки для сортировки.)');
    return;
  }

  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).sort(sortColumns);
  applyMediaVisuals_();

  SpreadsheetApp.getUi().alert(message);
}

function deleteSelectedMediaFiles() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (!sheet || sheet.getName() !== MEDIA_SHEET_NAME) {
    ui.alert('Open MEDIA and select one or more media rows. (Открой лист MEDIA и выбери строки медиа.)');
    return;
  }

  setupMediaSheet_();

  const cols = getHeaderMap_(sheet);

  if (!cols.media_id || !cols.file_id || !cols.name) {
    ui.alert('MEDIA is missing required columns. (В MEDIA не хватает обязательных колонок.)');
    return;
  }

  const selectedRows = getSelectedDataRows_(sheet);

  if (!selectedRows.length) {
    ui.alert('Select media rows below the header. (Выбери строки медиа ниже заголовка.)');
    return;
  }

  const items = selectedRows
    .map(row => buildSelectedMediaItem_(sheet, cols, row))
    .filter(item => item.mediaId || item.fileId || item.name);

  if (!items.length) {
    ui.alert('Selected rows do not contain media. (В выбранных строках нет медиа.)');
    return;
  }

  const preview = items.slice(0, 20)
    .map(item => `${item.mediaId || '(no media_id)'} - ${item.name || '(no name)'}`)
    .join('\n');
  const suffix = items.length > 20 ? `\n...and ${items.length - 20} more` : '';
  const response = ui.alert(
    'Delete selected media files? (Удалить выбранные медиафайлы?)',
    `Files will be moved to Google Drive trash and rows will be deleted from MEDIA.\nФайлы будут перемещены в корзину Google Drive, строки будут удалены из MEDIA.\n\n${preview}${suffix}`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  const results = [];
  items.forEach(item => {
    if (item.fileId) {
      results.push(trashFileById_(item.fileId, `${item.mediaId} ${item.name}`));
    }

    if (item.previewFileId && item.previewFileId !== item.fileId) {
      results.push(trashFileById_(item.previewFileId, `${item.mediaId} preview`));
    }
  });

  deleteSheetRows_(sheet, items.map(item => item.row));
  refreshPostPreviews();
  refreshMediaUsage_();
  applyMediaVisuals_();

  const failed = results.filter(result => !result.ok);
  const message = failed.length
    ? `Rows deleted, but ${failed.length} Drive files could not be trashed.\nСтроки удалены, но ${failed.length} файлов Drive не удалось переместить в корзину.`
    : `Deleted ${items.length} MEDIA rows and moved files to trash.\nУдалено строк MEDIA: ${items.length}; файлы перемещены в корзину.`;

  ui.alert(message);
}

function scanFolderSoft_(folder, parentPath, scanned) {
  const folderName = folder.getName();
  const currentPath = parentPath ? `${parentPath}/${folderName}` : folderName;

  const files = [];
  const iterator = folder.getFiles();

  while (iterator.hasNext()) {
    files.push(iterator.next());
  }

  const previewMap = buildVideoPreviewMap_(files);
  const usedPreviewFileIds = {};

  Object.values(previewMap).forEach(file => {
    usedPreviewFileIds[file.getId()] = true;
  });

  files.forEach(file => {
    const mimeType = file.getMimeType();
    const type = getMediaType_(mimeType);

    if (type === 'other') {
      return;
    }

    if (type === 'image' && usedPreviewFileIds[file.getId()]) {
      return;
    }

    const fileId = file.getId();
    const previewFile = type === 'video' ? previewMap[file.getName()] : null;
    const previewFileId = previewFile ? previewFile.getId() : '';
    const previewUrl = previewFileId
      ? `https://lh3.googleusercontent.com/d/${previewFileId}`
      : `https://lh3.googleusercontent.com/d/${fileId}`;

    scanned.push({
      type,
      fileStatus: 'active',
      path: currentPath,
      name: file.getName(),
      driveUrl: file.getUrl(),
      fileId,
      mimeType,
      previewFileId,
      previewUrl,
      createdAt: file.getDateCreated(),
      updatedAt: file.getLastUpdated()
    });
  });

  const folders = folder.getFolders();

  while (folders.hasNext()) {
    scanFolderSoft_(folders.next(), currentPath, scanned);
  }
}

function readExistingMedia_(sheet, cols) {
  const result = {
    byFileId: {},
    idState: createMediaIdState_()
  };

  if (sheet.getLastRow() < 2 || !cols.file_id || !cols.media_id) {
    return result;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  values.forEach((row, index) => {
    const mediaId = row[cols.media_id - 1];
    const fileId = row[cols.file_id - 1];

    if (mediaId) {
      rememberMediaId_(result.idState, mediaId);
    }

    if (isLegacyMediaId_(mediaId)) {
      reserveNextMediaId_(result.idState, mediaTypeFromRow_(row, cols));
    }

    if (fileId) {
      result.byFileId[fileId] = {
        row: index + 2,
        mediaId,
        fileStatus: cols.file_status ? String(row[cols.file_status - 1] || '').trim().toLowerCase() : ''
      };
    }
  });

  return result;
}

function updateExistingMediaRows_(sheet, cols, existing, scannedByFileId) {
  const summary = {
    updated: 0,
    missing: 0,
    newlyMissing: 0
  };

  Object.keys(existing.byFileId).forEach(fileId => {
    const rowInfo = existing.byFileId[fileId];
    const row = rowInfo.row;
    const item = scannedByFileId[fileId];

    if (!item) {
      setCell_(sheet, row, cols.file_status, 'missing');
      setCell_(sheet, row, cols.preview, 'missing');
      summary.missing += 1;

      if (rowInfo.fileStatus !== 'missing') {
        summary.newlyMissing += 1;
      }

      return;
    }

    setMediaRowValues_(sheet, cols, row, rowInfo.mediaId, item);
    summary.updated += 1;
  });

  return summary;
}

function appendNewMediaRows_(sheet, cols, existing, scanned) {
  const idState = existing.idState || createMediaIdState_();
  const summary = {
    added: 0
  };

  scanned.forEach(item => {
    if (existing.byFileId[item.fileId]) {
      return;
    }

    const mediaId = nextMediaId_(idState, item.type);
    const row = sheet.getLastRow() + 1;

    setMediaRowValues_(sheet, cols, row, mediaId, item);
    summary.added += 1;
  });

  return summary;
}

function createMediaIdState_() {
  return {
    used: {},
    maxByPrefix: {
      'IMG_': 0,
      'VID_': 0
    }
  };
}

function mediaTypeFromRow_(row, cols) {
  const type = cols.type ? String(row[cols.type - 1] || '').trim().toLowerCase() : '';
  if (type === 'image' || type === 'video') {
    return type;
  }

  const mimeType = cols.mime_type ? String(row[cols.mime_type - 1] || '').trim().toLowerCase() : '';
  return getMediaType_(mimeType);
}

function mediaIdPrefixForType_(type) {
  const clean = String(type || '').trim().toLowerCase();
  if (clean === 'video') return 'VID_';
  return 'IMG_';
}

function isLegacyMediaId_(mediaId) {
  return /^(M\d+|image\d+|vid\d+)$/i.test(String(mediaId || '').trim());
}

function rememberMediaId_(state, mediaId) {
  const clean = String(mediaId || '').trim();
  if (!clean) {
    return;
  }

  state.used[clean.toLowerCase()] = true;

  const match = clean.match(/^(IMG_|VID_)(\d+)$/i);
  if (!match) {
    return;
  }

  const prefix = match[1].toUpperCase();
  const number = Number(match[2]);
  state.maxByPrefix[prefix] = Math.max(state.maxByPrefix[prefix] || 0, number);
}

function reserveNextMediaId_(state, type) {
  return nextMediaId_(state, type);
}

function nextMediaId_(state, type) {
  const prefix = mediaIdPrefixForType_(type);
  const digits = prefix === 'VID_' ? 4 : 3;
  let number = (state.maxByPrefix[prefix] || 0) + 1;
  let mediaId = `${prefix}${String(number).padStart(digits, '0')}`;

  while (state.used[mediaId.toLowerCase()]) {
    number += 1;
    mediaId = `${prefix}${String(number).padStart(digits, '0')}`;
  }

  state.maxByPrefix[prefix] = number;
  state.used[mediaId.toLowerCase()] = true;
  return mediaId;
}

function setMediaRowValues_(sheet, cols, row, mediaId, item) {
  setCell_(sheet, row, cols.media_id, mediaId);
  setCell_(sheet, row, cols.type, item.type);
  setCell_(sheet, row, cols.file_status, item.fileStatus);
  setCell_(sheet, row, cols.path, item.path);
  setCell_(sheet, row, cols.name, item.name);
  setCell_(sheet, row, cols.drive_url, item.driveUrl);
  setCell_(sheet, row, cols.file_id, item.fileId);
  setCell_(sheet, row, cols.mime_type, item.mimeType);
  setCell_(sheet, row, cols.preview_url, item.previewUrl);
  setCell_(sheet, row, cols.created_at, item.createdAt);
  setCell_(sheet, row, cols.updated_at, item.updatedAt);

  if (cols.preview) {
    const previewCell = sheet.getRange(row, cols.preview);
    previewCell.clearDataValidations();

    if (item.previewUrl) {
      previewCell.setFormula(`=IMAGE("${item.previewUrl}")`);
    } else {
      previewCell.setValue(item.type === 'video' ? '▶ VIDEO' : '');
    }
  }
}

function applyMediaVisuals_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MEDIA_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const cols = getHeaderMap_(sheet);

  if (!cols.type || !cols.file_status) {
    return;
  }

  for (let row = 2; row <= sheet.getLastRow(); row++) {
    const type = String(sheet.getRange(row, cols.type).getValue() || '');
    const status = String(sheet.getRange(row, cols.file_status).getValue() || '');
    const usedCount = cols.used_count ? Number(sheet.getRange(row, cols.used_count).getValue() || 0) : 0;
    const postedCount = cols.posted_count ? Number(sheet.getRange(row, cols.posted_count).getValue() || 0) : 0;
    const mediaColor = status === 'missing'
      ? '#eeeeee'
      : postedCount > 0
        ? '#d9ead3'
        : usedCount > 0
          ? '#eef7e9'
          : '#ffffff';

    if (cols.type) {
      sheet.getRange(row, cols.type).setBackground(type === 'video' ? '#d9eaf7' : '#ffffff');
    }

    if (cols.file_status) {
      sheet.getRange(row, cols.file_status).setBackground(status === 'missing' ? '#eeeeee' : '#d9ead3');
    }

    if (cols.preview && status === 'missing') {
      sheet.getRange(row, cols.preview).setBackground('#eeeeee');
    } else if (cols.preview && type === 'video') {
      sheet.getRange(row, cols.preview).setBackground('#d9eaf7');
    } else if (cols.preview) {
      sheet.getRange(row, cols.preview).setBackground('#ffffff');
    }

    if (cols.media_id) {
      sheet.getRange(row, cols.media_id).setBackground(mediaColor);
    }

    if (cols.name) {
      sheet.getRange(row, cols.name).setBackground(mediaColor);
    }

    if (cols.used_count) {
      sheet.getRange(row, cols.used_count).setBackground(usedCount > 0 ? '#eef7e9' : '#ffffff');
    }

    if (cols.posted_count) {
      sheet.getRange(row, cols.posted_count).setBackground(postedCount > 0 ? '#d9ead3' : '#ffffff');
    }
  }
}

function buildVideoPreviewMap_(files) {
  const imagesByName = {};
  const map = {};

  files.forEach(file => {
    const mime = file.getMimeType();

    if (!mime.startsWith('image/')) {
      return;
    }

    imagesByName[file.getName().toLowerCase()] = file;
  });

  files.forEach(file => {
    const mime = file.getMimeType();

    if (!mime.startsWith('video/')) {
      return;
    }

    const videoName = file.getName();
    const lower = videoName.toLowerCase();
    const base = lower.replace(/\.[^/.]+$/, '');

    const candidates = [
      `${lower}.jpg`,
      `${lower}.png`,
      `${lower}.webp`,
      `${base}_preview.jpg`,
      `${base}_preview.png`,
      `${base}_preview.webp`,
      `${base}-preview.jpg`,
      `${base}-preview.png`,
      `${base}-preview.webp`,
      `${base}.jpg`,
      `${base}.png`,
      `${base}.webp`
    ];

    for (const name of candidates) {
      if (imagesByName[name]) {
        map[videoName] = imagesByName[name];
        return;
      }
    }
  });

  return map;
}

function countMediaRowsByStatus_(sheet, cols) {
  const summary = {
    totalRows: 0,
    activeRows: 0,
    missingRows: 0
  };

  if (!sheet || sheet.getLastRow() < 2 || !cols.file_status) {
    return summary;
  }

  const values = sheet.getRange(2, cols.file_status, sheet.getLastRow() - 1, 1).getValues().flat();

  values.forEach(value => {
    const status = String(value || '').trim().toLowerCase();
    summary.totalRows += 1;

    if (status === 'missing') {
      summary.missingRows += 1;
    } else {
      summary.activeRows += 1;
    }
  });

  return summary;
}

function buildMediaSyncMessage_(scannedCount, updateSummary, appendSummary, statusSummary) {
  return [
    'MEDIA sync completed. (Синхронизация MEDIA завершена.)',
    '',
    `Drive media found: ${scannedCount}`,
    `Existing rows refreshed: ${updateSummary.updated}`,
    `New rows added: ${appendSummary.added}`,
    `Missing rows now: ${statusSummary.missingRows}`,
    `Newly marked missing: ${updateSummary.newlyMissing}`,
    `MEDIA rows total: ${statusSummary.totalRows}`,
    '',
    'If you want to remove missing rows from MEDIA, run Sync > Remove missing MEDIA rows.',
    'Если нужно убрать missing-строки из MEDIA, запусти Sync > Remove missing MEDIA rows.'
  ].join('\n');
}
