/*
  Google Apps Script dla zapisu odpowiedzi do Google Sheets.
  1. Wklej ten kod do edytora Apps Script: https://script.google.com/
  2. Wdróż jako aplikację sieciową (Web App):
     - Wykonaj jako: Ja (swoje konto)
     - Kto ma dostęp: Każdy (Everyone)
  3. Skopiuj URL wdrożenia do zmiennej WEBHOOK_URL w app.js.
*/

const ANSWERS_SHEET_ID = "1THZ_Bk8SHWeIz8hBr6a9mV5gGPIBqEcZk_KKDYnEmaQ";
const SHEET_NAME = "Arkusz1"; // Dostosuj, jeśli inna nazwa zakładki

// ⬇️ Wklej tutaj swój klucz DeepSeek — jest bezpieczny, bo ten plik nie jest publiczny
const DEEPSEEK_API_KEY = "TUTAJ_WKLEJ_KLUCZ_DEEPSEEK";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// Odpowiada na GET - np. gdy wchodzisz na URL w przeglądarce
function doGet(e) {
  return ContentService
    .createTextOutput("Web App działa poprawnie. Wysyłaj dane przez POST.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Obsługuje preflight CORS (OPTIONS) - niektóre przeglądarki to wysyłają przed POST
function doOptions(e) {
  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Główna funkcja — obsługuje zapis do arkusza i wywołania DeepSeek
function doPost(e) {
  try {
    let body;
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      body = e.parameter || {};
    }

    // Jeśli action=deepseek — wygeneruj wiadomość przez DeepSeek i zwróć ją
    if (body.action === "deepseek") {
      return handleDeepSeek(body.prompt);
    }

    // W przeciwnym razie — zapisz odpowiedź do arkusza
    const spreadsheet = SpreadsheetApp.openById(ANSWERS_SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];

    // Dodaj nagłówki jeśli arkusz jest pusty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Data zapisu",
        "Timestamp",
        "Imię",
        "ID pytania",
        "Pytanie",
        "Obrazek A",
        "Obrazek B",
        "Odpowiedź",
        "Metoda",
        "Sugestia"
      ]);
    }

    // Zapisz wiersz z odpowiedzią
    sheet.appendRow([
      new Date(),
      body.timestamp     || "",
      body.name          || "",
      body.question_id   || "",
      body.question_text || "",
      body.image_a       || "",
      body.image_b       || "",
      body.answer        || "",
      body.answer_method || "",
      body.suggestion    || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("doPost error:", error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Wywołuje DeepSeek i zwraca wygenerowaną wiadomość
function handleDeepSeek(prompt) {
  try {
    if (!prompt) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "Brak promptu" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const response = UrlFetchApp.fetch(DEEPSEEK_API_URL, {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + DEEPSEEK_API_KEY
      },
      payload: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300
      }),
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());

    if (data.choices && data.choices[0]) {
      const message = data.choices[0].message.content;
      return ContentService
        .createTextOutput(JSON.stringify({ status: "ok", message }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      console.error("DeepSeek unexpected response:", JSON.stringify(data));
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "Brak odpowiedzi od DeepSeek" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    console.error("handleDeepSeek error:", error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
