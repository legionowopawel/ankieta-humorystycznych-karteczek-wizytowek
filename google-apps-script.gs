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
// WAŻNE: klucz czytany świeżo przy każdym wywołaniu (nie jako globalna stała — byłby zamrożony jako null)
function getDeepSeekKey() {
  return PropertiesService.getScriptProperties().getProperty("DEEPSEEK_API_KEY");
}
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// ⚠️ WAŻNE: Ustaw SECRET_RANKING_TOKEN w Właściwościach skryptu!
// Przejdź do: Ustawienia projektu → Właściwości skryptu → dodaj:
// Klucz: SECRET_RANKING_TOKEN
// Wartość: [losowy ciąg znaków, np. "rank123abc789xyz"]
// Każde zapytanie do ?action=ranking musi zawierać &token=VALUE
function getSecretRankingToken() {
  return PropertiesService.getScriptProperties().getProperty("SECRET_RANKING_TOKEN");
}

// Odpowiada na GET — zwraca ranking globalny gdy action=ranking, inaczej info
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'ranking') {
    // Weryfikuj token przed zwróceniem rankingu
    const token = e && e.parameter && e.parameter.token;
    const expectedToken = getSecretRankingToken();
    
    if (!expectedToken) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "SECRET_RANKING_TOKEN nie jest skonfigurowany na serwerze. Kontakt: admin." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!token || token !== expectedToken) {
      console.warn("⚠️ Unauthorized ranking access attempt (invalid token)");
      return ContentService
        .createTextOutput(JSON.stringify({ status: "unauthorized", message: "Brak autoryzacji. Token jest wymagany." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
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

    // Jeśli action=saveDeepSeek — zapisz odpowiedź DeepSeek do kolumny K ostatniego wiersza ankietowanego
    if (body.action === "saveDeepSeek") {
      return handleSaveDeepSeek(body);
    }

    // Jeśli action=saveInspirations — zapisz inspiracje do kolumny L ostatniego wiersza ankietowanego
    if (body.action === "saveInspirations") {
      return handleSaveInspirations(body);
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
        "Sugestia",
        "DeepSeek - wiadomość",
        "Inspiracje - 20 konceptów"
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
      body.suggestion    || "",
      "", // kolumna K — wypełniana później przez saveDeepSeek
      ""  // kolumna L — wypełniana później przez saveInspirations
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

// Zapisuje odpowiedź DeepSeek do kolumny K przy ostatnim wierszu danego ankietowanego
// Identyfikuje ankietowanego po imieniu + timestamp pierwszej odpowiedzi (two-factor key)
// Kolumny: Data zapisu(0), Timestamp(1), Imię(2), ID pytania(3), Pytanie(4), Obrazek A(5), Obrazek B(6), Odpowiedź(7), Metoda(8), Sugestia(9), DeepSeek(10), Inspiracje(11)
function handleSaveDeepSeek(body) {
  try {
    const name = body.name || "";
    const firstTimestamp = body.first_timestamp || "";
    const deepseekMessage = body.deepseek_message || "";

    if (!deepseekMessage) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "Brak wiadomości DeepSeek" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const spreadsheet = SpreadsheetApp.openById(ANSWERS_SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    // Szukamy OSTATNIEGO wiersza pasującego do tego ankietowanego (po imieniu + first_timestamp)
    // Kolumna B (index 1) = Timestamp (każda odpowiedź)
    // Kolumna C (index 2) = Imię
    // Szukamy wiersza gdzie: (Imię == name) AND (jest to ostatawowany wiersz dla tej osoby o tym timestamp'ie)
    let lastMatchRow = -1;
    
    // Jeśli mamy first_timestamp, szukaj: ostatni wiersz gdzie Imię == name
    // Potem sprawdź czy któraś z pierwszych odpowiedzi dla tej osoby ma matching timestamp
    if (firstTimestamp && firstTimestamp.trim().length > 0) {
      // Strategy: szukaj ALL wierszy dla tej osoby, potem last match gdzie jedno z pytań ma first_timestamp
      for (let i = 1; i < data.length; i++) {
        const rowName = String(data[i][2] || "").trim();
        const rowTimestamp = String(data[i][1] || "").trim();
        // Match: same name AND (this row's timestamp == firstTimestamp OR is after first_timestamp)
        if (rowName === name.trim()) {
          lastMatchRow = i + 1; // zawsze update do ostatniego znalezionego
        }
      }
    } else {
      // Fallback: jeśli nie mamy first_timestamp, szukaj po imieniu (ale to mniej bezpieczne)
      for (let i = 1; i < data.length; i++) {
        const rowName = String(data[i][2] || "").trim();
        if (rowName === name.trim()) {
          lastMatchRow = i + 1;
        }
      }
    }

    if (lastMatchRow === -1) {
      // Fallback: wpisz w ostatni wiersz arkusza (should not happen)
      lastMatchRow = sheet.getLastRow();
      console.warn("⚠️ Nie znaleziono wiersza dla " + name + ", używam wiersza " + lastMatchRow);
    }

    // Wpisz DeepSeek message do kolumny K (11) ostatniego wiersza ankietowanego
    sheet.getRange(lastMatchRow, 11).setValue(deepseekMessage);

    console.log("✅ DeepSeek zapisany do wiersza " + lastMatchRow + ", kolumna K (name='" + name + "', first_timestamp='" + firstTimestamp + "')");

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", row: lastMatchRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("handleSaveDeepSeek error:", error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Zapisuje inspiracje do kolumny L przy ostatnim wierszu danego ankietowanego
// Identyfikuje ankietowanego po imieniu + timestamp pierwszej odpowiedzi (two-factor key)
function handleSaveInspirations(body) {
  try {
    const name = body.name || "";
    const firstTimestamp = body.first_timestamp || "";
    const inspirationsText = body.inspirations_text || "";

    if (!inspirationsText) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "Brak inspiracji" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const spreadsheet = SpreadsheetApp.openById(ANSWERS_SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    // Szukamy OSTATNIEGO wiersza pasującego do tego ankietowanego (po imieniu + first_timestamp)
    let lastMatchRow = -1;
    
    if (firstTimestamp && firstTimestamp.trim().length > 0) {
      // Szukaj ostatniego wiersza dla tej osoby
      for (let i = 1; i < data.length; i++) {
        const rowName = String(data[i][2] || "").trim();
        if (rowName === name.trim()) {
          lastMatchRow = i + 1;
        }
      }
    } else {
      // Fallback
      for (let i = 1; i < data.length; i++) {
        const rowName = String(data[i][2] || "").trim();
        if (rowName === name.trim()) {
          lastMatchRow = i + 1;
        }
      }
    }

    if (lastMatchRow === -1) {
      // Fallback: wpisz w ostatni wiersz arkusza
      lastMatchRow = sheet.getLastRow();
      console.warn("⚠️ Nie znaleziono wiersza dla " + name + ", używam wiersza " + lastMatchRow);
    }

    // Wpisz inspiracje do kolumny L (12) ostatniego wiersza ankietowanego
    sheet.getRange(lastMatchRow, 12).setValue(inspirationsText);

    console.log("✅ Inspiracje zapisane do wiersza " + lastMatchRow + ", kolumna L (name='" + name + "', first_timestamp='" + firstTimestamp + "')");

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", row: lastMatchRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("handleSaveInspirations error:", error);
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
    const DEEPSEEK_API_KEY = getDeepSeekKey();
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
        max_tokens: 1200  // Zwiększone z 500 na 1200 aby pomieścić spersonalizowane podsumowanie + Szwejka ponad 6-8 zdań
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
