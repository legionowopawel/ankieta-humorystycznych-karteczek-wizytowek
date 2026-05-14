/* =============================================
   KONFIGURACJA
============================================= */

// ID arkusza Google Sheets (wyodrębniony z URL)
const SHEET_ID = "1THZ_Bk8SHWeIz8hBr6a9mV5gGPIBqEcZk_KKDYnEmaQ";
const GID = "0"; // ID arkusza (zakładki)

// ⚠️  Wklej tutaj URL z Google Apps Script po wdrożeniu
const WEBHOOK_URL = "TUTAJ_WKLEJ_URL_Z_APPS_SCRIPT";

/* =============================================
   STAN APLIKACJI
============================================= */
let questions = [];
let currentIndex = 0;
let userName = "";
let pendingAnswer = null; // { answer, method, suggestion }
let storedAnswers = [];

/* =============================================
   ELEMENTY DOM
============================================= */
const screens = {
  1: document.getElementById("screen-1"),
  2: document.getElementById("screen-2"),
  3: document.getElementById("screen-3"),
  4: document.getElementById("screen-4"),
  5: document.getElementById("screen-5"),
};

const nameInput = document.getElementById("name-input");
const nameError = document.getElementById("name-error");
const startBtn = document.getElementById("start-btn");

const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const progressFill3 = document.getElementById("progress-fill-3");
const progressLabel3 = document.getElementById("progress-label-3");

const questionTextA = document.getElementById("question-text-a");
const imageWrapA = document.getElementById("image-wrap-a");
const imageA = document.getElementById("image-a");

const imageWrapB = document.getElementById("image-wrap-b");
const imageB = document.getElementById("image-b");
const answerText = document.getElementById("answer-text");

const suggestionInput = document.getElementById("suggestion-input");
const charCount = document.getElementById("char-count");

const retryBtn = document.getElementById("retry-btn");
const errorMsg = document.getElementById("error-msg");
const downloadBtn = document.getElementById("download-btn");

/* =============================================
   NAWIGACJA MIĘDZY EKRANAMI
============================================= */
function showScreen(n) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[n].classList.add("active");
  window.scrollTo(0, 0);
}

/* =============================================
   EKRAN 1 — START
============================================= */
startBtn.addEventListener("click", handleStart);
nameInput.addEventListener("keydown", e => { if (e.key === "Enter") handleStart(); });

async function handleStart() {
  const val = nameInput.value.trim();
  if (val.length < 2) {
    nameError.textContent = "Podaj imię lub pseudonim (min. 2 znaki).";
    nameInput.focus();
    return;
  }
  nameError.textContent = "";
  userName = val;
  startBtn.disabled = true;
  startBtn.textContent = "Ładuję pytania...";

  try {
    questions = await fetchQuestions();
    if (questions.length === 0) {
      nameError.textContent = "Brak pytań w arkuszu. Sprawdź dane źródłowe.";
      startBtn.disabled = false;
      startBtn.textContent = "Zacznij →";
      return;
    }
    currentIndex = 0;
    showQuestion(currentIndex);
    showScreen(2);
  } catch (err) {
    nameError.textContent = "Nie udało się pobrać pytań. Sprawdź połączenie i spróbuj ponownie.";
    startBtn.disabled = false;
    startBtn.textContent = "Zacznij →";
    console.error(err);
  }
}

/* =============================================
   POBIERANIE DANYCH — Google Visualization Query API
   (omija problemy z CORS, nie wymaga backendu)
============================================= */
function fetchQuestions() {
  return new Promise((resolve, reject) => {
    // Unikalny callback name, żeby uniknąć kolizji
    const callbackName = "gvizCallback_" + Date.now();

    // Budujemy URL do Google Visualization Query API
    // tq=select * — pobiera wszystkie wiersze
    const url =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
      `?tqx=out:json;responseHandler:${callbackName}` +
      `&gid=${GID}` +
      `&tq=select%20*`;

    // Timeout — jeśli skrypt nie odpowie w 10s, odrzucamy
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout pobierania danych"));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      const el = document.getElementById("gviz-script");
      if (el) el.remove();
    }

    // Definiujemy globalny callback przed wstrzyknięciem skryptu
    window[callbackName] = function (response) {
      cleanup();
      try {
        const parsed = parseGvizResponse(response);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };

    // Wstrzykujemy tag <script> z JSONP
    const script = document.createElement("script");
    script.id = "gviz-script";
    script.src = url;
    script.onerror = () => {
      cleanup();
      reject(new Error("Nie udało się załadować danych z arkusza"));
    };
    document.head.appendChild(script);
  });
}

/* =============================================
   PARSOWANIE ODPOWIEDZI GVIZ
============================================= */
function parseGvizResponse(response) {
  // response.table.rows — tablica wierszy
  // response.table.cols  — tablica kolumn (nagłówki)
  const table = response.table;
  if (!table || !table.rows) return [];

  // Mapowanie kolumn po etykiecie (na wypadek zmiany kolejności)
  const cols = table.cols.map(c => (c.label || "").toLowerCase().trim());

  function colIdx(name) {
    const idx = cols.indexOf(name);
    return idx;
  }

  // Indeksy kolumn (pasujące do arkusza)
  // Kolumny: id | rodzaj humoru | pytanie | nazwa pliku pytania | odpowiedź | nazwa pliku odpowiedzi | forma
  const iId = colIdx("id");
  const iRodzaj = colIdx("rodzaj humoru");
  const iPytanie = colIdx("pytanie");
  const iObrazA = colIdx("nazwa pliku pytania");
  const iOdp = colIdx("odpowiedź");
  const iObrazB = colIdx("nazwa pliku odpowiedzi");

  const result = [];

  for (const row of table.rows) {
    const cells = row.c || [];

    function val(idx) {
      if (idx < 0 || idx >= cells.length) return "";
      const cell = cells[idx];
      if (!cell || cell.v === null || cell.v === undefined) return "";
      return String(cell.v).trim();
    }

    const id = val(iId);
    if (!id || id === "0") continue; // pomijamy wiersze bez id

    result.push({
      id,
      rodzaj: val(iRodzaj),
      pytanie: val(iPytanie),
      obrazek_a: val(iObrazA),
      odpowiedz: val(iOdp),
      obrazek_b: val(iObrazB),
    });
  }

  return result;
}

/* =============================================
   WYŚWIETLANIE PYTANIA
============================================= */
function showQuestion(index) {
  const q = questions[index];
  const total = questions.length;
  const pct = ((index + 1) / total) * 100;

  // Pasek postępu (oba ekrany)
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Pytanie ${index + 1} z ${total}`;
  progressFill3.style.width = pct + "%";
  progressLabel3.textContent = `Pytanie ${index + 1} z ${total}`;

  // Ekran 2
  questionTextA.textContent = q.pytanie;
  loadImage(imageA, q.obrazek_a);

  // Ekran 3
  loadImage(imageB, q.obrazek_b);
  answerText.textContent = q.odpowiedz ? `„${q.odpowiedz}"` : "";

  // Reset textarea i licznika
  suggestionInput.value = "";
  charCount.textContent = "0";

  // Reset animacji
  imageWrapB.style.transition = "";
  imageWrapB.style.transform = "";
  imageWrapB.style.opacity = "";
  imageWrapB.classList.remove("swipe-out-left", "swipe-out-right");

  // Reset swipe hints
  document.getElementById("swipe-right-hint").style.opacity = "0";
  document.getElementById("swipe-left-hint").style.opacity = "0";
}

// Próbuje jpg, jpeg, png, webp
function loadImage(imgEl, name) {
  if (!name) { imgEl.src = ""; return; }
  const exts = ["jpg", "jpeg", "png", "webp"];
  let tried = 0;

  function tryNext() {
    if (tried >= exts.length) {
      imgEl.src = "";
      imgEl.alt = "Brak obrazka";
      return;
    }
    imgEl.src = `images/${name}.${exts[tried]}`;
    tried++;
  }

  imgEl.onerror = tryNext;
  tryNext();
}

/* =============================================
   EKRAN 2 — kliknięcie → Ekran 3
============================================= */
screens[2].addEventListener("click", () => {
  showScreen(3);
});

/* =============================================
   EKRAN 3 — przyciski
============================================= */
document.querySelectorAll(".btn-rate").forEach(btn => {
  btn.addEventListener("click", () => {
    const answer = btn.dataset.answer;
    const method = btn.dataset.method;
    const suggestion = suggestionInput.value.trim();
    triggerSave(answer, method, suggestion);
  });
});

/* =============================================
   LICZNIK ZNAKÓW
============================================= */
suggestionInput.addEventListener("input", () => {
  charCount.textContent = suggestionInput.value.length;
});

/* =============================================
   OBSŁUGA SWIPE
============================================= */
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

imageWrapB.addEventListener("touchstart", e => {
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
  isSwiping = false;
}, { passive: true });

imageWrapB.addEventListener("touchmove", e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < Math.abs(dy)) return; // przewijanie pionowe

  isSwiping = true;
  const ratio = Math.min(Math.abs(dx) / 120, 1);

  imageWrapB.style.transition = "none";
  imageWrapB.style.transform = `translateX(${dx * 0.6}px) rotate(${dx * 0.04}deg)`;
  imageWrapB.style.opacity = 1 - ratio * 0.3;

  const rhint = document.getElementById("swipe-right-hint");
  const lhint = document.getElementById("swipe-left-hint");
  if (dx > 0) {
    rhint.style.opacity = ratio.toString();
    lhint.style.opacity = "0";
  } else {
    lhint.style.opacity = ratio.toString();
    rhint.style.opacity = "0";
  }
}, { passive: true });

imageWrapB.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (!isSwiping || Math.abs(dx) < 50) {
    imageWrapB.style.transition = "";
    imageWrapB.style.transform = "";
    imageWrapB.style.opacity = "";
    document.getElementById("swipe-right-hint").style.opacity = "0";
    document.getElementById("swipe-left-hint").style.opacity = "0";
    return;
  }

  if (dx > 50) {
    animateSwipeOut("right", () => {
      triggerSave("podoba mi się", "swipe_right", suggestionInput.value.trim());
    });
  } else if (dx < -50) {
    animateSwipeOut("left", () => {
      triggerSave("zdecydowanie mi się nie podoba", "swipe_left", suggestionInput.value.trim());
    });
  }
}, { passive: true });

function animateSwipeOut(direction, callback) {
  imageWrapB.style.transition = "transform 0.3s ease, opacity 0.3s ease";
  if (direction === "right") {
    imageWrapB.classList.add("swipe-out-right");
  } else {
    imageWrapB.classList.add("swipe-out-left");
  }
  setTimeout(callback, 300);
}

/* =============================================
   ZAPIS ODPOWIEDZI
============================================= */
function triggerSave(answer, method, suggestion) {
  pendingAnswer = { answer, method, suggestion };
  showScreen(4);
  retryBtn.classList.add("hidden");
  errorMsg.classList.add("hidden");
  submitAnswer();
}

async function submitAnswer() {
  const q = questions[currentIndex];
  const payload = {
    timestamp: new Date().toISOString(),
    name: userName,
    question_id: q.id,
    question_text: q.pytanie,
    image_a: q.obrazek_a,
    image_b: q.obrazek_b,
    answer: pendingAnswer.answer,
    answer_method: pendingAnswer.method,
    suggestion: pendingAnswer.suggestion || ""
  };

  // Jeśli WEBHOOK_URL nie jest skonfigurowany, przejdź dalej bez zapisu
  if (WEBHOOK_URL === "TUTAJ_WKLEJ_URL_Z_APPS_SCRIPT") {
    console.warn("WEBHOOK_URL nie jest skonfigurowany. Pomijam zapis do arkusza, ale plik TXT będzie gotowy.");
    appendAnswerHistory(payload);
    goNext();
    return;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.status !== "ok") throw new Error("Serwer zwrócił błąd");
    appendAnswerHistory(payload);
    goNext();
  } catch (err) {
    console.error("Błąd zapisu:", err);
    errorMsg.textContent = "Nie udało się zapisać odpowiedzi. Sprawdź połączenie i spróbuj ponownie.";
    errorMsg.classList.remove("hidden");
    retryBtn.classList.remove("hidden");
  }
}

retryBtn.addEventListener("click", () => {
  retryBtn.classList.add("hidden");
  errorMsg.classList.add("hidden");
  submitAnswer();
});

downloadBtn?.addEventListener("click", () => {
  downloadTxtFile();
});

function goNext() {
  currentIndex++;
  if (currentIndex < questions.length) {
    showQuestion(currentIndex);
    showScreen(2);
  } else {
    showScreen(5);
  }
}

function appendAnswerHistory(payload) {
  storedAnswers.push(payload);
}

function buildDownloadText() {
  if (storedAnswers.length === 0) {
    return `Brak zapisanych odpowiedzi.`;
  }

  const header = `Arkusz ankiety - ${new Date().toLocaleString('pl-PL')}\n`;
  const rows = storedAnswers.map((item, index) => {
    return [
      `Odpowiedź ${index + 1}`,
      `Data: ${item.timestamp}`,
      `Imię: ${item.name}`,
      `ID pytania: ${item.question_id}`,
      `Pytanie: ${item.question_text}`,
      `Obrazek A: ${item.image_a}`,
      `Obrazek B: ${item.image_b}`,
      `Wybrana odpowiedź: ${item.answer}`,
      `Metoda: ${item.answer_method}`,
      `Sugestia: ${item.suggestion || 'brak'}`,
      '---'
    ].join('\n');
  }).join('\n');

  return `${header}\n${rows}\n`;
}

function downloadTxtFile() {
  const text = buildDownloadText();
  const filename = `ankieta-${userName.replace(/\s+/g, '_').replace(/[^\w_-]+/g, '') || 'wynik'}.txt`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
