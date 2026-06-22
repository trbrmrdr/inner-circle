function refreshPostPreviews() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName(POSTS_SHEET_NAME);
  const mediaSheet = ss.getSheetByName(MEDIA_SHEET_NAME);

  if (!postsSheet || !mediaSheet) {
    return;
  }

  setupPostsSheet_();

  const postCols = getHeaderMap_(postsSheet);
  const mediaCols = getHeaderMap_(mediaSheet);

  if (!postCols.media_ids || !mediaCols.media_id || !mediaCols.preview_url || !mediaCols.file_status) {
    return;
  }

  const lastRow = postsSheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  for (let row = 2; row <= lastRow; row++) {
    const mediaIdsValue = String(postsSheet.getRange(row, postCols.media_ids).getValue() || '').trim();

    const ids = mediaIdsValue
        .split(/[,;\n]+/)
        .map(id => id.trim())
        .filter(Boolean);

    for (let i = 1; i <= MAX_PREVIEWS; i++) {
      const col = postCols[`preview_${i}`];

      if (!col) {
        continue;
      }

      const cell = postsSheet.getRange(row, col);
      cell.clearDataValidations();

      const mediaId = ids[i - 1];

      if (!mediaId) {
        cell.clearContent();
        continue;
      }

      cell.setFormula(buildFlexiblePreviewFormula_(mediaId, mediaCols));
    }
  }

  syncPostIds_();
  updateDateMarkers_();
  validatePostIds_();
}

function buildFlexiblePreviewFormula_(mediaId, mediaCols) {
  const safeMediaId = String(mediaId || '').replace(/"/g, '""');
  const mediaIdCol = columnToLetter_(mediaCols.media_id);
  const previewUrlCol = columnToLetter_(mediaCols.preview_url);
  const fileStatusCol = columnToLetter_(mediaCols.file_status);

  return `=IFERROR(IF(INDEX(MEDIA!${fileStatusCol}:${fileStatusCol}; MATCH("${safeMediaId}"; MEDIA!${mediaIdCol}:${mediaIdCol}; 0))="missing"; "MISSING: ${safeMediaId}"; IMAGE(INDEX(MEDIA!${previewUrlCol}:${previewUrlCol}; MATCH("${safeMediaId}"; MEDIA!${mediaIdCol}:${mediaIdCol}; 0)))); "NOT FOUND: ${safeMediaId}")`;
}

function sortPostsByDateTime() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POSTS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 3) {
    return;
  }

  const cols = getHeaderMap_(sheet);

  if (!cols.date || !cols.time) {
    return;
  }

  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .sort([
      { column: cols.date, ascending: true },
      { column: cols.time, ascending: true }
    ]);

  refreshPostPreviews();
}

function syncPostIds() {
  const sheet = getOrCreateSheet_(POSTS_SHEET_NAME);
  ensureColumns_(sheet, POSTS_COLUMNS);
  applyPostsLayout_(sheet);

  const result = syncPostIds_();
  updateDateMarkers_();
  const validation = validatePostIds_();

  SpreadsheetApp.getUi().alert([
    `Post IDs synced. (post_id синхронизированы.)`,
    `Updated: ${result.updated}`,
    `Cleared: ${result.cleared}`,
    `Frozen: ${result.frozen}`,
    `Missing ready rows: ${validation.missingRows.length}`,
    `Duplicate IDs: ${validation.duplicateIds.length}`
  ].join('\n'));
}

function syncPostIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POSTS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      updated: 0,
      cleared: 0,
      frozen: 0
    };
  }

  const cols = getHeaderMap_(sheet);

  if (!cols.post_id) {
    return {
      updated: 0,
      cleared: 0,
      frozen: 0
    };
  }

  const rowCount = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const usedIds = {};
  let updated = 0;
  let cleared = 0;
  let frozen = 0;

  values.forEach(row => {
    const currentId = String(row[cols.post_id - 1] || '').trim();
    if (currentId && isPostRowSealed_(row, cols)) {
      usedIds[currentId.toLowerCase()] = true;
    }
  });

  const nextIds = values.map(row => {
    const currentId = String(row[cols.post_id - 1] || '').trim();

    if (isPostRowSealed_(row, cols)) {
      frozen += 1;
      return [currentId];
    }

    if (!isPostRowReadyForId_(row, cols)) {
      if (currentId) {
        cleared += 1;
      }

      return [''];
    }

    const baseId = buildPostId_(row, cols);
    let nextId = baseId;
    let suffix = 2;

    while (usedIds[nextId.toLowerCase()]) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    usedIds[nextId.toLowerCase()] = true;

    if (nextId !== currentId) {
      updated += 1;
    }

    return [nextId];
  });

  sheet.getRange(2, cols.post_id, rowCount, 1).setValues(nextIds);

  return {
    updated,
    cleared,
    frozen
  };
}

function validatePostIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POSTS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      missingRows: [],
      duplicateIds: []
    };
  }

  const cols = getHeaderMap_(sheet);

  if (!cols.post_id) {
    return {
      missingRows: [],
      duplicateIds: []
    };
  }

  const rowCount = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getValues();
  const postIds = {};
  const rowErrors = {};
  const missingRows = [];
  const duplicateIds = {};

  values.forEach((row, index) => {
    const sheetRow = index + 2;
    const postId = String(row[cols.post_id - 1] || '').trim();

    if (!postId) {
      if (isPostRowReadyForId_(row, cols) || isPostRowSealed_(row, cols)) {
        rowErrors[sheetRow] = true;
        missingRows.push(sheetRow);
      }

      return;
    }

    const normalizedPostId = postId.toLowerCase();

    if (!postIds[normalizedPostId]) {
      postIds[normalizedPostId] = {
        value: postId,
        rows: []
      };
    }

    postIds[normalizedPostId].rows.push(sheetRow);
  });

  Object.keys(postIds).forEach(key => {
    const item = postIds[key];

    if (item.rows.length < 2) {
      return;
    }

    duplicateIds[item.value] = true;
    item.rows.forEach(row => rowErrors[row] = true);
  });

  const backgrounds = values.map((row, index) => {
    const sheetRow = index + 2;
    return [rowErrors[sheetRow] ? '#f4cccc' : '#ffffff'];
  });

  sheet.getRange(2, cols.post_id, rowCount, 1).setBackgrounds(backgrounds);

  return {
    missingRows,
    duplicateIds: Object.keys(duplicateIds)
  };
}

function isPostRowReadyForId_(row, cols) {
  if (!cols.date || !cols.time || !cols.platforms) {
    return false;
  }

  const dateValue = row[cols.date - 1];
  const timeValue = row[cols.time - 1];
  const platformsValue = String(row[cols.platforms - 1] || '').trim();
  const hasDate = dateValue instanceof Date || String(dateValue || '').trim() !== '';
  const hasTime = timeValue instanceof Date || String(timeValue || '').trim() !== '';
  const hasText = cols.text ? String(row[cols.text - 1] || '').trim() !== '' : false;
  const hasMedia = cols.media_ids ? String(row[cols.media_ids - 1] || '').trim() !== '' : false;

  if (!hasDate || !hasTime || !platformsValue || !hasKnownPostPlatform_(platformsValue)) {
    return false;
  }

  return hasText || hasMedia;
}

function isPostRowInvalidForPublishing_(row, cols) {
  if (!isAutopostReadyStatus_(row, cols)) {
    return false;
  }

  const postId = cols.post_id ? String(row[cols.post_id - 1] || '').trim() : '';
  return !postId || !isPostRowReadyForId_(row, cols);
}

function isAutopostReadyStatus_(row, cols) {
  return normalizePostStatus_(cols.status ? row[cols.status - 1] : '') === 'ready';
}

function normalizePostStatus_(value) {
  return String(value || '').trim().toLowerCase();
}

function hasKnownPostPlatform_(value) {
  return splitPostPlatforms_(value).some(platform => ['telegram', 'vk', 'instagram', 'facebook'].indexOf(platform) !== -1);
}

function splitPostPlatforms_(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      if (item === 'tg') return 'telegram';
      if (item === 'телеграм') return 'telegram';
      if (item === 'вк' || item === 'vkontakte') return 'vk';
      if (item === 'ig') return 'instagram';
      if (item === 'inst' || item === 'инстаграм') return 'instagram';
      if (item === 'fb') return 'facebook';
      if (item === 'фейсбук') return 'facebook';
      return item;
    });
}

function isPostRowSealed_(row, cols) {
  const statuses = [
    cols.status ? row[cols.status - 1] : '',
    cols.telegram_status ? row[cols.telegram_status - 1] : '',
    cols.vk_status ? row[cols.vk_status - 1] : '',
    cols.instagram_status ? row[cols.instagram_status - 1] : '',
    cols.facebook_status ? row[cols.facebook_status - 1] : ''
  ].map(value => String(value || '').trim().toLowerCase());

  if (statuses.some(status => ['processing', 'posted', 'done', 'partial'].indexOf(status) !== -1)) {
    return true;
  }

  return Boolean(
    (cols.telegram_message_id && String(row[cols.telegram_message_id - 1] || '').trim()) ||
    (cols.vk_post_id && String(row[cols.vk_post_id - 1] || '').trim()) ||
    (cols.instagram_media_id && String(row[cols.instagram_media_id - 1] || '').trim()) ||
    (cols.facebook_post_id && String(row[cols.facebook_post_id - 1] || '').trim())
  );
}

function buildPostId_(row, cols) {
  const datePart = formatPostIdDate_(row[cols.date - 1]);
  const timePart = formatPostIdTime_(row[cols.time - 1]);
  const platformSuffix = formatPostIdPlatforms_(row[cols.platforms - 1]);
  const signature = [
    datePart,
    timePart,
    platformSuffix,
    cols.text ? String(row[cols.text - 1] || '').trim() : '',
    cols.media_ids ? String(row[cols.media_ids - 1] || '').trim() : ''
  ].join('|');

  return `${datePart}-${timePart}-${shortPostHash_(signature)}-${platformSuffix}`;
}

function formatPostIdDate_(value) {
  const timezone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

  if (value instanceof Date) {
    return Utilities.formatDate(value, timezone, 'yyMMdd');
  }

  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);

  if (isoMatch) {
    const year = isoMatch[1].slice(-2);
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}${month}${day}`;
  }

  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);

  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3].slice(-2);
    return `${year}${month}${day}`;
  }

  return text.replace(/\D/g, '').slice(-6).padStart(6, '0') || '000000';
}

function formatPostIdTime_(value) {
  const timezone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

  if (value instanceof Date) {
    return Utilities.formatDate(value, timezone, 'HHmm');
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})(?::|\.)(\d{2})/);

  if (match) {
    return `${match[1].padStart(2, '0')}${match[2]}`;
  }

  return text.replace(/\D/g, '').slice(0, 4).padEnd(4, '0') || '0000';
}

function formatPostIdPlatforms_(value) {
  const rawItems = String(value || '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
  const symbols = {
    telegram: 'T',
    tg: 'T',
    'телеграм': 'T',
    vk: 'V',
    'вк': 'V',
    vkontakte: 'V',
    instagram: 'I',
    ig: 'I',
    inst: 'I',
    'инстаграм': 'I',
    facebook: 'F',
    fb: 'F',
    'фейсбук': 'F'
  };
  const order = ['T', 'V', 'I', 'F'];
  const found = {};

  rawItems.forEach(item => {
    const symbol = symbols[item] || String(item[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (symbol) {
      found[symbol] = true;
    }
  });

  const known = order.filter(symbol => found[symbol]);
  const unknown = Object.keys(found).filter(symbol => order.indexOf(symbol) === -1).sort();
  return known.concat(unknown).join('') || 'X';
}

function shortPostHash_(value) {
  let hash = 2166136261;
  const text = String(value || '');

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36).toUpperCase().slice(0, 5).padStart(5, '0');
}

function updateDateMarkers_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(POSTS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const cols = getHeaderMap_(sheet);

  if (!cols['*date_marker'] || !cols.date) {
    return;
  }

  const today = normalizeDate_(new Date());

  for (let row = 2; row <= sheet.getLastRow(); row++) {
    const rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const dateValue = sheet.getRange(row, cols.date).getValue();
    const markerCell = sheet.getRange(row, cols['*date_marker']);

    markerCell.clearContent();

    if (isPostRowInvalidForPublishing_(rowValues, cols)) {
      markerCell.setBackground('#d9d2e9');
      continue;
    }

    if (!(dateValue instanceof Date)) {
      markerCell.setBackground('#ffffff');
      continue;
    }

    const postDate = normalizeDate_(dateValue);

    if (postDate.getTime() < today.getTime()) {
      markerCell.setBackground('#f4cccc');
    } else if (postDate.getTime() === today.getTime()) {
      markerCell.setBackground('#d9ead3');
    } else {
      markerCell.setBackground('#d9eaf7');
    }
  }
}

function applyStatusFormatting_(sheet) {
  const cols = getHeaderMap_(sheet);

  if (!cols.status) {
    return;
  }

  const statusRange = sheet.getRange(2, cols.status, sheet.getMaxRows() - 1, 1);

  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('draft')
      .setBackground('#eeeeee')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('template')
      .setBackground('#ffffff')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('ready')
      .setBackground('#cfe2f3')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('processing')
      .setBackground('#fff2cc')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('posted')
      .setBackground('#d9ead3')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('done')
      .setBackground('#d9ead3')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('partial')
      .setBackground('#fce5cd')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('error')
      .setBackground('#f4cccc')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('skipped')
      .setBackground('#eeeeee')
      .setRanges([statusRange])
      .build()
  ];

  sheet.setConditionalFormatRules(rules);
}
