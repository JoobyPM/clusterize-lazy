// deno-lint-ignore-file no-node-globals no-window no-window-prefix
// @ts-nocheck - no types check for now
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { JSDOM } from "jsdom";
import Clusterize from "../src/clusterize-lazy.js";

function setupDom() {
  const dom = new JSDOM(
    '<!doctype html><div id="scroll" style="overflow:auto;"><div id="content"></div></div>',
    { pretendToBeVisual: true, url: "http://localhost/" },
  );
  global.window = dom.window;
  global.document = dom.window.document;

  // deterministic viewport height
  Object.defineProperty(
    document.getElementById("scroll"),
    "clientHeight",
    { value: 100, configurable: true },
  );
}

/* ---------------- basic behaviour tests ---------------- */

describe("Clusterize-Lazy basics", () => {
  beforeEach(() => {
    setupDom();
  });

  it("throws when options are not supplied", () => {
    expect(() => new Clusterize()).toThrow();
  });

  it("performs initial fetch and renders rows", async () => {
    let initCalled = false;

    const cluster = new Clusterize({
      rowHeight: 10,
      scrollElem: document.getElementById("scroll"),
      contentElem: document.getElementById("content"),
      fetchOnInit: async () => {
        initCalled = true;
        return { totalRows: 3, rows: ["a", "b", "c"] };
      },
      fetchOnScroll: () => Promise.resolve([]),
      renderSkeletonRow: () => '<div class="sk"></div>',
    });

    await new Promise((r) => setTimeout(r, 0));

    expect(initCalled).toBe(true);
    expect(document.getElementById("content").textContent).toContain("a");
    expect(cluster.getLoadedCount()).toBe(3);
  });

  it("insert adds rows and updates cache count", async () => {
    const cluster = new Clusterize({
      rowHeight: 10,
      scrollElem: document.getElementById("scroll"),
      contentElem: document.getElementById("content"),
      fetchOnInit: async () => ({ totalRows: 0, rows: [] }),
      fetchOnScroll: () => Promise.resolve([]),
      renderSkeletonRow: () => '<div class="sk"></div>',
    });

    await new Promise((r) => setTimeout(r, 0));

    cluster.insert(["x", "y"]);
    expect(cluster.getLoadedCount()).toBe(2);
    expect(document.getElementById("content").textContent).toContain("x");
  });

  it("avoids skeleton flashes on 3x viewport flick scroll", async () => {
    const total = 100;
    const viewport = 100;
    const rowHeight = 10;
    const buffer = 5;
    const prefetchRows = 30;

    const fetchedChunks = new Map();
    const fetchChunk = (offset) => {
      if (fetchedChunks.has(offset)) return fetchedChunks.get(offset);
      const rows = Array.from({ length: prefetchRows }, (_, i) => (offset + i).toString());
      fetchedChunks.set(offset, rows);
      return rows;
    };

    const cluster = new Clusterize({
      rowHeight,
      buffer,
      prefetchRows,
      debounceMs: 0,
      scrollElem: document.getElementById("scroll"),
      contentElem: document.getElementById("content"),
      fetchOnInit: async () => ({
        totalRows: total,
        rows: fetchChunk(0).slice(0, 20),
      }),
      fetchOnScroll: async (offset) => fetchChunk(offset),
      renderSkeletonRow: () => '<div class="sk"></div>',
    });

    await new Promise((r) => setTimeout(r, 0));

    const scrollElem = document.getElementById("scroll");
    scrollElem.scrollTop = viewport * 3;
    scrollElem.dispatchEvent(new window.Event("scroll"));
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector(".sk")).toBeNull();
  });
});

/* ---------------- soak / memory-plateau tests ---------------- */

describe("Clusterize-Lazy cache eviction (soak)", () => {
  beforeEach(() => {
    setupDom();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCluster(evictEnabled) {
    return new Clusterize({
      rowHeight: 1,
      buffer: 0,
      prefetchRows: 0,
      debounceMs: 0,
      cacheTTL: 50,           // 50 ms TTL for fast tests
      autoEvict: evictEnabled,
      scrollElem: document.getElementById("scroll"),
      contentElem: document.getElementById("content"),
      fetchOnInit: async () => ({ totalRows: 200, rows: [] }),
      fetchOnScroll: async (offset) => [offset.toString()],
      renderSkeletonRow: () => '<div class="sk"></div>',
    });
  }

  async function simulateScroll(cluster, steps, stepMs) {
    const scrollElem = document.getElementById("scroll");
    for (let i = 0; i < steps; i++) {
      scrollElem.scrollTop = i;
      scrollElem.dispatchEvent(new window.Event("scroll"));
      vi.runOnlyPendingTimers();          // run debounce timers (0 ms)
      await Promise.resolve();            // flush micro-tasks
      vi.advanceTimersByTime(stepMs);     // advance fake clock
    }
  }

  it("memory plateaus when autoEvict is true", async () => {
    const cluster = makeCluster(true);

    await simulateScroll(cluster, 100, 10);

    const live = cluster.getLoadedCount();
    expect(live).toBeLessThanOrEqual(15); // eviction keeps live count low
  });

  it("memory grows unbounded when autoEvict is false", async () => {
    const cluster = makeCluster(false);

    await simulateScroll(cluster, 100, 10);

    const live = cluster.getLoadedCount();
    expect(live).toBeGreaterThan(40);     // many rows cached without eviction
  });
});
