/*
  Google Apps Script dla zapisu odpowiedzi do Google Sheets.
  1. Wklej ten kod do edytora Apps Script: https://script.google.com/
  2. Zmień SHEET_ID na swój ID arkusza.
  3. Wdróż jako aplikację sieciową (Web App) i ustaw dostęp: "Każdy, nawet anonimowy".
  4. Skopiuj URL wdrożenia do zmiennej WEBHOOK_URL w app.js.
*/

const SHEET_ID = "1THZ_Bk8SHWeIz8hBr6a9mV5gGPIBqEcZk_KKDYnEmaQ";
const SHEET_NAME = "Arkusz1"; // Dostosuj, jeśli inna nazwa arkusza

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];

    const row = [
      new Date(),
      body.timestamp || "",
      body.name || "",
      body.question_id || "",
      body.question_text || "",
      body.image_a || "",
      body.image_b || "",
      body.answer || "",
      body.answer_method || "",
      body.suggestion || ""
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
