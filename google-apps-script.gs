/*
  Google Apps Script dla zapisu odpowiedzi do Google Sheets i obsługi DeepSeek.
  
  ========== INSTRUKCJE DLA PROGRAMISTÓW ==========
  
  1. SETUP WSTĘPNY:
     - Przejdź do: https://script.google.com/
     - Utwórz nowy projekt lub otwórz istniejący
     - Wklej ten kod
  
  2. KONFIGURACJA DEEPSEEK API KEY (WAŻNE!):
     - W menu GAS: "Ustawienia projektu" → "Właściwości skryptu"
     - Kliknij ikonę zamka obok "Właściwości skryptu"
     - Dodaj nową właściwość:
       Klucz: DEEPSEEK_API_KEY
       Wartość: [wklej swój klucz z https://api.deepseek.com]
     - Zapisz
     
     Dlaczego? Ze względów bezpieczeństwa klucz API nigdy nie pojawia się w kodzie JavaScript.
     GAS pobiera go z bezpiecznych właściwości projektu.
  
  3. WDROŻENIE:
     - Kliknij "Wdróż" → "Nowe wdrożenie"
     - Typ: "Aplikacja sieciowa"
     - Wykonaj jako: Ja (twoje konto)
     - Kto ma dostęp: Każdy (Everyone) — WAŻNE dla CORS!
     - Skopiuj URL wdrożenia
     - Wklej URL do app.js w zmiennej WEBHOOK_URL
  
  4. TESTOWANIE:
     - Frontend wysyła GET z ?action=ranking → GAS zwraca ranking
     - Frontend wysyła POST z action=deepseek → GAS bezpiecznie wywiła DeepSeek
  
  ========== ARCHITEKTURA BEZPIECZEŃSTWA ==========
  
  ❌ NIEBEZPIECZNE (stare podejście):
     - app.js miał DEEPSEEK_API_KEY w kodzie
     - Wszyscy mogą zobaczyć klucz w DevTools
     - Każdy może nadużyć API
  
  ✅ BEZPIECZNE (obecne podejście):
     - Klucz przechowywany tylko w GAS (właściwości)
     - Frontend NIGDY nie ma dostępu do klucza
     - GAS to trusted backend → może wywoływać DeepSeek
     - Każdy prompt musi być zgodny z logiką biznesową
*/

const ANSWERS_SHEET_ID = "1THZ_Bk8SHWeIz8hBr6a9mV5gGPIBqEcZk_KKDYnEmaQ";
const SHEET_NAME = "Arkusz1"; // Dostosuj, jeśli inna nazwa zakładki

// ⚠️ DEEPSEEK_API_KEY pobierany z Właściwości skryptu (Settings → Project Properties)
// Nigdy nie umieszczaj klucza hardcoded'em w tym pliku!
// Aby go ustawić: Ustawienia projektu → Właściwości skryptu → dodaj DEEPSEEK_API_KEY
const DEEPSEEK_API_KEY = PropertiesService.getScriptProperties().getProperty("DEEPSEEK_API_KEY");
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// Odpowiada na GET — zwraca ranking globalny gdy action=ranking, inaczej info
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'ranking') {
    return getRanking();
  }

  return ContentService
    .createTextOutput("Web App działa poprawnie. Wysyłaj dane przez POST.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// Pobierz wszystkie odpowiedzi z arkusza i zwróć jako JSON
function getRanking() {
  try {
    const spreadsheet = SpreadsheetApp.openById(ANSWERS_SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', answers: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Pierwsza linia to nagłówki — mapujemy kolumny
    // Kolumny: Data zapisu, Timestamp, Imię, ID pytania, Pytanie, Obrazek A, Obrazek B, Odpowiedź, Metoda, Sugestia
    const answers = data.slice(1).map(row => ({
      timestamp:     row[1] || '',
      name:          row[2] || '',
      question_id:   row[3] || '',
      question_text: row[4] || '',
      image_a:       row[5] || '',
      image_b:       row[6] || '',
      answer:        row[7] || '',
      answer_method: row[8] || '',
      suggestion:    row[9] || ''
    })).filter(r => r.image_b); // tylko wiersze z obrazkiem B

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', answers }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('getRanking error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
// ℹ️ Ta funkcja działa po stronie serwera (GAS), dzięki czemu klucz API jest chroniony
// Frontend wysyła prompt, GAS wysyła go do DeepSeek i zwraca wynik
function handleDeepSeek(prompt) {
  try {
    if (!DEEPSEEK_API_KEY) {
      console.error("DEEPSEEK_API_KEY nie jest skonfigurowany w Właściwościach skryptu!");
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "DeepSeek nie skonfigurowany (brak klucza API)" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
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
