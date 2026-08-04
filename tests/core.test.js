const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

function deterministicCrypto(values = [1, 2, 3, 4]) {
  let index = 0;
  return {
    randomUUID: () => `id-${index++}`,
    getRandomValues(target) {
      target[0] = values[index++ % values.length];
      return target;
    }
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test("normalizes whitespace and validates entries", () => {
  const entries = [{ id: "1", name: "火锅", createdAt: 1 }];
  assert.deepEqual(Core.validateName(entries, "  附近   小馆  "), { ok: true, name: "附近 小馆" });
  assert.equal(Core.validateName(entries, " ").ok, false);
  assert.equal(Core.validateName(entries, " 火锅 ").ok, false);
  assert.equal(Core.validateName(entries, "a".repeat(25)).ok, false);
});

test("enforces the 40 entry limit", () => {
  const entries = Array.from({ length: 40 }, (_, index) => ({ id: String(index), name: `候选${index}`, createdAt: index }));
  assert.equal(Core.validateName(entries, "新候选").ok, false);
});

test("creates and persists the default state", () => {
  const storage = memoryStorage();
  const crypto = deterministicCrypto();
  const state = Core.loadState(storage, crypto);
  assert.deepEqual(state.entries.map((entry) => entry.name), Core.DEFAULT_NAMES);
  const restored = Core.loadState(storage, crypto);
  assert.deepEqual(restored, state);
});

test("replaces malformed stored data with defaults", () => {
  const storage = memoryStorage({ [Core.STORAGE_KEY]: "{not-json" });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const state = Core.loadState(storage, deterministicCrypto());
    assert.equal(state.version, 1);
    assert.equal(state.entries.length, Core.DEFAULT_NAMES.length);
  } finally {
    console.warn = originalWarn;
  }
});

test("secure random indexes always stay in range", () => {
  const crypto = deterministicCrypto([0, 1, 0xffffffff - 1, 42]);
  for (let index = 0; index < 100; index += 1) {
    const selected = Core.secureRandomIndex(8, crypto);
    assert.ok(selected >= 0 && selected < 8);
  }
  assert.throws(() => Core.secureRandomIndex(0, crypto), RangeError);
});
