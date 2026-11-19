(() => {
  "use strict";

  const DATA = window.CARD_DATA || { terms: [], translations: [] };
  const GENERAL_TERMS = window.GENERAL_MEDICAL_TERMS || [];
  const Progress = window.FlashProgress;
  const LEGACY_KEY = "zhongda-med-english-cards-v1";
  const GUEST_KEY = "zhongda-med-english-guest-v2";
  const DEVICE_KEY = "zhongda-med-english-device";
  const THEME_KEY = "zhongda-med-english-theme";
  const dayKey = (date = new Date()) => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-");
  const DEFAULT_WORD_GOAL = 20;
  const MAX_WORD_GOAL = 60;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const legacy = readJSON(LEGACY_KEY);
  const device = localStorage.getItem(DEVICE_KEY) || crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, device);
  let guest = loadGuest();
  let store = guest;
  let cloud = null;
  let accountId = null;
  let session = [];
  let sessionIndex = 0;
  let sessionMode = "word";
  let sessionResults = { good: 0, hard: 0, again: 0 };
  let flipped = false;
  let showFavoritesOnly = false;
  let categoryFilter = "全部";
  let touchStartX = 0;

  const screens = {
    dashboard: $("#dashboardScreen"),
    study: $("#studyScreen"),
    summary: $("#summaryScreen")
  };

  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function loadGuest() {
    const cached = readJSON(GUEST_KEY);
    if (cached?.version === 1) return Progress.normalize(cached);
    return Progress.fromLegacy(legacy, `${device}-guest`);
  }

  function changeProgress(change) {
    const synced = cloud?.edit(change);
    if (synced) {
      store = synced;
      return;
    }
    // Read current guest data first in case a second tab has made changes.
    guest = Progress.merge(guest, loadGuest());
    change(guest);
    store = guest;
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  }

  function applyAccount(snapshot, id) {
    const accountChanged = (id || null) !== accountId;
    accountId = id || null;
    store = snapshot || guest;
    if (accountChanged && !screens.dashboard.classList.contains("active")) goHome();
    else if (screens.dashboard.classList.contains("active")) renderDashboard();
    else if (screens.study.classList.contains("active")) renderCardFavorite();
  }

  function normalizeWordGoal(value, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(MAX_WORD_GOAL, Math.max(1, Math.trunc(value)));
  }

  function wordGoal() { return store.goal?.value ?? DEFAULT_WORD_GOAL; }

  function isFavorite(id) { return store.favorites[id]?.value === true; }

  function changeFavorite(id) {
    return changeProgress((snapshot) => {
      snapshot.favorites[id] = { value: !snapshot.favorites[id]?.value, at: Date.now() };
    });
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function allUnits() {
    const pediatric = DATA.terms.map((item, index) => ({
      ...item,
      id: `term-${index + 1}`,
      unitKey: `word:term-${index + 1}`,
      mode: "word"
    }));
    const general = GENERAL_TERMS.map((item, index) => ({
      ...item,
      id: `general-${index + 1}`,
      unitKey: `word:general-${index + 1}`,
      mode: "word",
      general: true
    }));
    const words = [...pediatric, ...general];
    const definitions = DATA.terms.map((item, index) => ({
      ...item,
      id: `term-${index + 1}`,
      unitKey: `definition:term-${index + 1}`,
      mode: "definition"
    }));
    const translations = DATA.translations.map((item, index) => ({
      ...item,
      id: `translation-${index + 1}`,
      unitKey: `translation:translation-${index + 1}`,
      category: item.direction,
      mode: "translation"
    }));
    return { words, general, definitions, translations, all: [...words, ...definitions, ...translations] };
  }

  function isDue(unit) {
    const rating = store.ratings[unit.unitKey];
    return rating && (rating.status !== "good" || !rating.nextDue || rating.nextDue <= Date.now());
  }

  function dailyWordPlan(words) {
    const today = dayKey();
    const remaining = words.filter((unit) => {
      const updatedAt = store.ratings[unit.unitKey]?.updatedAt;
      return !updatedAt || dayKey(new Date(updatedAt)) !== today;
    });
    const completed = words.length - remaining.length;
    const goal = wordGoal();
    if (completed >= goal) return { completed, pool: words, roundSize: Math.min(goal, words.length) };
    return { completed, pool: remaining, roundSize: Math.min(goal - completed, remaining.length) };
  }

  function prioritizedWords(pool) {
    const needsPractice = (unit) => !store.ratings[unit.unitKey] || isDue(unit);
    const groups = [[], [], [], []];
    for (const unit of pool) {
      const index = (unit.general ? 1 : 0) + (needsPractice(unit) ? 0 : 2);
      groups[index].push(unit);
    }
    return groups.flatMap(shuffle);
  }

  function buildDeck(mode, specificUnit = null) {
    const units = allUnits();
    if (specificUnit) return [specificUnit];
    if (mode === "word") {
      const { pool, roundSize } = dailyWordPlan(units.words);
      return prioritizedWords(pool).slice(0, roundSize);
    }
    if (mode === "general") {
      const { pool, roundSize } = dailyWordPlan(units.words);
      const eligible = pool.filter((unit) => unit.general);
      return eligible.length ? prioritizedWords(eligible).slice(0, roundSize) :
        prioritizedWords(units.general).slice(0, wordGoal());
    }
    if (mode === "definition") return shuffle(units.definitions).slice(0, 20);
    if (mode === "translation") return shuffle(units.translations).slice(0, 20);
    if (mode === "review") {
      const review = units.all.filter(isDue);
      return shuffle(review).slice(0, 30);
    }
    return shuffle(units.all.filter((unit) => !unit.general)).slice(0, 20);
  }

  function setScreen(name) {
    Object.entries(screens).forEach(([key, node]) => node.classList.toggle("active", key === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startSession(mode, specificUnit = null) {
    const deck = buildDeck(mode, specificUnit);
    if (!deck.length) {
      toast("暂时没有待复习卡片，先练一组新卡吧");
      return;
    }
    session = deck;
    sessionIndex = 0;
    sessionMode = mode;
    sessionResults = { good: 0, hard: 0, again: 0 };
    setScreen("study");
    renderCard();
  }

  function modeLabel(mode) {
    return ({ word: "单词卡", general: "通用医学单词", definition: "英文名词解释", translation: "医学英语翻译", review: "错题复习", mixed: "随机混合" })[mode] || "医学英语闪卡";
  }

  function currentUnit() { return session[sessionIndex]; }

  function renderCard() {
    const unit = currentUnit();
    if (!unit) return showSummary();
    flipCard(false);
    $("#flashcard").dataset.mode = unit.mode;
    $("#studyModeLabel").textContent = sessionMode === "review" ? `错题复习 · ${modeLabel(unit.mode)}` : modeLabel(sessionMode);
    $("#currentIndex").textContent = sessionIndex + 1;
    $("#totalCards").textContent = session.length;
    $("#progressBar").style.width = `${(sessionIndex / session.length) * 100}%`;
    renderCardFavorite();

    const view = cardView(unit);
    $("#cardCategory").textContent = view.category;
    $("#frontKicker").textContent = view.kicker;
    $("#frontText").textContent = view.front;
    $("#frontHint").textContent = view.hint;
    $("#backLabel").textContent = view.backLabel;
    $("#backTitle").textContent = view.backTitle;
    $("#backText").textContent = view.backText;
    $("#keywordBox").hidden = !view.keywords;
    $("#keywordText").textContent = view.keywords || "";
    $("#speakButton").hidden = !view.speak;
  }

  function renderCardFavorite() {
    const unit = currentUnit();
    if (!unit) return;
    $("#favoriteCardButton").textContent = isFavorite(unit.id) ? "★" : "☆";
    $("#favoriteCardButton").setAttribute("aria-pressed", String(isFavorite(unit.id)));
  }

  function cardView(unit) {
    if (unit.mode === "translation") {
      const isEnglishPrompt = unit.direction.includes("英译中");
      return {
        category: `${unit.direction} · ${unit.topic}`,
        kicker: "TRANSLATE",
        front: unit.prompt,
        hint: isEnglishPrompt ? "先断句，再翻译" : "先写主干，再补医学术语",
        backLabel: "参考译文",
        backTitle: unit.topic,
        backText: unit.answer,
        keywords: unit.keys,
        speak: isEnglishPrompt ? unit.prompt : unit.answer
      };
    }
    if (unit.mode === "definition") {
      return {
        category: unit.category,
        kicker: "DEFINE IN ENGLISH",
        front: unit.term,
        hint: `中文提示：${unit.chinese}`,
        backLabel: "英文名词解释",
        backTitle: unit.chinese,
        backText: unit.definition,
        keywords: "先说 what it is，再说核心特征或机制。",
        speak: `${unit.term}. ${unit.definition}`
      };
    }
    return {
      category: unit.category,
      kicker: "MEDICAL TERM",
      front: unit.term,
      hint: "先回忆中文含义和英文定义",
      backLabel: "中文释义 · 英文定义",
      backTitle: unit.chinese,
      backText: unit.definition,
      keywords: "",
      speak: `${unit.term}. ${unit.definition}`
    };
  }

  function flipCard(showAnswer = !flipped) {
    flipped = showAnswer;
    $(".card-front").hidden = flipped;
    $("#cardAnswer").hidden = !flipped;
    $("#flashcard").setAttribute("aria-expanded", String(flipped));
    $("#ratingRow").classList.toggle("ready", flipped);
    $("#revealPrompt").textContent = flipped ? "现在按真实熟悉度选择" : "先回忆，再点击卡片翻面";
  }

  function rateCard(status) {
    if (!flipped) return;
    const unit = currentUnit();
    changeProgress((snapshot) => {
      const count = (snapshot.ratings[unit.unitKey]?.count || 0) + 1;
      const intervals = status === "good" ? [3, 7, 15, 30] : status === "hard" ? [1] : [0];
      const intervalDays = intervals[Math.min(count - 1, intervals.length - 1)];
      const updatedAt = Date.now();
      const nextDue = updatedAt + (status === "again" ? 10 * 60 * 1000 : intervalDays * 86400000);
      snapshot.ratings[unit.unitKey] = { status, count, nextDue, updatedAt };
      Progress.recordDay(snapshot, `${device}-${accountId ? "cloud" : "guest"}`, dayKey(new Date(updatedAt)));
    });
    sessionResults[status] += 1;

    if (status === "again" && !unit.requeued) {
      session.push({ ...unit, requeued: true });
      toast("已放回本轮后面，再见一次");
    }
    sessionIndex += 1;
    renderCard();
  }

  function showSummary() {
    $("#progressBar").style.width = "100%";
    $("#summaryTotal").textContent = sessionResults.good + sessionResults.hard + sessionResults.again;
    $("#summaryGood").textContent = sessionResults.good;
    $("#summaryHard").textContent = sessionResults.hard + sessionResults.again;
    $("#reviewAgainButton").hidden = sessionResults.hard + sessionResults.again === 0;
    setScreen("summary");
  }

  function toggleFavorite() {
    const unit = currentUnit();
    if (!unit) return;
    changeFavorite(unit.id);
    renderCardFavorite();
    toast(isFavorite(unit.id) ? "已收藏" : "已取消收藏");
  }

  function speakCurrent(event) {
    event.stopPropagation();
    const unit = currentUnit();
    if (!unit || !window.speechSynthesis) return toast("当前浏览器不支持朗读");
    const text = cardView(unit).speak;
    if (!text) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = .88;
    speechSynthesis.speak(utterance);
  }

  function renderDashboard() {
    const units = allUnits().all;
    const mastered = Object.values(store.ratings).filter((x) => x.status === "good").length;
    const review = units.filter(isDue).length;
    $("#streakValue").textContent = Progress.streak(store);
    $("#todayValue").textContent = Progress.todayCount(store, dayKey());
    $("#masteredValue").textContent = mastered;
    $("#reviewValue").textContent = review;
    $("#reviewDeckCount").textContent = review;
    const input = $("#dailyWordGoal");
    if (document.activeElement !== input) input.value = wordGoal();
    renderWordGoal();
    renderLibrary();
  }

  function renderWordGoal() {
    const goal = wordGoal();
    const { words, general } = allUnits();
    const { completed, roundSize } = dailyWordPlan(words);
    $("#dailyWordProgress").textContent = `今天已背 ${completed} / ${goal} 个${completed >= goal ? " · 已达标" : ""}`;
    $("#wordDeckDetail").textContent = `儿科优先 · 本轮 ${roundSize} 张`;
    $("#wordDeckCount").textContent = words.length;
    $("#generalDeckCount").textContent = general.length;
  }

  function renderCategoryChips() {
    const categories = ["全部", "儿科", "通用医学", ...new Set(allUnits().words.map((unit) => unit.category))];
    $("#categoryChips").innerHTML = categories.map((category) =>
      `<button class="chip${category === categoryFilter ? " active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    ).join("");
    $$("#categoryChips .chip").forEach((button) => button.addEventListener("click", () => {
      categoryFilter = button.dataset.category;
      renderCategoryChips();
      renderLibrary();
    }));
  }

  function renderLibrary() {
    const query = $("#searchInput").value.trim().toLowerCase();
    const units = allUnits().words.filter((unit) => {
      const matchesCategory = categoryFilter === "全部" || unit.category === categoryFilter ||
        (categoryFilter === "儿科" && !unit.general) || (categoryFilter === "通用医学" && unit.general);
      const matchesFavorite = !showFavoritesOnly || isFavorite(unit.id);
      const haystack = `${unit.term} ${unit.chinese} ${unit.definition} ${unit.category}`.toLowerCase();
      return matchesCategory && matchesFavorite && (!query || haystack.includes(query));
    });
    $("#libraryList").innerHTML = units.length ? units.map((unit) => `
      <article class="library-item">
        <button data-open-unit="${unit.unitKey}">
          <strong>${escapeHtml(unit.term)}</strong>
          <small>${escapeHtml(unit.chinese)} · ${escapeHtml(unit.category)}</small>
        </button>
        <button class="favorite-mini" data-favorite-unit="${unit.id}" aria-label="收藏 ${escapeHtml(unit.term)}" aria-pressed="${isFavorite(unit.id)}">${isFavorite(unit.id) ? "★" : "☆"}</button>
      </article>`).join("") : `<div class="empty-state">没有找到匹配的卡片</div>`;

    $$("[data-open-unit]").forEach((button) => button.addEventListener("click", () => {
      const unit = allUnits().words.find((x) => x.unitKey === button.dataset.openUnit);
      startSession("word", unit);
    }));
    $$("[data-favorite-unit]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.favoriteUnit;
      changeFavorite(id);
      renderLibrary();
    }));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 1800);
  }

  function goHome() {
    window.speechSynthesis?.cancel?.();
    setScreen("dashboard");
    renderDashboard();
  }

  function toggleTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }

  function bindEvents() {
    const wordGoalInput = $("#dailyWordGoal");
    function setWordGoal(goal) {
      if (goal === wordGoal()) return;
      changeProgress((snapshot) => { snapshot.goal = { value: goal, at: Date.now() }; });
      renderWordGoal();
    }
    wordGoalInput.addEventListener("input", () => {
      const goal = wordGoalInput.valueAsNumber;
      if (Number.isInteger(goal) && goal >= 1 && goal <= MAX_WORD_GOAL) setWordGoal(goal);
    });
    wordGoalInput.addEventListener("change", () => {
      setWordGoal(normalizeWordGoal(wordGoalInput.valueAsNumber, wordGoal()));
      wordGoalInput.value = wordGoal();
    });
    $$(".deck-option").forEach((button) => button.addEventListener("click", () => startSession(button.dataset.mode)));
    $("#shuffleAllButton").addEventListener("click", () => startSession("mixed"));
    $("#flashcard").addEventListener("click", (event) => {
      if (!event.target.closest("button")) flipCard();
    });
    $("#flashcard").addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
    $("#flashcard").addEventListener("touchend", (event) => {
      const delta = event.changedTouches[0].clientX - touchStartX;
      if (!flipped || Math.abs(delta) < 70) return;
      rateCard(delta > 0 ? "good" : "again");
    }, { passive: true });
    $("#speakButton").addEventListener("click", speakCurrent);
    $("#favoriteCardButton").addEventListener("click", toggleFavorite);
    $$("#ratingRow button").forEach((button) => button.addEventListener("click", () => rateCard(button.dataset.rating)));
    $("#backButton").addEventListener("click", goHome);
    $("#homeButton").addEventListener("click", goHome);
    $("#themeButton").addEventListener("click", toggleTheme);
    $("#finishButton").addEventListener("click", goHome);
    $("#reviewAgainButton").addEventListener("click", () => startSession("review"));
    $("#searchInput").addEventListener("input", renderLibrary);
    $("#favoritesButton").addEventListener("click", () => {
      showFavoritesOnly = !showFavoritesOnly;
      $("#favoritesButton").textContent = showFavoritesOnly ? "查看全部" : "只看收藏";
      renderLibrary();
    });
    document.addEventListener("keydown", (event) => {
      if (!screens.study.classList.contains("active")) return;
      if (event.code === "Space") { event.preventDefault(); flipCard(); }
      if (flipped && event.key === "1") rateCard("again");
      if (flipped && event.key === "2") rateCard("hard");
      if (flipped && event.key === "3") rateCard("good");
    });
  }

  function init() {
    document.documentElement.dataset.theme = (localStorage.getItem(THEME_KEY) || legacy?.theme) === "dark" ? "dark" : "light";
    renderCategoryChips();
    bindEvents();
    renderDashboard();
    cloud = window.FlashCloud.start({ getGuest: () => Progress.merge(guest, loadGuest()), apply: applyAccount });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  init();
})();
