/* =============================================
   KONFIGURACJA
============================================= */

// ID arkusza Google Sheets, z którego pobierane są pytania
// To jest arkusz publiczny z pytaniami: Pytania_id
const QUESTIONS_SHEET_ID = "1kfrkA8WesltaWUVwgmh5NzeIMFX88GEMAOJ8SuodK-s";

// ID arkusza Google Sheets, do którego będą zapisywane odpowiedzi
// To jest arkusz publiczny z odpowiedziami: Odpowiedzi
const ANSWERS_SHEET_ID = "1THZ_Bk8SHWeIz8hBr6a9mV5gGPIBqEcZk_KKDYnEmaQ";

const SHEET_ID = QUESTIONS_SHEET_ID;
const GID = "0"; // ID arkusza (zakładki)

// URL wdrożonego Google Apps Script (Web App), który zapisuje odpowiedzi
// Ten adres jest generowany po wdrożeniu Apps Script do zapisującego arkusza odpowiedzi.
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxlrqtndJzBuT02e486owj26kh-Ktzdq2XnyMRVG1ujLUMLmvRJQ2VabOWJ8O1Wpck7/exec";

// Klucz API do DeepSeek
const DEEPSEEK_API_KEY = "TUTAJ_WKLEJ_KLUCZ_DEEPSEEK";
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"; // Zakładam standardowy endpoint

/* =============================================
   STAN APLIKACJI
============================================= */
let questions = [];
let currentIndex = 0;
let userName = "";
let userGender = ""; // nieobowiązkowe
let isAnonymous = false;
let startTime = null;
let language = "pl"; // wykrywane automatycznie
let cursorType = "none"; // none, dragon, snake, textcircle, fairy, clock, string
const storedAnswers = [];
let pendingAnswer = null; // { answer, method, suggestion }
let activeCursorEffect = null;
let cursorPosition = { x: 0, y: 0 };
let cursorAnimationFrame = null;
let cursorEffects = {};

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
const genderSelect = document.getElementById("gender-select");
const anonymousBtn = document.getElementById("anonymous-btn");
const startBtn = document.getElementById("start-btn");
const backBtn = document.getElementById("back-btn");
const cursorToolbar = document.getElementById("cursorBar");
const cursorCanvas = document.getElementById("dragonCanvas");

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
const saveProgressBtn = document.getElementById("save-progress-btn");
const resultsContainer = document.getElementById("results-container");

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
anonymousBtn.addEventListener("click", () => {
  isAnonymous = true;
  userName = "Anonimowy";
  userGender = genderSelect.value || "";
  language = navigator.language.startsWith('pl') ? 'pl' : 'en';
  setCursor(cursorType);
  startSurvey();
});

cursorToolbar?.querySelectorAll(".cbar-btn").forEach(button => {
  button.addEventListener("click", () => {
    const type = button.dataset.cursor;
    setCursor(type);
  });
});

setCursor('none');

function setCursor(type) {
  cursorType = type || "none";
  cursorToolbar?.querySelectorAll(".cbar-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.cursor === cursorType);
  });

  if (!cursorCanvas) {
    document.body.style.cursor = cursorType === 'none' ? 'auto' : 'none';
    return;
  }

  if (cursorType === 'none') {
    stopCursorEffect();
    document.body.style.cursor = 'auto';
    cursorCanvas.style.display = 'none';
    return;
  }

  document.body.style.cursor = 'none';
  cursorCanvas.style.display = 'block';
  startCursorEffect(cursorType);
}

async function handleStart() {
  const val = nameInput.value.trim();
  if (!isAnonymous && val.length < 2) {
    nameError.textContent = "Podaj imię lub pseudonim (min. 2 znaki).";
    nameInput.focus();
    return;
  }
  nameError.textContent = "";
  userName = isAnonymous ? "Anonimowy" : val;
  userGender = genderSelect.value || "";
  language = navigator.language.startsWith('pl') ? 'pl' : 'en';
  setCursor(cursorType);
  startSurvey();
}

async function startSurvey() {
  startTime = Date.now();
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
   CURSOR EFFECTS - Definicje funkcji
============================================= */
function createCursorDragonEffect() {
  return {
    draw(ctx, pos) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.font = '32px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐉', 0, 0);
      ctx.restore();
    }
  };
}

function createCursorSnakeEffect() {
  const trail = [];
  return {
    draw(ctx, pos) {
      trail.unshift({ x: pos.x, y: pos.y });
      if (trail.length > 12) trail.pop();
      ctx.save();
      trail.forEach((point, index) => {
        const size = 12 - index * 0.6;
        ctx.fillStyle = `rgba(38, 167, 72, ${1 - index / trail.length})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  };
}

function createCursorTextEffect() {
  return {
    draw(ctx, pos) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.font = '30px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💬', 0, 0);
      ctx.restore();
    }
  };
}

function createCursorFairyEffect() {
  const particles = [];
  return {
    draw(ctx, pos) {
      particles.push({ x: pos.x, y: pos.y, r: 8, life: 20 });
      if (particles.length > 35) particles.shift();
      ctx.save();
      particles.forEach((p, index) => {
        ctx.fillStyle = `rgba(255, 215, 0, ${p.life / 20})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (p.life / 20), 0, Math.PI * 2);
        ctx.fill();
        p.life -= 1;
      });
      ctx.restore();
    }
  };
}

function createCursorClockEffect() {
  return {
    draw(ctx, pos) {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.fillStyle = '#1a1611';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🕐', 0, 0);
      ctx.restore();
    }
  };
}

function createCursorStringEffect() {
  const trail = [];
  return {
    draw(ctx, pos) {
      trail.unshift({ x: pos.x, y: pos.y });
      if (trail.length > 18) trail.pop();
      ctx.save();
      ctx.strokeStyle = 'rgba(26, 22, 17, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      trail.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    }
  };
}

function resizeCursorCanvas() {
  if (!cursorCanvas) return;
  cursorCanvas.width = window.innerWidth;
  cursorCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCursorCanvas);
resizeCursorCanvas();

function startCursorEffect(type) {
  if (!cursorCanvas) return;
  stopCursorEffect();
  activeCursorEffect = cursorEffects[type] || null;
  if (!activeCursorEffect) return;
  cursorCanvas.style.display = 'block';

  if (typeof activeCursorEffect.init === 'function') {
    activeCursorEffect.init();
    return;
  }

  document.body.addEventListener('mousemove', onCursorMove);
  document.body.addEventListener('mouseleave', onCursorLeave);

  function frame() {
    const ctx = cursorCanvas.getContext('2d');
    ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    if (activeCursorEffect && typeof activeCursorEffect.draw === 'function') {
      activeCursorEffect.draw(ctx, cursorPosition);
    }
    cursorAnimationFrame = requestAnimationFrame(frame);
  }
  frame();
}

function stopCursorEffect() {
  if (!cursorCanvas) return;
  if (activeCursorEffect?.destroy) {
    activeCursorEffect.destroy();
  }
  if (activeCursorEffect && typeof activeCursorEffect.draw === 'function') {
    document.body.removeEventListener('mousemove', onCursorMove);
    document.body.removeEventListener('mouseleave', onCursorLeave);
    if (cursorAnimationFrame) {
      cancelAnimationFrame(cursorAnimationFrame);
      cursorAnimationFrame = null;
    }
  }
  const ctx = cursorCanvas.getContext('2d');
  ctx && ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
}

function onCursorMove(event) {
  cursorPosition = { x: event.clientX, y: event.clientY };
}

function onCursorLeave() {
  cursorPosition = { x: -100, y: -100 };
}

function createExternalCursorEffect(module) {
  if (!module || typeof module.init !== 'function' || typeof module.destroy !== 'function') return null;
  return {
    init: () => module.init(),
    destroy: () => module.destroy()
  };
}

// Teraz definiujemy cursorEffects po wszystkich funkcjach create*
cursorEffects = {
  dragon: createExternalCursorEffect(window.EfektElasticDragon) || createCursorDragonEffect(),
  snake: createExternalCursorEffect(window.EfektSnakeFollower) || createCursorSnakeEffect(),
  textcircle: createExternalCursorEffect(window.EfektTextCircle) || createCursorTextEffect(),
  fairy: createExternalCursorEffect(window.EfektFairyDust) || createCursorFairyEffect(),
  clock: createExternalCursorEffect(window.EfektClockFollower) || createCursorClockEffect(),
  string: createExternalCursorEffect(window.EfektElasticString) || createCursorStringEffect(),
};

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

backBtn.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent triggering screen click
  showScreen(1);
});

document.getElementById("back-btn-3").addEventListener("click", () => {
  showScreen(2);
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
  const timeSpent = startTime ? (Date.now() - startTime) / 1000 : 0; // sekundy
  const averageRating = calculateAverageRating();

  const payload = {
    timestamp: new Date().toISOString(),
    name: userName,
    gender: userGender,
    is_anonymous: isAnonymous,
    language: language,
    cursor_type: cursorType,
    time_spent_seconds: timeSpent,
    average_rating: averageRating,
    question_id: q.id,
    question_text: q.pytanie,
    image_a: q.obrazek_a,
    image_b: q.obrazek_b,
    answer: pendingAnswer.answer,
    answer_method: pendingAnswer.method,
    suggestion: pendingAnswer.suggestion || "",
    deepseek_thank_you: "" // Placeholder for generated message
  };

  // Jeśli WEBHOOK_URL nie jest skonfigurowany, przejdź dalej bez zapisu
  if (!WEBHOOK_URL || WEBHOOK_URL === "TUTAJ_WKLEJ_URL_Z_APPS_SCRIPT") {
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
    errorMsg.textContent = "Nie udało się zapisać postępu. Sprawdź połączenie i spróbuj ponownie.";
    errorMsg.classList.remove("hidden");
    retryBtn.classList.remove("hidden");
  }
}

function calculateAverageRating() {
  if (storedAnswers.length === 0) return 0;
  const ratings = storedAnswers.map(a => {
    if (a.answer === 'podoba mi się') return 3;
    if (a.answer === 'nie podoba mi się') return 2;
    if (a.answer === 'zdecydowanie mi się nie podoba') return 1;
    return 0;
  });
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

retryBtn.addEventListener("click", () => {
  retryBtn.classList.add("hidden");
  errorMsg.classList.add("hidden");
  submitAnswer();
});

downloadBtn?.addEventListener("click", () => {
  downloadTxtFile();
});

saveProgressBtn?.addEventListener("click", () => {
  saveProgress();
});

function saveProgress() {
  if (storedAnswers.length === 0) {
    alert("Nie ma jeszcze zapisanych odpowiedzi do zapisania. Odpowiedz na przynajmniej jedno pytanie.");
    return;
  }

  // Pokaż ekran ładowania z komunikatem o zapisie wyników
  showScreen(4);
  document.querySelector('.loading-text').textContent = 'Zapisuję wyniki...';

  // Symuluj krótkie opóźnienie dla UX
  setTimeout(() => {
    downloadTxtFile(`ankieta-${userName.replace(/\s+/g, '_').replace(/[^\w_-]+/g, '') || 'wyniki'}.txt`);
    generateThankYouMessage().then(() => {
      showResultsTable();
      showScreen(5);
    });
  }, 1000);
}

function goNext() {
  currentIndex++;
  if (currentIndex < questions.length) {
    showQuestion(currentIndex);
    showScreen(2);
  } else {
    generateThankYouMessage().then(() => {
      showResultsTable();
      showScreen(5);
    });
  }
}

async function generateThankYouMessage() {
  const suggestions = storedAnswers.map(a => a.suggestion).filter(s => s.trim()).join(' ');
  if (!suggestions.trim()) {
    // Brak komentarzy, proste podziękowanie
    return;
  }

  const prompt = `Ktoś napisał mi komentarze do moich rysunków: "${suggestions}". Na podstawie tych odpowiedzi podziękuj serdecznie za wypowiedzi, pochwal styl, nazwij jej lub jego styl humorystyczny, mów po imieniu (${userName}). Pozdrów w imieniu Pawła i podziękuj za ankietę.`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat', // Zakładam model
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200
      })
    });

    if (response.ok) {
      const data = await response.json();
      const thankYouMessage = data.choices[0].message.content;
      // Zapisz do payload lub wyświetl
      console.log('Generated thank you:', thankYouMessage);
      // Można dodać do wyników lub wyświetlić osobno
    } else {
      console.warn('DeepSeek API failed, using simple message');
    }
  } catch (err) {
    console.error('Error with DeepSeek:', err);
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

function normalizeAnswerLabel(answer) {
  if (answer === 'podoba mi się') return 'Podoba się';
  if (answer === 'nie podoba mi się') return 'Nie podoba się';
  if (answer === 'zdecydowanie mi się nie podoba') return 'Zdecydowanie nie';
  return answer || 'Brak odpowiedzi';
}

function showResultsTable() {
  if (!resultsContainer) return;

  if (storedAnswers.length === 0) {
    resultsContainer.innerHTML = '<p class="results-empty">Brak danych do wyświetlenia.</p>';
    return;
  }

  const grouped = new Map();

  storedAnswers.forEach(item => {
    const key = item.image_b || item.question_id || item.question_text;
    if (!grouped.has(key)) {
      grouped.set(key, {
        image_b: item.image_b,
        question_text: item.question_text,
        total: 0,
        yes: 0,
        no: 0,
        strongNo: 0
      });
    }
    const row = grouped.get(key);
    row.total += 1;
    if (item.answer === 'podoba mi się') {
      row.yes += 1;
    } else if (item.answer === 'nie podoba mi się') {
      row.no += 1;
    } else if (item.answer === 'zdecydowanie mi się nie podoba') {
      row.strongNo += 1;
    }
  });

  const results = Array.from(grouped.values()).map(row => {
    const positiveRate = row.total ? (row.yes / row.total) * 100 : 0;
    const answerLabel = row.yes >= row.no + row.strongNo
      ? 'Podoba się'
      : row.no >= row.strongNo
        ? 'Nie podoba się'
        : 'Zdecydowanie nie';

    return {
      ...row,
      positiveRate,
      answerLabel,
      subtitle: `${normalizeAnswerLabel(row.yes >= row.no + row.strongNo ? 'podoba mi się' : row.no >= row.strongNo ? 'nie podoba mi się' : 'zdecydowanie mi się nie podoba')}`
    };
  });

  results.sort((a, b) => b.positiveRate - a.positiveRate);

  const rowsHtml = results.map((item, index) => {
    const nextRate = index + 1 < results.length ? results[index + 1].positiveRate : 0;
    const advantage = index === 0 && results.length > 1
      ? `${Math.max(0, (item.positiveRate - nextRate)).toFixed(0)} pkt przewagi`
      : '';

    return `
      <div class="result-row${index === 0 ? ' result-top' : ''}">
        <div class="result-rank">${index + 1}</div>
        <div class="result-thumb">
          <img src="images/${item.image_b}.jpg" alt="Miniatura" onerror="this.onerror=null;this.src='images/${item.image_b}.png'" />
        </div>
        <div class="result-info">
          <div class="result-title">${item.question_text || item.image_b}</div>
          <div class="result-answer">${item.answerLabel}</div>
          <div class="result-stats">Tak: ${item.positiveRate.toFixed(0)}% ${advantage ? `· ${advantage}` : ''}</div>
          <div class="result-count">Liczba głosów: ${item.total}</div>
        </div>
      </div>
    `;
  }).join('');

  resultsContainer.innerHTML = `
    <div class="results-header">
      <div>Ranking odpowiedzi</div>
      <div>Procent „tak”</div>
    </div>
    <div class="results-list">${rowsHtml}</div>
  `;
}

function downloadTxtFile(filename) {
  const text = buildDownloadText();
  const name = filename || `ankieta-${userName.replace(/\s+/g, '_').replace(/[^\w_-]+/g, '') || 'wynik'}.txt`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
