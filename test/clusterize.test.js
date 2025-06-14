// Runs under Vitest (Node). Use `pnpm run test:node`.
// JSDOM supplies a minimal browser environment.

import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import Clusterize from "../src/clusterize-lazy.js";

function setupDom() {
  const dom = new JSDOM(
    '<!doctype html><div id="scroll"><div id="content"></div></div>',
    { pretendToBeVisual: true, url: "http://localhost/" },
  );
  global.window = dom.window;
  global.document = dom.window.document;
}

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

    // wait for the micro-tasks inside fetchOnInit to finish
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
});
