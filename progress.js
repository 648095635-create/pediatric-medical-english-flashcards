(() => {
  "use strict";

  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
  const ratingKey = /^(?:word:(?:term|general)|definition:term|translation:translation)-[1-9]\d{0,3}$/;
  const favoriteKey = /^(?:term|general|translation)-[1-9]\d{0,3}$/;
  const deviceKey = /^[a-z0-9-]{1,80}$/;
  const statuses = new Set(["again", "hard", "good"]);
  const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value < 8640000000000000;
  const count = (value) => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;
  const validDay = (value) => typeof value === "string" && dayPattern.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const validGoal = (value) => Number.isInteger(value) && value >= 1 && value <= 60;
  const validNickname = (value) => typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= 24;

  function empty() {
    return { version: 1, ratings: {}, favorites: {}, goal: null, nickname: null, days: [], dayTotals: {} };
  }

  function cleanMap(source, keyPattern, validate) {
    const result = {};
    for (const key of Object.keys(source || {}).sort()) {
      const value = source[key];
      if (keyPattern.test(key) && value && validate(value)) result[key] = value;
    }
    return result;
  }

  function cleanChoice(choice, validate) {
    return choice && validate(choice.value) && timestamp(choice.at) ? { value: choice.value, at: choice.at } : null;
  }

  function normalize(raw) {
    if (!raw) return empty();
    if (raw.version !== 1) throw new Error("Unsupported sync snapshot version");
    const ratings = cleanMap(raw.ratings, ratingKey, (entry) => statuses.has(entry.status) &&
      count(entry.count) && timestamp(entry.updatedAt) && timestamp(entry.nextDue));
    const recent = cleanMap(raw.dayTotals, deviceKey, (entry) => validDay(entry.day) && count(entry.count));
    const favorites = cleanMap(raw.favorites, favoriteKey, (entry) => cleanChoice(entry, (value) => typeof value === "boolean"));
    return {
      version: 1,
      ratings: Object.fromEntries(Object.entries(ratings).map(([key, { status, count, nextDue, updatedAt }]) => [key, { status, count, nextDue, updatedAt }])),
      favorites: Object.fromEntries(Object.entries(favorites).map(([key, { value, at }]) => [key, { value, at }])),
      goal: cleanChoice(raw.goal, validGoal),
      nickname: cleanChoice(raw.nickname, validNickname),
      days: [...new Set((Array.isArray(raw.days) ? raw.days : []).filter(validDay))].sort(),
      dayTotals: Object.fromEntries(Object.entries(recent).map(([key, { day, count }]) => [key, { day, count }]))
    };
  }

  function newest(left, right, timeKey) {
    if (!left || !right) return left || right;
    if (left[timeKey] !== right[timeKey]) return left[timeKey] > right[timeKey] ? left : right;
    return JSON.stringify(left) >= JSON.stringify(right) ? left : right;
  }

  function combineMap(left, right, combine) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return Object.fromEntries(keys.map((key) => [key, combine(left[key], right[key])]));
  }

  function merge(local, remote) {
    const left = normalize(local);
    const right = normalize(remote);
    return {
      version: 1,
      ratings: combineMap(left.ratings, right.ratings, (a, b) => {
        if (!a || !b) return a || b;
        const { count: leftCount, ...leftRating } = a;
        const { count: rightCount, ...rightRating } = b;
        const { status, nextDue, updatedAt } = newest(leftRating, rightRating, "updatedAt");
        return { status, count: Math.max(leftCount, rightCount), nextDue, updatedAt };
      }),
      favorites: combineMap(left.favorites, right.favorites, (a, b) => newest(a, b, "at")),
      goal: newest(left.goal, right.goal, "at"),
      nickname: newest(left.nickname, right.nickname, "at"),
      days: [...new Set([...left.days, ...right.days])].sort(),
      dayTotals: combineMap(left.dayTotals, right.dayTotals, (a, b) => {
        if (!a || !b) return a || b;
        if (a.day !== b.day) return a.day > b.day ? a : b;
        return { day: a.day, count: Math.max(a.count, b.count) };
      })
    };
  }

  function fromLegacy(legacy, deviceId) {
    const snapshot = empty();
    if (!legacy) return snapshot;
    snapshot.ratings = legacy.ratings;
    snapshot.favorites = Object.fromEntries(Object.entries(legacy.favorites || {})
      .filter(([, saved]) => saved === true).map(([key]) => [key, { value: true, at: 0 }]));
    if (validGoal(legacy.dailyWordGoal) && legacy.dailyWordGoal !== 20) snapshot.goal = { value: legacy.dailyWordGoal, at: 0 };
    if (validDay(legacy.lastStudyDate)) {
      const end = Date.parse(legacy.lastStudyDate);
      const streak = Math.min(3660, Math.max(1, Math.trunc(Number(legacy.streak)) || 0));
      for (let offset = 0; offset < streak; offset += 1) {
        snapshot.days.push(new Date(end - offset * 86400000).toISOString().slice(0, 10));
      }
    }
    if (validDay(legacy.todayDate) && count(legacy.todayCount)) {
      snapshot.dayTotals[deviceId] = { day: legacy.todayDate, count: legacy.todayCount };
      snapshot.days.push(legacy.todayDate);
    }
    return normalize(snapshot);
  }

  function recordDay(progress, deviceId, day) {
    if (!progress.days.includes(day)) progress.days.push(day);
    const current = progress.dayTotals[deviceId];
    progress.dayTotals[deviceId] = { day, count: current?.day === day ? current.count + 1 : 1 };
  }

  function streak(progress) {
    let result = 0;
    const dates = [...progress.days].sort();
    let previous = Date.parse(dates.at(-1));
    for (let index = dates.length - 1; index >= 0 && Date.parse(dates[index]) === previous; index -= 1) {
      result += 1;
      previous -= 86400000;
    }
    return result;
  }

  function todayCount(progress, day) {
    return Object.values(progress.dayTotals).reduce((total, entry) => total + (entry.day === day ? entry.count : 0), 0);
  }

  function hasProgress(progress) {
    return Boolean(Object.keys(progress.ratings).length || Object.keys(progress.favorites).length || progress.goal || progress.days.length);
  }

  window.FlashProgress = { empty, normalize, merge, fromLegacy, recordDay, streak, todayCount, hasProgress };
})();
