# Clusterize‑Lazy full API reference

> Version: 1.0.0 (June 12, 2025)

Clusterize‑Lazy is a light virtual‑scroll helper that lets you work with very large lists in browsers, Deno, or Node. This document expands the quick synopsis found in the README.md and covers every option, method, and callback in detail.

## Table of contents

1. [Constructor](#constructor)
2. [Options](#options)
3. [Public methods](#public-methods)
4. [Callbacks](#callbacks)
5. [Helper utilities](#helper-utilities)
6. [Events](#events)
7. [Examples](#examples)
8. [TypeScript support](#typescript-support)
9. [Frequently asked questions](#faq)

## Constructor

```js
import Clusterize from "clusterize-lazy";

const cluster = new Clusterize(options);
```

Calling `Clusterize(options)` without `new` works too; the factory returns an instance for convenience.

### Required options

| Name                | Type                                            | Description                                                                       |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `rowHeight`         | `number`                                        | Fixed pixel height of a single row (must be constant).                            |
| `fetchOnInit`       | `() => Promise<RowArray  { totalRows, rows }>\` | Supplies the initial batch or the total count plus first rows.                    |
| `fetchOnScroll`     | `(offset: number) => Promise<RowArray>`         | Called when the viewport needs more data (offset is zero‑based index to request). |
| `renderSkeletonRow` | `(height: number, index: number) => string`     | Returns placeholder HTML while a row is still loading.                            |

### Optional options

| Name                | Type                        | Default                  | Description                                                                                                 |
| ------------------- | --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `renderRaw`         | `(index, data) => string`   | `null`                   | Required only when `fetchOn*` return **objects** instead of HTML strings. Converts a data record into HTML. |
| `scrollElem`        | `HTMLElement`               | `#scroll` by id          | Scrollable container.                                                                                       |
| `contentElem`       | `HTMLElement`               | `#content` by id         | Element to which rows are injected.                                                                         |
| `debounceMs`        | `number`                    | `120`                    | Debounce delay for scroll‑driven fetches.                                                                   |
| `buffer`            | `number`                    | `5`                      | Extra rows rendered above and below current viewport.                                                       |
| `cacheTTL`          | `number`                    | `Infinity`               | Lifetime of a row in cache in milliseconds. Older rows will be re‑fetched.                                  |
| `buildIndex`        | `boolean`                   | `false`                  | Build a primary‑key index to enable `update` and `delete` by id.                                            |
| `primaryKey`        | `string`                    | `'id'`                   | Field name used when `buildIndex` is true.                                                                  |
| `onScrollFinish`    | `(firstVisibleRow) => void` | `noop`                   | Invoked when user stops scrolling (after 100 ms of inactivity).                                             |
| `scrollingProgress` | `(firstVisibleRow) => void` | `null`                   | Continuous progress callback. See [Callbacks](#callbacks).                                                  |
| `renderEmptyState`  | `() => string` or `string`  | Built‑in "No data" block | Customize empty list renderer.                                                                              |

## Public methods

| Method              | Signature / return                                                    | Description                                                                                                              |                                                                                      |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `insert`            | `(rows: RowArray, offset?: number) => void`                           | Insert new rows starting at the provided offset (default append). The list length grows.                                 |                                                                                      |
| `update`            | `(updates: { index?: number; id?: IdType; data: RowData }[]) => void` | Replace existing rows in place. Each update may reference by index or by id (requires `buildIndex`).                     |                                                                                      |
| `delete`            | \`(indicesOrIds: (number                                              | IdType)\[]) => void\`                                                                                                    | Remove rows by index or id. Offsets shift accordingly.                               |
| `applyFilter`       | `(newTotal: number, rows?: RowArray) => void`                         | Reset the list with a new total and optional first rows (useful for search or server filtering). Scroll is reset to top. |                                                                                      |
| `invalidateCache`   | `() => void`                                                          | Mark every cached row as stale, forcing future fetches. Counts remain intact.                                            |                                                                                      |
| `scrollToRow`       | `(index: number, smooth = true) => void`                              | Programmatically scroll the list so that the row starts at the top edge.                                                 |                                                                                      |
| `renderEmptyState`  | \`(renderer: (() => string)                                           | string) => void\`                                                                                                        | Change or restore the empty‑state renderer. Rerenders immediately if list is empty.  |
| `recalculateHeight` | `() => void`                                                          | Manually trigger a resize recalculation (edge cases like changing CSS).                                                  |                                                                                      |
| `scrollingProgress` | \`(cb: ((firstVisibleRow) => void)                                    | null) => void\`                                                                                                          | Set or clear the continuous progress callback; fires immediately with current value. |
| `refresh`           | `() => void`                                                          | Force a synchronous re‑render using current cache.                                                                       |                                                                                      |
| `getLoadedCount`    | `() => number`                                                        | Returns how many rows are currently live in the cache.                                                                   |                                                                                      |
| `destroy`           | `() => void`                                                          | Detach all listeners and wipe DOM, cache, and index. Instance becomes inert.                                             |                                                                                      |

## Callbacks

### `fetchOnInit()`

* **Signature**: `() => Promise<RowArray | { totalRows: number, rows: RowArray }>`
* **Called** once during construction.
* May return a simple array, in which case the length is taken as total, **or** an object with explicit `totalRows` field (allowing partial first page).

### `fetchOnScroll(offset)`

* **Signature**: `(offset: number) => Promise<RowArray>`
* **Offset** is zero‑based index of the first missing row the component wants.
* The promise may resolve to **fewer** rows than eventually needed; the component will retry for remaining ones.

### `renderSkeletonRow(height, index)`

Returns placeholder HTML while data is loading. Usually a grey bar skeleton.

### `renderRaw(index, data)`

If your rows are objects, convert to HTML here. Not required when `fetchOn*` already deliver HTML strings.

### `scrollingProgress(firstVisibleRow)`

A continuous hook invoked on every render when the first visible row changes. Use this for scroll‑based analytics or lazy image groups.

### `onScrollFinish(firstVisibleRow)`

Debounced version that fires once after the user has stopped scrolling for 100 ms.

## Helper utilities

Clusterize‑Lazy intentionally exposes no hidden helpers; everything is encapsulated. The only helper‑like public method is `getLoadedCount()` for diagnostics.

## Events

There are no DOM events emitted; interaction is purely via callbacks described above.

## Examples

### Basic finite list

```html
<div id="scroll" style="height:250px;overflow:auto">
  <div id="content"></div>
</div>
<script type="module">
  import Clusterize from "./dist/clusterize.esm.js";

  const API = "https://dummyjson.com/users";

  const cluster = new Clusterize({
    rowHeight: 40,
    scrollElem: document.getElementById("scroll"),
    contentElem: document.getElementById("content"),
    fetchOnInit: () => fetch(API).then(r => r.json()),
    fetchOnScroll: () => Promise.resolve([]), // finite list
    renderSkeletonRow: h => `<div class="skl" style="height:${h}px"></div>`,
    renderRaw: (i, u) => `<div>${i + 1}. ${u.firstName} ${u.lastName}</div>`
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
  renderRaw: (i, row) => `<div>${row.title}</div>`
});

function fetchPage(offset) {
  return fetch(`/api/items?offset=${offset}&size=${PAGE}`)
    .then(r => r.json())
    .then(res => res.items);
}
```

## TypeScript support

The project ships a handcrafted `types/index.d.ts`. Pointing `types` in `package.json` there lets both Deno and Node resolve typings automatically.


## FAQ

### Why a fixed `rowHeight` and not auto‑measured?

Auto measurement costs layout thrashing and hurts performance. A strict height lets Clusterize‑Lazy compute paddings instantly without reading layout.

### How do I style the skeleton rows differently per theme?

Return a class name or inline styles in `renderSkeletonRow`. The method receives the index so you can vary shimmer delays.

### Can I use React or Vue rows?

Yes. Render your component to an HTML string (ReactDOMServer or similar) and let Clusterize inject it. Remember to hydrate only the visible part of the list to avoid heavy mounts.

### Is there built‑in keyboard navigation?

The component sets `tabindex="0"` on the content container so it can receive focus. Combine with `scrollToRow` for custom keyboard controls.
