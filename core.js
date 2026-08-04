(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FoodWheelCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "xiaoyu-food-wheel-v1";
  const STORAGE_VERSION = 1;
  const MAX_ENTRIES = 40;
  const MAX_NAME_LENGTH = 24;
  const DEFAULT_NAMES = ["火锅", "麻辣烫", "烧烤", "饺子", "日料", "汉堡", "常去的小馆", "附近的面馆"];

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function validateName(entries, value) {
    const name = normalizeName(value);
    if (!name) return { ok: false, message: "请输入食物或饭店名" };
    if ([...name].length > MAX_NAME_LENGTH) return { ok: false, message: `最多 ${MAX_NAME_LENGTH} 个字` };
    if (entries.length >= MAX_ENTRIES) return { ok: false, message: `最多保存 ${MAX_ENTRIES} 个候选` };
    const duplicate = entries.some((entry) => normalizeName(entry.name).toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"));
    if (duplicate) return { ok: false, message: "这个候选已经有了" };
    return { ok: true, name };
  }

  function makeId(cryptoObject) {
    if (cryptoObject && typeof cryptoObject.randomUUID === "function") return cryptoObject.randomUUID();
    const values = new Uint32Array(2);
    cryptoObject.getRandomValues(values);
    return `${values[0].toString(36)}-${values[1].toString(36)}`;
  }

  function createEntry(name, cryptoObject, timestamp = Date.now()) {
    return { id: makeId(cryptoObject), name: normalizeName(name), createdAt: timestamp };
  }

  function createDefaultState(cryptoObject, timestamp = Date.now()) {
    return {
      version: STORAGE_VERSION,
      entries: DEFAULT_NAMES.map((name, index) => createEntry(name, cryptoObject, timestamp + index))
    };
  }

  function isValidEntry(entry) {
    return entry && typeof entry.id === "string" && typeof entry.name === "string" && normalizeName(entry.name) && Number.isFinite(entry.createdAt);
  }

  function loadState(storage, cryptoObject) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
      if (parsed && parsed.version === STORAGE_VERSION && Array.isArray(parsed.entries) && parsed.entries.every(isValidEntry)) {
        return { version: STORAGE_VERSION, entries: parsed.entries.slice(0, MAX_ENTRIES).map((entry) => ({ ...entry, name: normalizeName(entry.name) })) };
      }
    } catch (error) {
      console.warn("无法读取本地候选", error);
    }
    const initial = createDefaultState(cryptoObject);
    saveState(storage, initial);
    return initial;
  }

  function saveState(storage, state) {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, entries: state.entries }));
  }

  function secureRandomIndex(length, cryptoObject) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError("length must be a positive integer");
    const range = 0x100000000;
    const limit = Math.floor(range / length) * length;
    const values = new Uint32Array(1);
    do cryptoObject.getRandomValues(values); while (values[0] >= limit);
    return values[0] % length;
  }

  return {
    STORAGE_KEY,
    STORAGE_VERSION,
    MAX_ENTRIES,
    MAX_NAME_LENGTH,
    DEFAULT_NAMES,
    normalizeName,
    validateName,
    createEntry,
    createDefaultState,
    loadState,
    saveState,
    secureRandomIndex
  };
}));
