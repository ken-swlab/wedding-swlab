import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** localStorage の代わり（Map で持つ） */
class FakeStorage {
  constructor() {
    this.m = new Map();
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

const cache = await import("../src/lib/client-cache.ts");

beforeEach(() => {
  globalThis.localStorage = new FakeStorage();
  cache.resetClientCacheMemory();
});

test("書いたものを同じ uid で読める・開き直し（メモリが空）でも localStorage から読める", () => {
  cache.writeCache("u1", "community", "all", { count: 3 });
  assert.deepEqual(cache.readCache("u1", "community", "all"), { count: 3 });
  cache.resetClientCacheMemory();
  assert.deepEqual(cache.readCache("u1", "community", "all"), { count: 3 });
});

test("uid が変わったら、前の人のキャッシュを全部消す", () => {
  cache.writeCache("u1", "community", "all", { count: 3 });
  assert.equal(cache.readCache("u2", "community", "all"), undefined);
  // u2 に切り替わった時点で u1 の分は端末から消えている
  assert.equal([...globalThis.localStorage.m.keys()].some((k) => k.includes(":u1:")), false);
  cache.resetClientCacheMemory();
  assert.equal(cache.readCache("u1", "community", "all"), undefined);
});

test("clearClientCache で cache:v1: だけを消す", () => {
  globalThis.localStorage.setItem("wb:last-screen", "x");
  cache.writeCache("u1", "payment", "self", { total: 1 });
  cache.clearClientCache();
  assert.equal(cache.readCache("u1", "payment", "self"), undefined);
  assert.equal(globalThis.localStorage.getItem("wb:last-screen"), "x");
});

test("種類ごとに CACHE_MAX_PER_KIND 件まで（古いものから消す）", () => {
  for (let i = 0; i < cache.CACHE_MAX_PER_KIND + 3; i++) cache.writeCache("u1", "community", `t${i}`, i, 1000 + i);
  cache.writeCache("u1", "payment", "self", 1, 1);
  const keys = [...globalThis.localStorage.m.keys()];
  assert.equal(keys.filter((k) => k.includes(":community:")).length, cache.CACHE_MAX_PER_KIND);
  assert.ok(!keys.includes(cache.cacheKey("u1", "community", "t0")));
  assert.ok(keys.includes(cache.cacheKey("u1", "payment", "self")));
});

test("invalidateCache はその種類だけ捨て、聞いている画面に知らせる", () => {
  cache.writeCache("u1", "community", "all", 1);
  cache.writeCache("u1", "payment", "self", 2);
  let called = 0;
  const off = cache.onInvalidate("community", () => (called += 1));
  cache.invalidateCache("community");
  off();
  assert.equal(called, 1);
  assert.equal(cache.readCache("u1", "community", "all"), undefined);
  assert.equal(cache.readCache("u1", "payment", "self"), 2);
});

test("localStorage が使えなくても（例外を投げても）メモリだけで動く", () => {
  globalThis.localStorage = {
    get length() {
      throw new Error("denied");
    },
    key() {
      throw new Error("denied");
    },
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };
  cache.writeCache("u1", "community", "all", 5);
  assert.equal(cache.readCache("u1", "community", "all"), 5);
  cache.invalidateCache("community");
  assert.equal(cache.readCache("u1", "community", "all"), undefined);
  cache.clearClientCache();
});
