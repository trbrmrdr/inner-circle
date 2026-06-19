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
      if (isPostRowReadyForId_(row, cols)) {
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
  if (!cols.date) {
    return false;
  }

  const dateValue = row[cols.date - 1];
  const hasDate = dateValue instanceof Date || String(dateValue || '').trim() !== '';

  if (!hasDate) {
    return false;
  }

  return Object.keys(cols).some(name => {
    if (name === '*date_marker' || name === 'post_id' || name === 'date') {
      return false;
    }

    if (/^preview_\d+$/.test(name)) {
      return false;
    }

    return String(row[cols[name] - 1] || '').trim() !== '';
  });
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
    const dateValue = sheet.getRange(row, cols.date).getValue();
    const markerCell = sheet.getRange(row, cols['*date_marker']);

    markerCell.clearContent();

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
      .whenTextEqualTo('ready')
      .setBackground('#cfe2f3')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('posted')
      .setBackground('#d9ead3')
      .setRanges([statusRange])
      .build(),

    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('error')
      .setBackground('#f4cccc')
      .setRanges([statusRange])
      .build()
  ];

  sheet.setConditionalFormatRules(rules);
}
