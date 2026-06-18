function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureColumns_(sheet, columns) {
  const headerMap = getHeaderMap_(sheet);

  columns.forEach(name => {
    if (!headerMap[name]) {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue(name);
    }
  });
}

function getHeaderMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};

  headers.forEach((header, index) => {
    const key = String(header || '').trim();

    if (key) {
      map[key] = index + 1;
    }
  });

  return map;
}

function setCell_(sheet, row, col, value) {
  if (col) {
    sheet.getRange(row, col).setValue(value);
  }
}

function setWidth_(sheet, col, width) {
  if (col) {
    sheet.setColumnWidth(col, width);
  }
}

function splitMediaIds_(value) {
  return String(value || '')
    .split(/[,;\n]+/)
    .map(id => id.trim())
    .filter(Boolean);
}

function getMediaType_(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

function normalizeDate_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateForFile_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
}

function columnToLetter_(column) {
  let temp;
  let letter = '';

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}

function getOrCreateFolderByName_(name) {
  const folders = DriveApp.getFoldersByName(name);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(name);
}

function getMediaLibraryMap_(sheet) {
  const map = {};
  const cols = getHeaderMap_(sheet);

  if (!cols.media_id || !cols.file_id || !cols.name) {
    return map;
  }

  if (sheet.getLastRow() < 2) {
    return map;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  values.forEach(row => {
    const mediaId = row[cols.media_id - 1];

    if (!mediaId) {
      return;
    }

    map[mediaId] = {
      fileId: row[cols.file_id - 1],
      name: row[cols.name - 1],
      fileStatus: cols.file_status ? row[cols.file_status - 1] : 'active'
    };
  });

  return map;
}

function getSelectedDataRows_(sheet) {
  const rangeList = sheet.getActiveRangeList();
  const ranges = rangeList ? rangeList.getRanges() : [sheet.getActiveRange()];
  const rows = {};

  ranges.forEach(range => {
    if (!range) {
      return;
    }

    const startRow = range.getRow();
    const endRow = startRow + range.getNumRows() - 1;

    for (let row = startRow; row <= endRow; row++) {
      if (row >= 2) {
        rows[row] = true;
      }
    }
  });

  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);
}

function buildSelectedMediaItem_(sheet, cols, row) {
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const type = cols.type ? String(values[cols.type - 1] || '') : '';
  const fileId = cols.file_id ? String(values[cols.file_id - 1] || '').trim() : '';
  const previewUrl = cols.preview_url ? String(values[cols.preview_url - 1] || '').trim() : '';
  const previewFileId = type === 'video' ? extractDriveFileIdFromUrl_(previewUrl) : '';

  return {
    row,
    mediaId: cols.media_id ? String(values[cols.media_id - 1] || '').trim() : '',
    type,
    name: cols.name ? String(values[cols.name - 1] || '').trim() : '',
    fileId,
    previewFileId
  };
}

function extractDriveFileIdFromUrl_(url) {
  const text = String(url || '');
  const pathMatch = text.match(/\/d\/([A-Za-z0-9_-]+)/);

  if (pathMatch) {
    return pathMatch[1];
  }

  const queryMatch = text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return queryMatch ? queryMatch[1] : '';
}

function trashFileById_(fileId, label) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return {
      ok: true,
      fileId,
      label
    };
  } catch (error) {
    return {
      ok: false,
      fileId,
      label,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function deleteSheetRows_(sheet, rows) {
  const sortedRows = rows
    .filter(row => row >= 2)
    .sort((a, b) => b - a);
  let index = 0;

  while (index < sortedRows.length) {
    const bottomRow = sortedRows[index];
    let topRow = bottomRow;

    index += 1;

    while (index < sortedRows.length && sortedRows[index] === topRow - 1) {
      topRow = sortedRows[index];
      index += 1;
    }

    sheet.deleteRows(topRow, bottomRow - topRow + 1);
  }
}

function checkDuplicateIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const messages = [];

  const mediaSheet = ss.getSheetByName(MEDIA_SHEET_NAME);
  if (mediaSheet) {
    const mediaCols = getHeaderMap_(mediaSheet);
    if (mediaCols.media_id) {
      const duplicates = findDuplicatesInColumn_(mediaSheet, mediaCols.media_id);
      if (duplicates.length) {
        messages.push(`MEDIA media_id duplicates: ${duplicates.join(', ')}`);
      }
    }
  }

  const postsSheet = ss.getSheetByName(POSTS_SHEET_NAME);
  if (postsSheet) {
    const postCols = getHeaderMap_(postsSheet);
    if (postCols.post_id) {
      const duplicates = findDuplicatesInColumn_(postsSheet, postCols.post_id);
      if (duplicates.length) {
        messages.push(`POSTS post_id duplicates: ${duplicates.join(', ')}`);
      }
    }
  }

  SpreadsheetApp.getUi().alert(messages.length ? messages.join('\n') : 'Duplicate IDs not found.');
}

function findDuplicatesInColumn_(sheet, col) {
  if (sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues().flat();
  const seen = {};
  const duplicates = {};

  values.forEach(value => {
    const key = String(value || '').trim();

    if (!key) {
      return;
    }

    if (seen[key]) {
      duplicates[key] = true;
    }

    seen[key] = true;
  });

  return Object.keys(duplicates);
}
