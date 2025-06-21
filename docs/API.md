# Clusterize-Lazy full API reference

> Version: 0.1.2 (June 21, 2025)

Clusterize‑Lazy is a light virtual‑scroll helper that lets you work with very large lists in browsers, Deno, or Node. This document expands the quick synopsis found in the README and covers every option, method, and callback in detail.

## Table of contents

1. [Constructor](#constructor)
2. [Options](#options)
3. [Public methods](#public-methods)
4. [Callbacks](#callbacks)
5. [Helper utilities](#helper-utilities)
6. [Events](#events)
7. [Examples](#examples)
8. [TypeScript support](#typescript-support)
9. [FAQ](#faq)

## Constructor

```js
import Clusterize from 'clusterize-lazy';

const cluster = new Clusterize(options);
```

Calling `Clusterize(options)` without `new` works too; the factory returns an instance for convenience.

## Options

### Required

| Name                | Type                                                               | Description                                                            |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `rowHeight`         | `number`                                                           | Fixed pixel height of a single row (must be constant).                 |
| `fetchOnInit`       | `() => Promise<RowArray \| { totalRows: number, rows: RowArray }>` | Supplies the initial batch or the total count plus first rows.         |
| `fetchOnScroll`     | `(offset: number) => Promise<RowArray>`                            | Called when the viewport needs more data (offset is zero‑based index). |
| `renderSkeletonRow` | `(height: number, index: number) => string`                        | Returns placeholder HTML while a row is still loading.                 |

### Optional

| Name                | Type                                       | Default                   | Description                                                              |
| ------------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------ |
| `renderRaw`         | `(index: number, data: RowData) => string` | `null`                    | Required only when the fetchers return objects instead of HTML strings.  |
| `scrollElem`        | `HTMLElement`                              | element with id `scroll`  | Scrollable container.                                                    |
| `scrollId`          | `string`                                   | `undefined`               | Id of the scroll element (alt to `scrollElem`).                          |
| `contentElem`       | `HTMLElement`                              | element with id `content` | Element to which rows are injected.                                      |
| `contentId`         | `string`                                   | `undefined`               | Id of the content element (alt to `contentElem`).                        |
| `debounceMs`        | `number`                                   | `120`                     | Debounce delay for scroll‑driven fetches.                                |
| `buffer`            | `number`                                   | `5`                       | Extra rows rendered above and below current viewport.                    |
| `prefetchRows`      | `number`                                   | `buffer` value            | Extra rows to prefetch ahead of viewport for smoother scrolling.         |
| `cacheTTL`          | `number`                                   | `300000` (5 minutes)      | Lifetime of a cached row in milliseconds. Older rows will be re‑fetched. |
| `autoEvict`         | `boolean`                                  | `false`                   | Enable automatic cache eviction based on `cacheTTL`.                     |
| `buildIndex`        | `boolean`                                  | `false`                   | Build a primary‑key index to enable `update` and `delete` by id.         |
| `primaryKey`        | `string`                                   | `"id"`                    | Field name used when `buildIndex` is true.                               |
| `onScrollFinish`    | `(firstVisibleRow: number) => void`        | no‑op                     | Invoked when the user stops scrolling (after 100 ms of inactivity).      |
| `scrollingProgress` | `(firstVisibleRow: number) => void`        | `null`                    | Continuous progress callback. See [Callbacks](#callbacks).               |
| `renderEmptyState`  | `(() => string) \| string`                 | Built‑in "No data" block  | Customize empty list renderer.                                           |

## Public methods

| Method              | Signature / return                                                    | Description                                                                                                            |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `insert`            | `(rows: RowArray, offset?: number) => void`                           | Insert new rows starting at the provided offset (default append). The list length grows.                               |
| `update`            | `(updates: { index?: number; id?: IdType; data: RowData }[]) => void` | Replace existing rows in place. Each update may reference by index or by id (requires `buildIndex`).                   |
| `delete`            | `(indicesOrIds: (number \| IdType)[]) => void`                        | Remove rows by index or id. Offsets shift accordingly.                                                                 |
| `applyFilter`       | `(newTotal: number, rows?: RowArray) => void`                         | Reset the list with a new total and optional first rows (useful for search or server filtering). Scroll resets to top. |
| `invalidateCache`   | `() => void`                                                          | Mark every cached row as stale, forcing future fetches. Counts remain intact.                                          |
| `scrollToRow`       | `(index: number, smooth = true) => void`                              | Programmatically scroll the list so that the row starts at the top edge.                                               |
| `renderEmptyState`  | `(renderer: (() => string) \| string \| null) => void`                | Change or restore the empty‑state renderer. Rerenders immediately if list is empty.                                    |
| `recalculateHeight` | `() => void`                                                          | Manually trigger a resize recalculation (useful after CSS changes).                                                    |
| `scrollingProgress` | `(cb: ((firstVisibleRow: number) => void) \| null) => void`           | Set or clear the continuous progress callback; fires immediately with current value.                                   |
| `refresh`           | `() => void`                                                          | Force a synchronous re‑render using the current cache.                                                                 |
| `getLoadedCount`    | `() => number`                                                        | Returns how many rows are currently live in the cache.                                                                 |
| `destroy`           | `() => void`                                                          | Detach all listeners and wipe DOM, cache, and index. Instance becomes inert.                                           |

## Callbacks

### `fetchOnInit()`

- **Signature**: `() => Promise<RowArray \| { totalRows: number, rows: RowArray }>`
- **When**: once during construction.
- May return a plain array, in which case its length is taken as `totalRows`, or an object with explicit `totalRows`.

### `fetchOnScroll(offset)`

- **Signature**: `(offset: number) => Promise<RowArray>`
- **Offset** is the zero‑based index of the first missing row Clusterize wants.
- The promise may resolve to fewer rows than finally needed; Clusterize will retry for the remainder.

### `renderSkeletonRow(height, index)`

Return placeholder HTML while data is loading. Commonly a shimmering grey bar.

### `renderRaw(index, data)`

Convert a row object to HTML. Not required when the fetchers already deliver HTML strings.

### `scrollingProgress(firstVisibleRow)`

Continuous hook invoked on every render when the first visible row changes. Use this for scroll analytics or lazy image groups.

### `onScrollFinish(firstVisibleRow)`

Debounced version that fires once after the user has stopped scrolling for 100 ms.

## Helper utilities

Clusterize‑Lazy intentionally exposes no hidden helpers. The only diagnostic helper is `getLoadedCount()`.

## Events

No DOM events are emitted. Interaction is purely via the public API and callbacks.

## Examples

### Basic finite list

```html
<div id="scroll" style="height: 250px; overflow: auto">
	<div id="content"></div>
</div>
<script type="module">
	import Clusterize from './dist/clusterize.esm.js';

	const API = 'https://dummyjson.com/users';

	const cluster = new Clusterize({
		rowHeight: 40,
		scrollElem: document.getElementById('scroll'),
		contentElem: document.getElementById('content'),
		fetchOnInit: () => fetch(API).then((r) => r.json()),
		fetchOnScroll: () => Promise.resolve([]), // finite list
		renderSkeletonRow: (h) => `<div class="skl" style="height:${h}px"></div>`,
		renderRaw: (i, u) => `<div>${i + 1}. ${u.firstName} ${u.lastName}</div>`,
	});
</script>
```

### Infinite scrolling with server paging

```js
const PAGE = 40;
const cluster = new Clusterize({
	rowHeight: 28,
	fetchOnInit: async () => {
		const res = await fetchPage(0);
		return { totalRows: res.total, rows: res.items };
	},
	fetchOnScroll: fetchPage,
	renderSkeletonRow: (h) => `<div class="skl" style="height:${h}px"></div>`,
	renderRaw: (i, row) => `<div>${row.title}</div>`,
});

function fetchPage(offset) {
	return fetch(`/api/items?offset=${offset}&size=${PAGE}`)
		.then((r) => r.json())
		.then((res) => res.items);
}
```

## TypeScript support

The package ships a handcrafted `types/index.d.ts`. Simply importing `clusterize-lazy` provides full typings in editors for both Deno and Node.

## FAQ

### Why a fixed `rowHeight` and not auto‑measured?

Auto‑measurement causes layout thrashing and hurts performance. A constant height lets Clusterize‑Lazy compute paddings instantly without reading layout.

### How do I style the skeleton rows differently per theme?

Return a class name or inline styles in `renderSkeletonRow`. The method receives the index so you can vary shimmer delays.

### Can I use React or Vue rows?

Yes. Render your component to an HTML string (ReactDOMServer or similar) and let Clusterize inject it. Hydrate only the rows inside the viewport to avoid heavy mounts.

### Is there built‑in keyboard navigation?

Clusterize sets `tabindex="0"` on the content container so it can receive focus. Combine it with `scrollToRow` for custom keyboard controls.

### How does cache eviction work?

When `autoEvict` is enabled, cached rows older than `cacheTTL` milliseconds are automatically evicted from memory. This prevents unbounded memory growth during long scrolling sessions. The default `cacheTTL` is 5 minutes (300,000 ms). Set `autoEvict: false` to disable eviction entirely.

### What's the difference between `buffer` and `prefetchRows`?

- `buffer`: Extra rows rendered above and below the viewport for smooth scrolling
- `prefetchRows`: Additional rows fetched ahead of time to prevent skeleton flashes during fast scrolling

By default, `prefetchRows` equals `buffer`, but you can tune them independently for optimal performance.

### How can I prevent skeleton flashes during fast scrolling?

Increase `prefetchRows` to fetch more data ahead of the viewport. The system automatically fetches `prefetchRows` beyond the current buffer zone, reducing the chance of showing skeleton rows during rapid scrolling.
