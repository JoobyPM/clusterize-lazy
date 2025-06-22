// Vitest + jsdom integration tests for Clusterize-Lazy
// ────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import Clusterize, { ClusterizeLazy } from '../src/index.ts';

// ───────────── helpers ─────────────

function bootstrapDom(viewport = 120): void {
	const dom = new JSDOM(
		'<!doctype html><div id="scroll" style="overflow:auto"><div id="content"></div></div>',
		{ pretendToBeVisual: true, url: 'http://local.test' },
	);

	Object.assign(globalThis, { window: dom.window, document: dom.window.document });

	const scroll = document.getElementById('scroll')!;
	(['clientHeight', 'offsetHeight'] as const).forEach((p) =>
		Object.defineProperty(scroll, p, { value: viewport, configurable: true })
	);
	Object.defineProperty(scroll, 'offsetWidth', { value: 300, configurable: true });
}

type Raw = { id: string | number; name: string };

/** one micro-task - works with both real & fake timers */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** retry until `assert()` stops throwing or timeout */
async function eventually(assert: () => void, ms = 1_000): Promise<void> {
	const deadline = Date.now() + ms;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		try {
			assert();
			return;
		} catch {
			if (Date.now() > deadline) throw new Error('Timeout');
			await tick();
		}
	}
}

/** build the Event in the element's own Window realm */
function fireScroll(el: HTMLElement): void {
	const Win = el.ownerDocument!.defaultView!;
	el.dispatchEvent(new Win.Event('scroll', { bubbles: true }));
}

// ───────────── suite ─────────────

describe('Clusterize-Lazy (integration)', () => {
	beforeEach(() => bootstrapDom());

	it('throws when required options are missing', () => {
		// @ts-expect-error deliberate misuse
		expect(() => new Clusterize()).toThrow();
	});

	it('performs initial fetch and replaces skeletons', async () => {
		let initHit = false;

		const cluster = Clusterize({
			rowHeight: 20,
			scrollElem: document.getElementById('scroll')!,
			contentElem: document.getElementById('content')!,
			renderSkeletonRow: () => '<div class="sk"></div>',
			fetchOnInit() {
				initHit = true;
				return Promise.resolve({
					totalRows: 3,
					rows: ['alpha', 'beta', 'gamma'],
				});
			},
			fetchOnScroll: () => Promise.resolve([]),
		});

		expect(document.querySelector('.sk')).not.toBeNull();

		await eventually(() => expect(document.getElementById('content')!.textContent).toContain('alpha'));

		expect(initHit).toBe(true);
		expect(cluster.getLoadedCount()).toBe(3);
	});

	it('lazy-loads a missing slice after scroll-stop', async () => {
		const PAGE = 10;
		let calls = 0;
		const fetch = (offset: number) => {
			calls++;
			return Promise.resolve(
				Array.from({ length: PAGE }, (_, i) => `row-${offset + i}`),
			);
		};

		const scroll = document.getElementById('scroll')!;

		const cluster = Clusterize({
			rowHeight: 10,
			prefetchRows: 0,
			debounceMs: 0,
			scrollElem: scroll,
			contentElem: document.getElementById('content')!,
			renderSkeletonRow: () => '<div class="sk"></div>',
			fetchOnInit: () => fetch(0).then((rows) => ({ totalRows: 200, rows })),
			fetchOnScroll: fetch,
		});

		await tick(); // first batch flushed

		scroll.scrollTop = 8 * 120;
		fireScroll(scroll);

		await eventually(() => {
			expect(calls).toBe(2); // 1 init + 1 on-scroll
			expect(cluster.getLoadedCount()).toBeGreaterThanOrEqual(PAGE * 2);
		}, 2_000);
	});

	// ───────────── cache-eviction soak ─────────────
	describe('cache-eviction behaviour', () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		const simulateScroll = async (
			_cluster: ClusterizeLazy<string>, // eslint-disable-line @typescript-eslint/no-unused-vars
			steps: number,
		) => {
			const el = document.getElementById('scroll')!;
			for (let i = 0; i < steps; i++) {
				el.scrollTop = i * 10;
				fireScroll(el);

				// flush everything synchronously when fake timers are active
				vi.runAllTimers(); // debounce(0) + scheduleFetch(0)
				await Promise.resolve(); // micro-tasks (Promise chains inside fetch)
				vi.advanceTimersByTime(3); // age rows > cacheTTL (2 ms)
				await Promise.resolve(); // micro-tasks produced by render()
			}
		};

		const make = (autoEvict: boolean) =>
			Clusterize({
				rowHeight: 10,
				cacheTTL: 2, // super-short TTL = fast tests
				autoEvict,
				buffer: 0,
				prefetchRows: 0,
				debounceMs: 0,
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				fetchOnInit: () => Promise.resolve({ totalRows: 1_000, rows: [] }),
				fetchOnScroll: (o) => Promise.resolve([`row-${o}`]),
			});

		it(
			'keeps live cache small when autoEvict = true',
			async () => {
				const c = make(true);
				await simulateScroll(c, 60);
				expect(c.getLoadedCount()).toBeLessThanOrEqual(15);
			},
			5_000,
		);

		it(
			'cache grows when autoEvict = false',
			async () => {
				const c = make(false);
				await simulateScroll(c, 60);
				expect(c.getLoadedCount()).toBeGreaterThan(30);
			},
			5_000,
		);
	});

	// ───────────── mutation API tests ─────────────
	describe('mutation APIs', () => {
		it('supports insert() to add rows at specified position', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				buildIndex: true,
				primaryKey: 'id',
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 1, name: 'first' },
						{ id: 2, name: 'second' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			// Insert at beginning
			cluster.insert([{ id: 0, name: 'inserted' }], 0);

			await eventually(() => {
				const content = document.getElementById('content')!.textContent;
				expect(content).toContain('inserted');
				expect(content).toContain('first');
			});
		});

		it('supports update() to modify existing rows by id', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				buildIndex: true,
				primaryKey: 'id',
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 'id1', name: 'original-name' },
						{ id: 'id2', name: 'second-name' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			// Ensure data is loaded first
			await eventually(() => {
				const content = document.getElementById('content')!.textContent;
				expect(content).toContain('original-name');
			});

			// Update by id
			cluster.update([{ id: 'id1', data: { id: 'id1', name: 'updated-name' } }]);

			await eventually(() => {
				const content = document.getElementById('content')!.textContent;
				expect(content).toContain('updated-name');
				expect(content).not.toContain('original-name');
			});
		});

		it('supports remove() to remove rows by id', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				buildIndex: true,
				primaryKey: 'id',
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 'a', name: 'first' },
						{ id: 'b', name: 'second' },
						{ id: 'c', name: 'third' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			// Remove by id (using string ID to avoid confusion with numeric indices)
			cluster.remove(['b']); // remove second item

			await eventually(() => {
				const content = document.getElementById('content')!.textContent;
				expect(content).toContain('first');
				expect(content).not.toContain('second');
				expect(content).toContain('third');
			});
		});

		it('validates misuse of buildIndex early', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				buildIndex: false, // explicitly disabled
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 'a', name: 'first' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			// Should throw when trying to use { id } with buildIndex = false
			expect(() => {
				cluster.update([{ id: 'a', data: { id: 'a', name: 'updated' } }]);
			}).toThrow('Cannot use { id } in update() when buildIndex is false');

			// Should throw when trying to use non-numeric keys with buildIndex = false
			expect(() => {
				cluster.remove(['a']); // string key
			}).toThrow('Cannot use non-numeric keys in remove() when buildIndex is false');
		});

		it('validates insert() indexes', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 'a', name: 'first' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			// Should throw for negative index
			expect(() => {
				cluster.insert([{ id: 'x', name: 'invalid' }], -1);
			}).toThrow('Invalid insertion index -1');

			// Should throw for index > totalRows
			expect(() => {
				cluster.insert([{ id: 'x', name: 'invalid' }], 10);
			}).toThrow('Invalid insertion index 10');
		});

		it('supports _dump() for debugging', async () => {
			const cluster = Clusterize({
				rowHeight: 20,
				buildIndex: true,
				primaryKey: 'id',
				scrollElem: document.getElementById('scroll')!,
				contentElem: document.getElementById('content')!,
				renderSkeletonRow: () => '<div class="sk"></div>',
				renderRaw: (_: number, data: Raw) => `<div>${data.name}</div>`,
				fetchOnInit() {
					return Promise.resolve([
						{ id: 1, name: 'first' },
					]);
				},
				fetchOnScroll: () => Promise.resolve([]),
			});

			await tick(); // wait for initial fetch

			const dump = cluster._dump();
			expect(dump.cache).toBeDefined();
			expect(dump.index).toBeDefined();
			expect(dump.index!.get(1)).toBe(0); // id 1 at index 0
		});
	});
});
