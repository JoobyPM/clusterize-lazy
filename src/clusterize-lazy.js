// deno-lint-ignore-file no-window
/*
 * https://github.com/JoobyPM/clusterize-lazy
 * MIT License
 *
 * Pure ES module, but also assigns window.Clusterize for classic usage.
 */

/* ------------------------------------------------------------------ helpers */
function debounce(fn, wait) {
	let t;
	return function (...a) {
		clearTimeout(t);
		t = setTimeout(() => fn.apply(this, a), wait);
	};
}
const on = (e, el, fn) => el.addEventListener(e, fn, false);
const off = (e, el, fn) => el.removeEventListener(e, fn, false);

function createExtra(cls, h) {
	const d = document.createElement('div');
	d.className = 'clusterize-extra-row ' + cls;
	d.style.height = h + 'px';
	return d.outerHTML;
}

/* ------------------------------------------------------------------ factory */
function Clusterize(opts) {
	if (!(this instanceof Clusterize)) return new Clusterize(opts);
	if (!opts) throw new Error('options object is mandatory');

	/* required */
	const rowHeight = num(opts.rowHeight, 'rowHeight');
	const fetchOnInit = fn(opts.fetchOnInit, 'fetchOnInit');
	const fetchOnScroll = fn(opts.fetchOnScroll, 'fetchOnScroll');
	const renderSkeleton = fn(opts.renderSkeletonRow, 'renderSkeletonRow');
	const renderRaw = opts.renderRaw ? fn(opts.renderRaw, 'renderRaw') : null;

	/* empty-state renderer (optional) */
	let renderEmptyStateFn = opts.renderEmptyState
		? fn(opts.renderEmptyState, 'renderEmptyState')
		: () => `<div class="clusterize-empty">No data</div>`;

	/* scroll-progress callback (optional) */
	let scrollProgressCb = typeof opts.scrollingProgress === 'function' ? opts.scrollingProgress : null;

	/* dom */
	const scrollElem = opts.scrollElem || document.getElementById(opts.scrollId);
	const contentElem = opts.contentElem || document.getElementById(opts.contentId);
	if (!scrollElem || !contentElem) throw new Error('scrollElem and contentElem are required');
	contentElem.setAttribute('tabindex', '0');

	/* tuning */
	const debounceMs = num(opts.debounceMs, null, 120);
	const bufRows = num(opts.buffer, null, 5);
	const prefetchRows = num(opts.prefetchRows, null, bufRows);
	const cacheTTL = num(opts.cacheTTL, null, 300_000); // default 5 min
	const autoEvict = !!opts.autoEvict;
	const onStop = typeof opts.onScrollFinish === 'function' ? opts.onScrollFinish : () => {};
	const buildIndex = !!opts.buildIndex;
	const keyField = opts.primaryKey || 'id';

	/* state */
	let totalRows = null;
	let cache = []; // array of { html, ts, key }
	let indexMap = buildIndex ? new Map() : null;
	let inFlight = false;
	let lastReqOffset = -1;
	let lastProgressRow = -1; // for scrollingProgress

	/* ----------------------------- tiny utils */
	function now() {
		return Date.now();
	}
	function num(v, name, dflt) {
		if (v == null) return dflt;
		if (typeof v !== 'number') throw new Error((name || 'value') + ' must be number');
		return v;
	}
	function fn(v, name) {
		if (typeof v !== 'function') throw new Error(name + ' must be function');
		return v;
	}
	function isLive(row) {
		if (!row) return false;
		if (!autoEvict) return true; // unlimited cache
		return (now() - row.ts) < cacheTTL;
	}
	function normalizeRow(idx, data) {
		if (typeof data === 'string') return { html: data, ts: now(), key: null };
		if (!renderRaw) throw new Error('renderRaw is required for object rows');
		const html = renderRaw(idx, data);
		const key = buildIndex ? (data[keyField] ?? null) : null;
		return { html, ts: now(), key };
	}
	function setRow(idx, rowObj) {
		cache[idx] = rowObj;
		if (buildIndex && rowObj.key != null) indexMap.set(rowObj.key, idx);
	}

	/* ----------------------------- rendering */
	function render() {
		if (totalRows == null) return;

		/* empty list: render empty state and exit */
		if (totalRows === 0) {
			contentElem.innerHTML = renderEmptyStateFn();
			fireProgress(0);
			return;
		}

		const firstVis = Math.floor(scrollElem.scrollTop / rowHeight);
		const visCount = Math.ceil(scrollElem.clientHeight / rowHeight);
		const start = Math.max(0, firstVis - bufRows);
		const end = Math.min(totalRows - 1, firstVis + visCount + bufRows);

		const parts = [];
		const topPad = start * rowHeight;
		const bottomPad = (totalRows - end - 1) * rowHeight;
		if (topPad) parts.push(createExtra('top-space', topPad));

		for (let i = start; i <= end; i++) {
			const row = cache[i];
			parts.push(isLive(row) ? row.html : renderSkeleton(rowHeight, i));
		}

		if (bottomPad) parts.push(createExtra('bottom-space', bottomPad));
		contentElem.innerHTML = parts.join('');

		fireProgress(firstVis);
	}

	function firstMissing(from, to) {
		for (let i = from; i <= to; i++) {
			if (!isLive(cache[i])) return i;
		}
		return -1;
	}

	/* scroll-progress notifier */
	function fireProgress(firstVis) {
		if (scrollProgressCb && firstVis !== lastProgressRow) {
			lastProgressRow = firstVis;
			scrollProgressCb(firstVis);
		}
	}

	/* ----------------------------- fetch */
	function doFetch(offset) {
		if (inFlight || offset === -1 || offset === lastReqOffset) return;
		inFlight = true;
		lastReqOffset = offset;
		fetchOnScroll(offset).then((rows) => {
			const arr = Array.isArray(rows) ? rows : [];
			for (let i = 0; i < arr.length; i++) {
				setRow(offset + i, normalizeRow(offset + i, arr[i]));
			}
		}).finally(() => {
			inFlight = false;
			lastReqOffset = -1;
			render();
		});
	}
	const debFetch = debounce(doFetch, debounceMs);

	/* ----------------------------- scroll handler */
	const stopDebounced = debounce((i) => onStop(i), 100);
	const onScroll = () => {
		if (totalRows == null) return;
		render();
		const firstVis = Math.floor(scrollElem.scrollTop / rowHeight);
		const visCount = Math.ceil(scrollElem.clientHeight / rowHeight);
		const start = Math.max(0, firstVis - bufRows);
		const end = Math.min(totalRows - 1, firstVis + visCount + bufRows);
		debFetch(firstMissing(
			start,
			Math.min(totalRows - 1, end + prefetchRows),
		));
		stopDebounced(firstVis);
	};

	/* ----------------------------- resize handler */
	const onResize = () => {
		/* If we are still in skeleton phase, refresh skeleton length */
		if (totalRows == null) {
			skeletonInit();
		} else {
			render();
			const firstVis = Math.floor(scrollElem.scrollTop / rowHeight);
			const visCount = Math.ceil(scrollElem.clientHeight / rowHeight);
			const start = Math.max(0, firstVis - bufRows);
			const end = Math.min(totalRows - 1, firstVis + visCount + bufRows);
			debFetch(firstMissing(
				start,
				Math.min(totalRows - 1, end + prefetchRows),
			));
		}
	};

	let resizeCleanup;
	(function attachResize() {
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(onResize);
			ro.observe(scrollElem);
			resizeCleanup = () => ro.disconnect();
		} else {
			on('resize', window, onResize);
			resizeCleanup = () => off('resize', window, onResize);
		}
	})();

	/* ----------------------------- init */
	skeletonInit();
	fetchOnInit().then((result) => {
		let rows, providedTotal;
		if (Array.isArray(result)) {
			rows = result;
			providedTotal = rows.length;
		} else if (
			result && Array.isArray(result.rows) &&
			typeof result.totalRows === 'number'
		) {
			rows = result.rows;
			providedTotal = result.totalRows;
		} else {
			throw new Error('fetchOnInit must return array or { totalRows, rows }');
		}

		totalRows = providedTotal;
		cache = new Array(totalRows);
		if (buildIndex) indexMap = new Map();
		installRows(0, rows);
		render();
		on('scroll', scrollElem, onScroll);
	});

	function skeletonInit() {
		const n = Math.ceil(scrollElem.clientHeight / rowHeight) + bufRows;
		const sk = Array(n).fill(0).map((_, i) => renderSkeleton(rowHeight, i)).join('');
		contentElem.innerHTML = sk;
	}
	function installRows(offset, rows) {
		for (let i = 0; i < rows.length && offset + i < totalRows; i++) {
			setRow(offset + i, normalizeRow(offset + i, rows[i]));
		}
	}

	/* ===================================================== */
	/* ------------------------  public API ---------------- */
	/* ===================================================== */

	/* insert rows at index (default append) */
	this.insert = (rows, offset = totalRows) => {
		if (!Array.isArray(rows) || rows.length === 0) return;
		if (offset < 0 || offset > totalRows) offset = totalRows;

		const wasEmpty = totalRows === 0;
		const htmlRows = rows.map((r, i) => normalizeRow(offset + i, r));
		cache.splice(offset, 0, ...htmlRows);
		if (buildIndex) rebuildIndex(offset);

		totalRows += htmlRows.length;
		if (wasEmpty) render(); // replace empty state
		else if (rangeVisible(offset, offset + htmlRows.length - 1)) render();
		else adjustBottomSpace();
	};

	/* update rows by id or index; rowsArr = [{ index, data }] or [{ id, data }] */
	this.update = (rowsArr) => {
		let dirty = false;
		rowsArr.forEach((obj) => {
			let idx = obj.index;
			if (idx == null && buildIndex) idx = indexMap.get(obj.id);
			if (idx != null && idx >= 0 && idx < totalRows) {
				setRow(idx, normalizeRow(idx, obj.data));
				if (rangeVisible(idx, idx)) dirty = true;
			}
		});
		if (dirty) render();
	};

	/* delete rows by indices array or ids array */
	this.delete = (keys) => {
		if (!keys?.length) return;
		const indices = resolveIndices(keys).sort((a, b) => b - a);
		if (!indices.length) return;
		let dirty = false;
		indices.forEach((idx) => {
			cache.splice(idx, 1);
			if (buildIndex) {
				indexMap.forEach((v, k) => {
					if (v === idx) indexMap.delete(k);
					else if (v > idx) indexMap.set(k, v - 1);
				});
			}
			if (!dirty && rangeVisible(idx, idx)) dirty = true;
		});
		totalRows -= indices.length;

		if (totalRows === 0) render(); // switch to empty state
		else if (dirty) render();
		else adjustBottomSpace();
	};

	/* filter / search: start over with new data */
	this.applyFilter = (newTotal, rows = []) => {
		off('scroll', scrollElem, onScroll);
		totalRows = newTotal;
		cache = new Array(totalRows);
		if (buildIndex) indexMap = new Map();
		installRows(0, rows);
		scrollElem.scrollTop = 0;
		render();
		on('scroll', scrollElem, onScroll);
	};

	/* full cache eviction (keeping counts) */
	this.invalidateCache = () => {
		cache.forEach((c) => {
			if (c) c.ts = 0;
		});
		render();
	};

	/* scroll helper */
	this.scrollToRow = (idx, smooth = true) => {
		if (idx < 0 || idx >= totalRows) return;
		const top = idx * rowHeight;
		if (smooth && 'scrollTo' in scrollElem) {
			scrollElem.scrollTo({ top, behavior: 'smooth' });
		} else scrollElem.scrollTop = top;
	};

	/* renderEmptyState helper */
	this.renderEmptyState = (renderer) => {
		if (renderer != null) {
			if (typeof renderer === 'function') {
				renderEmptyStateFn = renderer;
			} else if (typeof renderer === 'string') {
				const html = renderer;
				renderEmptyStateFn = () => html;
			} else {
				throw new Error('renderEmptyState expects function or string');
			}
		}
		if (totalRows === 0) {
			contentElem.innerHTML = renderEmptyStateFn();
		} else {
			render();
		}
	};

	/* manual height recalculation for edge cases */
	this.recalculateHeight = onResize;

	/* scrollingProgress API
     call: cluster.scrollingProgress(cb)
           cb receives (firstVisibleRowIndex)
           pass null to remove listener */
	this.scrollingProgress = (cb) => {
		if (cb == null) {
			scrollProgressCb = null;
		} else if (typeof cb === 'function') {
			scrollProgressCb = cb;
			lastProgressRow = -1; // reset so next render not skipped
			render(); // immediately notify with current state
		} else {
			throw new Error('scrollingProgress expects function or null');
		}
	};

	/* misc */
	this.destroy = () => {
		off('scroll', scrollElem, onScroll);
		if (resizeCleanup) resizeCleanup();
		cache = [];
		indexMap = null;
		contentElem.innerHTML = '';
	};
	this.refresh = render;
	this.getLoadedCount = () => cache.reduce((n, r) => n + (isLive(r) ? 1 : 0), 0);

	/* ------------------- helpers for public API ------------------- */
	function rangeVisible(from, to) {
		const firstVis = Math.floor(scrollElem.scrollTop / rowHeight) - bufRows;
		const lastVis = firstVis + Math.ceil(scrollElem.clientHeight / rowHeight) +
			bufRows * 2;
		return !(to < firstVis || from > lastVis);
	}
	function adjustBottomSpace() {
		render();
	} // easiest safe way
	function rebuildIndex(start) {
		for (let i = start; i < cache.length; i++) {
			const r = cache[i];
			if (r?.key != null) indexMap.set(r.key, i);
		}
	}
	function resolveIndices(arr) {
		if (typeof arr[0] === 'number') return arr;
		if (!buildIndex) return [];
		return arr.map((k) => indexMap.get(k)).filter((i) => i != null);
	}

	/* debug exposure */
	this._dump = () => ({
		totalRows,
		cache,
		index: buildIndex ? indexMap : null,
	});
}

/* UMD global attach */
// @ts-ignore - window is defined in the browser
if (typeof window !== 'undefined') window.Clusterize = Clusterize;
export default Clusterize;
