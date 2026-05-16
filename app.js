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

// URL wdrożonego Google Apps Script (Web App), który zapisuje odpowiedzi i obsługuje DeepSeek
// Adres generowany przy wdrożeniu Apps Script do zapisującego arkusza odpowiedzi.
// 
// ⚠️ WAŻNE DLA DEVELOPERÓW:
// - DEEPSEEK_API_KEY jest przechowywany w GAS (zmienne przechowywane zarezerwowane)
// - Klucz API NIGDY nie pojawia się w kodzie JavaScript (bezpieczeństwo!)
// - Frontend wysyła prompt do GAS z action='deepseek'
// - GAS pobiera klucz z właściwych zmiennych i wysyła request do DeepSeek
// - Odpowiedź wraca do frontend'u jako JSON
// Dzięki tому: klucz jest bezpieczny, frontend nie ma dostępu do API, łatwo zmienić klucz bez redeploy frontend'u
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwCQLZVlzTXdDywi0qCFAxXse2O6dM3BIcB2jTHTCSY46SCJXVcbtcZi4Ski4EKuktE/exec";

console.log('🔧 App initialized:');
console.log('  WEBHOOK_URL:', WEBHOOK_URL);
console.log('  QUESTIONS_SHEET_ID:', QUESTIONS_SHEET_ID);
console.log('  ℹ️ DeepSeek API Key jest zarządzany bezpiecznie po stronie GAS (Google Apps Script)');

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
let currentLightboxMedia = null; // Przechowuje nazwę aktualnego mediów w lightbox

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
const backBtnTop = document.getElementById("back-btn-top");
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
startBtn?.addEventListener("click", handleStart);
nameInput?.addEventListener("keydown", e => { if (e.key === "Enter") handleStart(); });
anonymousBtn?.addEventListener("click", () => {
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
  const val = nameInput?.value?.trim() || "";
  if (!isAnonymous && val.length < 2) {
    if (nameError) nameError.textContent = "Podaj imię lub pseudonim (min. 2 znaki).";
    nameInput?.focus();
    return;
  }
  if (nameError) nameError.textContent = "";
  userName = isAnonymous ? "Anonimowy" : val;
  userGender = genderSelect?.value || "";
  language = navigator.language.startsWith('pl') ? 'pl' : 'en';
  setCursor(cursorType);
  startSurvey();
}

async function startSurvey() {
  startTime = Date.now();
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "Ładuję pytania...";
  }

  try {
    questions = await fetchQuestions();
    if (questions.length === 0) {
      if (nameError) nameError.textContent = "Brak pytań w arkuszu. Sprawdź dane źródłowe.";
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "Zacznij →";
      }
      return;
    }
    currentIndex = 0;
    showQuestion(currentIndex);
    showScreen(2);
  } catch (err) {
    if (nameError) nameError.textContent = "Nie udało się pobrać pytań. Sprawdź połączenie i spróbuj ponownie.";
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Zacznij →";
    }
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
  const table = response.table;
  if (!table || !table.rows) return [];

  const result = [];
  let skipped = 0;

  for (const row of table.rows) {
    const cells = row.c || [];

    function val(idx) {
      if (idx < 0 || idx >= cells.length) return "";
      const cell = cells[idx];
      if (!cell || cell.v === null || cell.v === undefined) return "";
      return String(cell.v).trim();
    }

    // Sztywne indeksy: id(0), rodzaj humoru(1), pytanie(2), nazwa pliku pytania(3), odpowiedź(4), nazwa pliku odpowiedzi(5)
    const id = val(0);
    const pytanie = val(2);

    console.log(`Row: id="${id}", pytanie="${pytanie.substring(0, 30)}..."`);

    if (!id || id === "id" || id === "0" || isNaN(id)) {
      skipped++;
      console.warn(`❌ Pominięto wiersz: id="${id}" (nieprawidłowe lub nagłówek)`);
      continue;
    }

    const question = {
      id,
      rodzaj: val(1),
      pytanie: val(2),
      obrazek_a: val(3),
      odpowiedz: val(4),
      obrazek_b: val(5),
    };

    console.log(`✅ Załadowano pytanie #${id}:`, question);
    result.push(question);
  }

  console.log(`\n📊 PODSUMOWANIE: Załadowano ${result.length} pytań, pominięto ${skipped} wierszy`);
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

  // Czyszczenie poprzednich video
  [imageWrapA, imageWrapB].forEach(wrap => {
    if (wrap) {
      const videos = wrap.querySelectorAll('video');
      videos.forEach(v => v.remove());
    }
  });

  // Ekran 2
  questionTextA.textContent = q.pytanie;
  imageA.style.display = '';
  loadImage(imageA, q.obrazek_a);

  // Ekran 3
  imageB.style.display = '';
  loadImage(imageB, q.obrazek_b);
  answerText.textContent = q.odpowiedz ? `„${q.odpowiedz}"` : "";

  // Reset textarea i licznika
  if (suggestionInput) suggestionInput.value = "";
  if (charCount) charCount.textContent = "0";

  // Reset animacji
  if (imageWrapB) {
    imageWrapB.style.transition = "";
    imageWrapB.style.transform = "";
    imageWrapB.style.opacity = "";
    imageWrapB.classList.remove("swipe-out-left", "swipe-out-right");
  }

  // Reset swipe hints
  const rhHint = document.getElementById("swipe-right-hint");
  const lhHint = document.getElementById("swipe-left-hint");
  if (rhHint) rhHint.style.opacity = "0";
  if (lhHint) lhHint.style.opacity = "0";
}

// Próbuje mp4, png, jpg, jpeg, webp — z cache-bustingiem żeby zawsze ładować świeże pliki
function loadImage(imgEl, name) {
  if (!name) { imgEl.src = ""; return; }

  const bust = "?v=" + (window._imageCacheBust || (window._imageCacheBust = Date.now()));
  const imageWrap = imgEl.closest('.image-wrap');

  // Najpierw spróbuj MP4
  const videoPath = `images/${name}.mp4${bust}`;

  // Sprawdź czy video można załadować
  fetch(videoPath, { method: 'HEAD' })
    .then(res => {
      if (res.ok) {
        // Zastąp img videoem
        if (imageWrap) {
          const video = document.createElement('video');
          video.src = videoPath;
          video.controls = true;
          video.autoplay = true;
          video.style.width = '100%';
          video.style.height = 'auto';
          video.style.maxHeight = '300px';
          video.style.borderRadius = '12px';

          imgEl.style.display = 'none';
          imgEl.parentNode.insertBefore(video, imgEl.nextSibling);
        }
      } else {
        throw new Error('MP4 not found, try image formats');
      }
    })
    .catch(() => {
      // Fallback na jpg/png
      const exts = ["png", "jpg", "jpeg", "webp"];
      let tried = 0;

      function tryNext() {
        if (tried >= exts.length) {
          imgEl.src = "";
          imgEl.alt = "Brak obrazka";
          return;
        }
        imgEl.src = `images/${name}.${exts[tried]}${bust}`;
        tried++;
      }

      imgEl.onerror = tryNext;
      tryNext();
    });
}

/* =============================================
   EKRAN 2 — kliknięcie → Ekran 3
============================================= */
screens[2].addEventListener("click", () => {
  showScreen(3);
});

backBtn?.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent triggering screen click
  showScreen(1);
});

backBtnTop?.addEventListener("click", () => {
  if (currentIndex > 0 && currentIndex < questions.length) {
    currentIndex--;
    showQuestion(currentIndex);
    showScreen(2);
  } else if (currentIndex === questions.length) {
    // Jeśli jesteśmy na ekranie dziękczyn, wróć do poprzedniego pytania
    currentIndex--;
    showQuestion(currentIndex);
    showScreen(2);
  } else {
    showScreen(1);
  }
});

document.getElementById("back-btn-3")?.addEventListener("click", () => {
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
suggestionInput?.addEventListener("input", () => {
  charCount.textContent = suggestionInput.value.length;
});

/* =============================================
   OBSŁUGA SWIPE
============================================= */
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

imageWrapB?.addEventListener("touchstart", e => {
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
  isSwiping = false;
}, { passive: true });

imageWrapB?.addEventListener("touchmove", e => {
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

imageWrapB?.addEventListener("touchend", e => {
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
  // Snapshot pytania PRZED goNext() — po goNext() currentIndex już się zmieni
  const q = questions[currentIndex];
  if (!q) {
    console.warn("triggerSave: brak pytania dla currentIndex", currentIndex);
    goNext();
    return;
  }

  const timeSpent = startTime ? (Date.now() - startTime) / 1000 : 0;
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
    answer: answer,
    answer_method: method,
    suggestion: suggestion || "",
    deepseek_thank_you: ""
  };

  // Zapisz lokalnie i przejdź dalej natychmiast — nie czekaj na serwer
  appendAnswerHistory(payload);
  goNext();

  // Wyślij do Google Sheets w tle (fire and forget)
  sendToSheetInBackground(payload);
}

function sendToSheetInBackground(payload) {
  if (!WEBHOOK_URL || WEBHOOK_URL === "TUTAJ_WKLEJ_URL_Z_APPS_SCRIPT") {
    console.warn("WEBHOOK_URL nie jest skonfigurowany. Pomijam zapis do arkusza.");
    return;
  }

  const json = JSON.stringify(payload);

  // Używamy fetch z no-cors — GAS nie zwraca CORS headerów, ale dane i tak docierają
  // no-cors = nie możemy odczytać odpowiedzi, ale request jest wysyłany
  fetch(WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: json
  })
    .then(() => console.log("✅ Wysłano do GAS (no-cors):", payload.question_id))
    .catch(err => console.warn("⚠️ Błąd wysyłania do GAS:", err));

  // sendBeacon jako backup przy zamknięciu karty
  window.addEventListener("beforeunload", () => {
    const blob = new Blob([json], { type: "text/plain" });
    navigator.sendBeacon?.(WEBHOOK_URL, blob);
  }, { once: true });
}

// Zachowane dla przycisku "Spróbuj ponownie" — teraz nieużywane, ale zostawione dla bezpieczeństwa
async function submitAnswer() {
  sendToSheetInBackground(storedAnswers[storedAnswers.length - 1]);
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

retryBtn?.addEventListener("click", () => {
  retryBtn?.classList.add("hidden");
  errorMsg?.classList.add("hidden");
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
      showGlobalRanking().then(() => {
        showScreen(5);
      });
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
      showGlobalRanking().then(() => {
        showScreen(5);
      });
    });
  }
}

async function generateThankYouMessage() {
  if (storedAnswers.length === 0) return;

  // Sprawdź czy jakikolwiek suggestion zawiera tekst
  const hasSuggestions = storedAnswers.some(a => a.suggestion && a.suggestion.trim().length > 0);

  if (!hasSuggestions) {
    // Brak sugestii - automatyczna, lakoniczna wiadomość
    const autoMessage = "Serdecznie dziękuję Ci za poświęcony czas i wnikliwe oceny – świetnie wyczuwasz niuanse humoru, od docenienia trafnego żartu po subtelną rezerwę. Paweł prosił, by przekazać Ci, że Twoje spojrzenie wiele dla niego znaczy i inspiruje go do dalszej pracy z dystansem i uśmiechem.";
    const thankYouEl = document.querySelector('.thanks-body');
    if (thankYouEl) {
      thankYouEl.innerHTML = `<em style="font-size:0.95rem; line-height:1.6;">${autoMessage}</em><br><br>Dzięki Tobie świat jest lepszy o 2,5%&nbsp;🌍`;
    }
    return;
  }

  // Jest co najmniej jeden suggestion - wywołaj DeepSeek
  const surveyContext = storedAnswers.map((a, idx) => {
    const rating = a.answer === 'podoba mi się' ? '👍 Podoba' :
      a.answer === 'nie podoba mi się' ? '👎 Neutral' : '❌ Nie podoba';
    return `Q${idx + 1}: "${a.question_text}" → ${rating}${a.suggestion ? ` (komentarz: ${a.suggestion})` : ''}`;
  }).join('\n');

  const prompt = `Użytkownik (${userName}) właśnie wypełnił ankietę oceniającą moje rysunki humorystyczne. Oto jego odpowiedzi:\n\n${surveyContext}\n\nNa podstawie tych ocen i komentarzy: podziękuj mu serdecznie, pochwal jego wgląd w humor, scharakteryzuj jego styl oceniania, i daj mu ciepłą, osobistą wiadomość od Pawła. Bądź krótki (2-3 zdania), ale szczere i ze smakiem.`;

  try {
    // Wywołaj DeepSeek przez Google Apps Script — klucz API jest bezpieczny po stronie serwera
    // ℹ️ Frontend nie ma dostępu do DEEPSEEK_API_KEY - zawsze jest przechowywany w GAS
    // Uwaga: GAS wymaga wdrożenia z "Kto ma dostęp: Każdy" żeby CORS działał
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'deepseek', prompt }),
      redirect: 'follow'
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 'ok' && data.message) {
        console.log('✅ DeepSeek response:\n' + data.message);
        const thankYouEl = document.querySelector('.thanks-body');
        if (thankYouEl) {
          thankYouEl.innerHTML = `<em style="font-size:0.95rem; line-height:1.6;">${data.message}</em><br><br>Dzięki Tobie świat jest lepszy o 2,5%&nbsp;🌍`;
        }
      } else if (data.status === 'error') {
        console.warn('⚠️ GAS zwrócił błąd:', data.message);
        // Nie wyświetlaj błędu użytkownikowi — zostaje domyślny tekst
      }
    } else {
      console.warn('⚠️ DeepSeek via GAS error:', response.status);
    }
  } catch (err) {
    // DeepSeek jest opcjonalny — błąd nie blokuje wyświetlenia wyników
    console.warn('⚠️ Nie udało się wygenerować wiadomości DeepSeek (sprawdź wdrożenie GAS):', err.message);
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

// Pobierz globalny ranking z Google Sheets i wyświetl
async function showGlobalRanking() {
  if (!resultsContainer) return;
  resultsContainer.innerHTML = '<p class="results-empty">Ładuję globalny ranking...</p>';

  let allAnswers = [];

  try {
    const res = await fetch(WEBHOOK_URL + '?action=ranking', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.answers)) {
        allAnswers = data.answers;
        console.log('✅ Pobrano', allAnswers.length, 'głosów z arkusza');
      }
    }
  } catch (err) {
    console.warn('⚠️ Nie udało się pobrać globalnych wyników, pokazuję lokalne:', err.message);
  }

  // Fallback: jeśli GAS nie odpowiedział — użyj lokalnych danych
  if (allAnswers.length === 0) {
    console.warn('Brak danych z serwera, używam lokalnych odpowiedzi');
    allAnswers = storedAnswers;
  }

  renderRanking(allAnswers);
}

function renderRanking(answers) {
  const grouped = new Map();

  answers.forEach(item => {
    const key = item.image_b || item.question_id || item.question_text;
    if (!key) return;
    if (!grouped.has(key)) {
      grouped.set(key, {
        image_b: item.image_b,
        question_text: item.question_text,
        total: 0, yes: 0, no: 0, strongNo: 0
      });
    }
    const row = grouped.get(key);
    row.total += 1;
    const ans = (item.answer || item.odpowiedz || '').toLowerCase();
    if (ans === 'podoba mi się') row.yes += 1;
    else if (ans === 'nie podoba mi się') row.no += 1;
    else if (ans === 'zdecydowanie mi się nie podoba') row.strongNo += 1;
  });

  const results = Array.from(grouped.values()).map(row => {
    const positiveRate = row.total ? (row.yes / row.total) * 100 : 0;
    const answerLabel = row.yes >= row.no + row.strongNo ? 'Podoba się'
      : row.no >= row.strongNo ? 'Nie podoba się' : 'Zdecydowanie nie';
    return { ...row, positiveRate, answerLabel };
  });

  results.sort((a, b) => b.positiveRate - a.positiveRate);

  if (results.length === 0) {
    resultsContainer.innerHTML = '<p class="results-empty">Brak danych do wyświetlenia.</p>';
    return;
  }

  const bust = window._imageCacheBust || Date.now();
  const rowsHtml = results.map((item, index) => {
    const nextRate = index + 1 < results.length ? results[index + 1].positiveRate : 0;
    const advantage = index === 0 && results.length > 1
      ? ` · ${Math.max(0, item.positiveRate - nextRate).toFixed(0)} pkt przewagi` : '';
    return `
      <div class="result-row${index === 0 ? ' result-top' : ''}"
           onclick="openLightbox('${item.image_b}')" style="cursor:pointer" title="Kliknij aby zobaczyć obrazek">
        <div class="result-rank">${index + 1}</div>
        <div class="result-thumb">
          <img src="images/${item.image_b}.png?v=${bust}" alt="Miniatura"
               onerror="this.onerror=null;this.src='images/${item.image_b}.jpg?v=${bust}'" />
        </div>
        <div class="result-info">
          <div class="result-title">${item.question_text || item.image_b}</div>
          <div class="result-answer">${item.answerLabel}</div>
          <div class="result-stats">👍 ${item.positiveRate.toFixed(0)}%${advantage}</div>
          <div class="result-count">Głosów: ${item.total}</div>
        </div>
        <div class="result-zoom">🔍</div>
      </div>`;
  }).join('');

  resultsContainer.innerHTML = `
    <div class="results-header">
      <div>🌍 Ranking globalny</div>
      <div>% „tak"</div>
    </div>
    <div class="results-list">${rowsHtml}</div>
  `;
}

// Lightbox — pełnoekranowy podgląd obrazka/video
function openLightbox(imageName) {
  if (!imageName) return;
  currentLightboxMedia = imageName; // Zapisz aktualny media do ściągnięcia
  const bust = window._imageCacheBust || Date.now();
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox-img');

  // Najpierw spróbuj MP4
  const videoPath = `images/${imageName}.mp4?v=${bust}`;

  fetch(videoPath, { method: 'HEAD' })
    .then(res => {
      if (res.ok) {
        // Wyświetl video
        lbImg.style.display = 'none';
        let video = lb.querySelector('video');
        if (!video) {
          video = document.createElement('video');
          video.controls = true;
          video.autoplay = true;
          video.style.maxWidth = '90vw';
          video.style.maxHeight = '85vh';
          video.style.borderRadius = '12px';
          video.style.boxShadow = '0 8px 40px rgba(0,0,0,0.6)';
          video.style.objectFit = 'contain';
          lb.querySelector('.lightbox-inner').appendChild(video);
        }
        video.src = videoPath;
        video.style.display = 'block';
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        throw new Error('MP4 not found');
      }
    })
    .catch(() => {
      // Fallback na PNG/JPG
      lbImg.style.display = 'block';
      const video = lb.querySelector('video');
      if (video) video.style.display = 'none';
      lbImg.src = `images/${imageName}.png?v=${bust}`;
      lbImg.onerror = () => { lbImg.src = `images/${imageName}.jpg?v=${bust}`; lbImg.onerror = null; };
      lb.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.body.style.overflow = '';
}

function downloadLightboxMedia() {
  if (!currentLightboxMedia) return;

  const bust = window._imageCacheBust || Date.now();
  const imageName = currentLightboxMedia;

  // Najpierw spróbuj ściągnąć MP4
  const videoPath = `images/${imageName}.mp4?v=${bust}`;
  const imgPath = `images/${imageName}.png?v=${bust}`;

  fetch(videoPath, { method: 'HEAD' })
    .then(res => {
      if (res.ok) {
        // Ściągnij video
        downloadFile(videoPath, `${imageName}.mp4`);
      } else {
        throw new Error('Video not found');
      }
    })
    .catch(() => {
      // Spróbuj PNG
      const link = document.createElement('a');
      link.href = imgPath;
      link.download = `${imageName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
}

function downloadFile(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Zachowane dla kompatybilności
function showResultsTable() {
  renderRanking(storedAnswers);
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
