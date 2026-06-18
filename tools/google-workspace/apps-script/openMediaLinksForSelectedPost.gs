function openMediaLinksForSelectedPost() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  if (sheet.getName() !== POSTS_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('Открой лист POSTS и выбери строку поста.');
    return;
  }

  const row = sheet.getActiveRange().getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert('Выбери строку поста, не заголовок.');
    return;
  }

  const postCols = getHeaderMap_(sheet);

  if (!postCols.media_ids) {
    SpreadsheetApp.getUi().alert('Не найдена колонка media_ids.');
    return;
  }

  const mediaIds = String(sheet.getRange(row, postCols.media_ids).getValue() || '')
    .split(/[,;\n]+/)
    .map(id => id.trim())
    .filter(Boolean);

  if (mediaIds.length === 0) {
    SpreadsheetApp.getUi().alert('В этой строке нет media_ids.');
    return;
  }

  const mediaSheet = ss.getSheetByName(MEDIA_SHEET_NAME);

  if (!mediaSheet) {
    SpreadsheetApp.getUi().alert('Не найден лист MEDIA.');
    return;
  }

  const mediaMap = getMediaLibraryMap_(mediaSheet);

  const links = mediaIds
    .map((mediaId, index) => {
      const item = mediaMap[mediaId];

      if (!item || item.fileStatus === 'missing') {
        return null;
      }

      const file = DriveApp.getFileById(item.fileId);

      return {
        index: index + 1,
        mediaId,
        name: item.name,
        url: file.getUrl()
      };
    })
    .filter(Boolean);

  if (links.length === 0) {
    SpreadsheetApp.getUi().alert('Не удалось найти активные файлы по media_ids.');
    return;
  }

  const linksHtml = links.map(item => `
    <div style="margin-bottom: 8px;">
      <a href="${item.url}" target="_blank">
        ${String(item.index).padStart(2, '0')}. ${item.mediaId} — ${escapeHtml_(item.name)}
      </a>
    </div>
  `).join('');

  const html = HtmlService.createHtmlOutput(`
    <div style="font-family: Arial, sans-serif; padding: 12px;">
      <p><b>Медиа поста:</b> ${links.length}</p>
      ${linksHtml}
      <hr>
      <button onclick="openAll()">Открыть все</button>

      <script>
        const urls = ${JSON.stringify(links.map(item => item.url))};

        function openAll() {
          urls.forEach(url => window.open(url, '_blank'));
        }
      </script>
    </div>
  `).setWidth(520).setHeight(420);

  SpreadsheetApp.getUi().showModalDialog(html, 'Media links');
}

function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}