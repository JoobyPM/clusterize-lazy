// test/clusterize.test.ts
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

/** one micro-task – works with both real & fake timers */
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

/** build the Event in the element’s own Window realm */
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
});
