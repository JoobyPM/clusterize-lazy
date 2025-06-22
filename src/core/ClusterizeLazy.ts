import { elementScroll, observeElementOffset, observeElementRect, Virtualizer } from '@tanstack/virtual-core';

export type RowLike = string | Record<string, unknown>;

export interface ClusterizeOptions<TRow = RowLike> {
	/* required */
	rowHeight: number;
	fetchOnInit: () => Promise<TRow[] | { totalRows: number; rows: TRow[] }>;
	fetchOnScroll: (offset: number) => Promise<TRow[]>;
	renderSkeletonRow: (height: number, index: number) => string;
	renderRaw?: (index: number, data: TRow) => string;
	scrollElem: HTMLElement;
	contentElem: HTMLElement;

	/* tunables */
	buffer?: number;
	prefetchRows?: number;
	cacheTTL?: number;
	debounceMs?: number;
	autoEvict?: boolean;
	scrollingProgress?: (firstVisible: number) => void;
	debug?: boolean;
	/** paint skeletons immediately (default = true) */
	showInitSkeletons?: boolean;

	buildIndex?: boolean; // build id -> index map
	primaryKey?: keyof TRow; // required if buildIndex = true
}

interface CacheEntry<TRow = RowLike> {
	html: string;
	ts: number;
	data?: TRow;
}

interface Patch<TRow> {
	id?: unknown; // looked up through index
	index?: number; // direct numeric address
	data: TRow; // replacement row
}

export class ClusterizeLazy<TRow = RowLike> {
	/* ctor / fields */
	private readonly opts: Required<ClusterizeOptions<TRow>>;
	private totalRows = 0;
	private cache: Array<CacheEntry<TRow> | undefined> = [];
	private readonly inFlight = new Set<number>();
	private readonly v: Virtualizer<HTMLElement, HTMLElement>;
	private readonly now = () => Date.now();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingOffset: number | null = null;
	private readonly cleanup?: () => void;
	private readonly index?: Map<unknown, number>;
	private readonly log = (...a: unknown[]) =>
		this.opts.debug && console.log(`[Clusterize] [${new Date().toISOString()}]`, ...a);

	constructor(opts: ClusterizeOptions<TRow>) {
		this.opts = {
			buffer: 5,
			prefetchRows: opts.buffer ?? 5,
			cacheTTL: 300_000,
			debounceMs: 120,
			autoEvict: false,
			debug: false,
			showInitSkeletons: true,
			buildIndex: false,
			primaryKey: 'id' as keyof TRow,
			...opts,
		} as Required<ClusterizeOptions<TRow>>;

		if (this.opts.buildIndex) this.index = new Map();

		/* virtual-core bootstrap */
		this.v = new Virtualizer({
			count: 0,
			overscan: this.opts.buffer,
			estimateSize: () => this.opts.rowHeight,
			getScrollElement: () => this.opts.scrollElem,
			scrollToFn: elementScroll,
			observeElementRect,
			observeElementOffset,
			onChange: () => this.render(),
		});
		this.v._willUpdate();
		this.cleanup = this.v._didMount();

		/* immediate UX feedback */
		if (this.opts.showInitSkeletons) this.paintInitialSkeletons();

		this.log('ctor → schedule first fetch (micro-task)');
		queueMicrotask(() => {
			void this.firstFetch();
		});
	}

	/* PUBLIC API helpers */
	destroy() {
		this.log('destroy → destroy');
		this.cleanup?.();
		this.cache = [];
		this.inFlight.clear();
		this.opts.contentElem.innerHTML = '';
	}
	refresh() {
		this.log('refresh → refresh');
		this.render();
	}
	scrollToRow(i: number, smooth = true) {
		this.log('scrollToRow → scrollToRow', i, smooth);
		this.v.scrollToIndex(i, { behavior: smooth ? 'smooth' : 'auto' });
	}
	getLoadedCount() {
		this.log('getLoadedCount → getLoadedCount');
		return this.cache.reduce((n, c) => n + (c ? 1 : 0), 0);
	}

	/* NEW PUBLIC API ---------- */

	/** replace rows in place; ids take precedence over numeric indexes */
	update(patches: Patch<TRow>[]) {
		this.log('update()', patches);
		for (const p of patches) {
			const idx = this.resolveIndex(p);
			if (idx === -1) continue;
			this.installRows(idx, [p.data]);
		}
		this.render();
	}

	/** insert rows at position (defaults to 0) */
	insert(rows: TRow[], at = 0) {
		this.log('insert()', rows.length, 'rows at', at);
		this.cache.splice(at, 0, ...new Array(rows.length));
		this.totalRows += rows.length;

		if (this.index) this.shiftIndex(at, rows.length); // make room

		this.v.setOptions({ ...this.v.options, count: this.totalRows });
		this.installRows(at, rows);
		this.render();
	}

	/** remove rows by id or numeric index */
	delete(keys: Array<unknown | number>) {
		this.log('delete()', keys);
		// resolve and sort descending so splice does not shift later indices
		const toDrop = [...new Set(keys.map((k) => typeof k === 'number' ? k : this.index?.get(k) ?? -1))]
			.filter((i): i is number => i >= 0)
			.sort((a, b) => b - a);

		for (const i of toDrop) {
			this.cache.splice(i, 1);
			this.totalRows--;
		}
		if (this.index) this.rebuildIndex(); // simplest and safest

		this.v.setOptions({ ...this.v.options, count: this.totalRows });
		this.render();
	}

	/** low-level dump for debug or power users */
	_dump() {
		return { cache: this.cache, index: this.index };
	}

	/* initial skeletons */
	private paintInitialSkeletons() {
		this.log('paintInitialSkeletons → paintInitialSkeletons');
		const rows = Math.ceil(this.opts.scrollElem.clientHeight / this.opts.rowHeight) +
			this.opts.buffer * 2;

		const html = Array.from({ length: rows }, (_, i) => this.opts.renderSkeletonRow(this.opts.rowHeight, i)).join('');

		this.opts.contentElem.innerHTML = html;
	}

	/* first data batch */
	private async firstFetch() {
		this.log('firstFetch → fetchOnInit');
		const first = await this.opts.fetchOnInit();

		if (Array.isArray(first)) {
			this.totalRows = first.length;
			this.cache = new Array(this.totalRows);
			this.installRows(0, first);
		} else {
			this.totalRows = first.totalRows;
			this.cache = new Array(this.totalRows);
			this.installRows(0, first.rows);
		}

		/* keep previous callbacks when updating count */
		this.v.setOptions({ ...this.v.options, count: this.totalRows });
		this.render();
	}

	/* main render loop */
	private render() {
		if (!this.totalRows) return;
		const items = this.v.getVirtualItems();
		if (!items.length) return;

		this.opts.scrollingProgress?.(items[0].index);

		const firstNeed = Math.max(0, items[0].index - this.opts.prefetchRows);
		const lastNeed = Math.min(this.totalRows - 1, items.at(-1)!.index + this.opts.prefetchRows);

		const html: string[] = [];
		const firstVis = items[0], lastVis = items.at(-1)!;
		if (firstVis.start) html.push(`<div style="height:${firstVis.start}px"></div>`);

		for (let i = firstVis.index; i <= lastVis.index; i++) {
			const row = this.cache[i];
			html.push(row && this.isLive(row) ? row.html : this.opts.renderSkeletonRow(this.opts.rowHeight, i));
		}

		const bottom = this.v.getTotalSize() - lastVis.end;
		if (bottom) html.push(`<div style="height:${bottom}px"></div>`);

		this.opts.contentElem.innerHTML = html.join('');
		this.opts.contentElem.querySelectorAll('[data-index]')
			.forEach((el) => this.v.measureElement(el as HTMLElement));

		let gap: number | null = null;
		for (let i = firstNeed; i <= lastNeed; i++) {
			const r = this.cache[i];
			if (!r || !this.isLive(r)) {
				gap = i;
				break;
			}
		}
		if (gap !== null) this.scheduleFetch(gap);
		if (this.opts.autoEvict) this.evictStale();
	}

	/* amended cache helper --------------------------------------------- */
	private installRows(off: number, rows: TRow[]) {
		this.log('installRows', off, rows.length);
		const pk = this.opts.primaryKey;
		rows.forEach((r, i) => {
			const idx = off + i;
			const entry: CacheEntry<TRow> = {
				html: typeof r === 'string' ? r : this.renderRaw(idx, r),
				ts: this.now(),
				data: r,
			};
			this.cache[idx] = entry;

			if (this.index && pk in (r as any)) {
				this.index.set((r as any)[pk], idx);
			}
		});
	}
	private renderRaw(i: number, d: TRow) {
		if (typeof d === 'string') return d;
		if (!this.opts.renderRaw) throw new Error('renderRaw missing');
		return this.opts.renderRaw(i, d);
	}
	private isLive(e: CacheEntry<TRow>) {
		return !this.opts.autoEvict || this.now() - e.ts < this.opts.cacheTTL;
	}
	private evictStale() {
		this.log('evictStale → evictStale');
		const n = this.now();
		this.cache.forEach((e, i) => {
			if (e && n - e.ts >= this.opts.cacheTTL) this.cache[i] = undefined;
		});
	}

	/* internal helpers -------------------------------------------------- */

	private resolveIndex(p: Patch<TRow>): number {
		if (p.index != null) return p.index;
		if (p.id != null && this.index) return this.index.get(p.id) ?? -1;
		return -1;
	}

	/** shift index entries after an insertion/deletion */
	private shiftIndex(start: number, delta: number) {
		if (!this.index) return;
		for (const [k, v] of Array.from(this.index.entries())) {
			if (v >= start) this.index.set(k, v + delta);
		}
	}

	/** fully rebuild index (cheap on V-lists) */
	private rebuildIndex() {
		if (!this.index) return;
		this.index.clear();
		const pk = this.opts.primaryKey;
		this.cache.forEach((e, i) => {
			const row = e?.data;
			if (row && pk in (row as any)) this.index!.set((row as any)[pk], i);
		});
	}

	/* debounced fetch */
	private scheduleFetch(offset: number) {
		if (this.inFlight.has(offset)) return;
		if (this.pendingOffset === offset && this.debounceTimer) return;
		if (this.debounceTimer) clearTimeout(this.debounceTimer);

		this.pendingOffset = offset;
		this.debounceTimer = setTimeout(() => {
			this.log('scheduleFetch → scheduleFetch', offset);
			const off = this.pendingOffset!;
			this.pendingOffset = null;
			this.debounceTimer = null;
			this.inFlight.add(off);
			this.opts.fetchOnScroll(off)
				.then((r) => this.installRows(off, r))
				.catch((err) => console.error('[Clusterize] fetch err', err))
				.finally(() => {
					this.inFlight.delete(off);
					this.render();
				});
		}, this.opts.debounceMs);
	}
}

export default ClusterizeLazy;
