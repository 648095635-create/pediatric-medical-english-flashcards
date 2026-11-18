(() => {
  "use strict";

  const DATA = window.CARD_DATA || { terms: [], translations: [] };
  const STORAGE_KEY = "zhongda-med-english-cards-v1";
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const defaultStore = {
    theme: "light",
    ratings: {},
    favorites: {},
    streak: 0,
    lastStudyDate: null,
    todayDate: todayKey(),
    todayCount: 0
  };

  let store = loadStore();
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

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const merged = { ...defaultStore, ...parsed };
      if (merged.todayDate !== todayKey()) {
        merged.todayDate = todayKey();
        merged.todayCount = 0;
      }
      return merged;
    } catch {
      return { ...defaultStore };
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function allUnits() {
    const words = DATA.terms.map((item, index) => ({
      ...item,
      id: `term-${index + 1}`,
      unitKey: `word:term-${index + 1}`,
      mode: "word"
    }));
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
    return { words, definitions, translations, all: [...words, ...definitions, ...translations] };
  }

  function isDue(unit) {
    const rating = store.ratings[unit.unitKey];
    return rating && (rating.status !== "good" || !rating.nextDue || rating.nextDue <= Date.now());
  }

  function buildDeck(mode, specificUnit = null) {
    const units = allUnits();
    if (specificUnit) return [specificUnit];
    if (mode === "word") return shuffle(units.words).slice(0, 20);
    if (mode === "definition") return shuffle(units.definitions).slice(0, 20);
    if (mode === "translation") return shuffle(units.translations).slice(0, 20);
    if (mode === "review") {
      const review = units.all.filter(isDue);
      return shuffle(review).slice(0, 30);
    }
    return shuffle(units.all).slice(0, 20);
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
    return ({ word: "单词卡", definition: "英文名词解释", translation: "医学英语翻译", review: "错题复习", mixed: "随机混合" })[mode] || "医学英语闪卡";
  }

  function currentUnit() { return session[sessionIndex]; }

  function renderCard() {
    const unit = currentUnit();
    if (!unit) return showSummary();
    flipped = false;
    $("#flashcard").classList.remove("flipped");
    $("#ratingRow").classList.remove("ready");
    $("#revealPrompt").textContent = "先回忆，再点击卡片翻面";
    $("#studyModeLabel").textContent = sessionMode === "review" ? `错题复习 · ${modeLabel(unit.mode)}` : modeLabel(sessionMode);
    $("#currentIndex").textContent = sessionIndex + 1;
    $("#totalCards").textContent = session.length;
    $("#progressBar").style.width = `${(sessionIndex / session.length) * 100}%`;
    $("#favoriteCardButton").textContent = store.favorites[unit.id] ? "★" : "☆";
    $("#favoriteCardButton").setAttribute("aria-pressed", store.favorites[unit.id] ? "true" : "false");

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

  function flipCard(force) {
    flipped = typeof force === "boolean" ? force : !flipped;
    $("#flashcard").classList.toggle("flipped", flipped);
    $("#ratingRow").classList.toggle("ready", flipped);
    $("#revealPrompt").textContent = flipped ? "现在按真实熟悉度选择" : "先回忆，再点击卡片翻面";
  }

  function rateCard(status) {
    if (!flipped) return;
    const unit = currentUnit();
    const previous = store.ratings[unit.unitKey] || { count: 0 };
    const count = (previous.count || 0) + 1;
    const intervals = status === "good" ? [3, 7, 15, 30] : status === "hard" ? [1] : [0];
    const intervalDays = intervals[Math.min(count - 1, intervals.length - 1)];
    const nextDue = Date.now() + (status === "again" ? 10 * 60 * 1000 : intervalDays * 86400000);
    store.ratings[unit.unitKey] = { status, count, nextDue, updatedAt: Date.now() };
    store.todayCount += 1;
    updateStreak();
    sessionResults[status] += 1;

    if (status === "again" && !unit.requeued) {
      session.push({ ...unit, requeued: true });
      toast("已放回本轮后面，再见一次");
    }
    saveStore();
    sessionIndex += 1;
    renderCard();
  }

  function updateStreak() {
    const today = todayKey();
    if (store.lastStudyDate === today) return;
    if (store.lastStudyDate && daysBetween(store.lastStudyDate, today) === 1) store.streak += 1;
    else store.streak = 1;
    store.lastStudyDate = today;
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
    if (store.favorites[unit.id]) delete store.favorites[unit.id];
    else store.favorites[unit.id] = true;
    saveStore();
    renderCard();
    toast(store.favorites[unit.id] ? "已收藏" : "已取消收藏");
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
    $("#streakValue").textContent = store.streak || 0;
    $("#todayValue").textContent = store.todayCount || 0;
    $("#masteredValue").textContent = mastered;
    $("#reviewValue").textContent = review;
    $("#reviewDeckCount").textContent = review;
    renderLibrary();
  }

  function renderCategoryChips() {
    const categories = ["全部", ...new Set(DATA.terms.map((x) => x.category))];
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
      const matchesCategory = categoryFilter === "全部" || unit.category === categoryFilter;
      const matchesFavorite = !showFavoritesOnly || store.favorites[unit.id];
      const haystack = `${unit.term} ${unit.chinese} ${unit.definition} ${unit.category}`.toLowerCase();
      return matchesCategory && matchesFavorite && (!query || haystack.includes(query));
    });
    $("#libraryList").innerHTML = units.length ? units.map((unit) => `
      <article class="library-item">
        <button data-open-unit="${unit.unitKey}">
          <strong>${escapeHtml(unit.term)}</strong>
          <small>${escapeHtml(unit.chinese)} · ${escapeHtml(unit.category)}</small>
        </button>
        <button class="favorite-mini" data-favorite-unit="${unit.id}" aria-label="收藏 ${escapeHtml(unit.term)}">${store.favorites[unit.id] ? "★" : "☆"}</button>
      </article>`).join("") : `<div class="empty-state">没有找到匹配的卡片</div>`;

    $$("[data-open-unit]").forEach((button) => button.addEventListener("click", () => {
      const unit = allUnits().words.find((x) => x.unitKey === button.dataset.openUnit);
      startSession("word", unit);
    }));
    $$("[data-favorite-unit]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.favoriteUnit;
      if (store.favorites[id]) delete store.favorites[id]; else store.favorites[id] = true;
      saveStore();
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
    store.theme = store.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = store.theme;
    saveStore();
  }

  function bindEvents() {
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
    document.documentElement.dataset.theme = store.theme;
    renderCategoryChips();
    bindEvents();
    renderDashboard();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  init();
})();
