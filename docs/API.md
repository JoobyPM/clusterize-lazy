# Clusterize-Lazy - API (v1 · 2025-06-21)

This document details every option, callback and method exposed by the
current implementation (`src/core/ClusterizeLazy.ts`). Anything not
listed here is **not** a public contract.

## 1. Constructor / factory

```ts
import Clusterize from 'clusterize-lazy';

const cluster = Clusterize(options);
```

Both calls return an _instance_ of `ClusterizeLazy`.

## 2. Options

| Name ★ = required      | Type                                                        | Default            | Description                                                                                                                         |
| ---------------------- | ----------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **rowHeight★**         | `number`                                                    | -                  | Estimated row height in pixels. Column auto-sizes still work - the measurement is only an initial guess.                            |
| **fetchOnInit★**       | `() ⇒ Promise<Row[] \| { totalRows: number; rows: Row[] }>` | -                  | First batch. Return an array if you already have the full data, or an object `{ totalRows, rows }` to trigger further lazy loading. |
| **fetchOnScroll★**     | `(offset: number) ⇒ Promise<Row[]>`                         | -                  | Called when a missing gap becomes visible. `offset` is the index to start from.                                                     |
| **renderSkeletonRow★** | `(height: number, index: number) ⇒ string`                  | -                  | Placeholder HTML for a row that is still loading.                                                                                   |
| **renderRaw**          | `(index: number, row: Row) ⇒ string`                        | `undefined`        | Render function for _object_ rows. Not needed if `fetch*` already returns ready HTML strings.                                       |
| **scrollElem★**        | `HTMLElement`                                               | -                  | Scroll container (the element with `overflow:auto`).                                                                                |
| **contentElem★**       | `HTMLElement`                                               | -                  | Inner element that receives the rows.                                                                                               |
| **buffer**             | `number`                                                    | `5`                | Rows rendered above / below the viewport.                                                                                           |
| **prefetchRows**       | `number`                                                    | _same as_ `buffer` | Rows fetched ahead of viewport.                                                                                                     |
| **debounceMs**         | `number`                                                    | `120`              | Wait time after the user stops scrolling before fetching.                                                                           |
| **cacheTTL**           | `number`                                                    | `300 000` (5 min)  | How long a cached row stays "fresh".                                                                                                |
| **autoEvict**          | `boolean`                                                   | `false`            | Drop rows older than `cacheTTL` automatically.                                                                                      |
| **showInitSkeletons**  | `boolean`                                                   | `true`             | Paint skeletons immediately while the first batch loads.                                                                            |
| **debug**              | `boolean`                                                   | `false`            | Logs every significant action to `console.log`.                                                                                     |
| **scrollingProgress**  | `(firstVisibleIdx: number) ⇒ void`                          | -                  | Fires on every render with the topmost visible row index.                                                                           |

## 3. Public methods

| Method           | Signature                               | Notes                                                       |
| ---------------- | --------------------------------------- | ----------------------------------------------------------- |
| `refresh`        | `() ⇒ void`                             | Force a synchronous re-render using whatever is in cache.   |
| `scrollToRow`    | `(index: number, smooth = true) ⇒ void` | Scroll programmatically; `smooth = false` for instant jump. |
| `getLoadedCount` | `() ⇒ number`                           | Rows currently cached (useful for progress bars).           |
| `destroy`        | `() ⇒ void`                             | Detach observers, clear cache, make the instance inert.     |

> **Tip** - All methods are chain-agnostic; nothing returns `this`.

## 4. Callbacks

### `fetchOnInit()`

- **Runs** exactly once after construction (queued in a micro-task so the
  constructor remains synchronous).
- **Return** either:

  - `Row[]` - if you already have everything
  - `{ totalRows, rows }` - to continue lazy loading

### `fetchOnScroll(offset)`

- **offset** - first missing row index Clusterize requests.
- You may return fewer rows than requested; the class will retry for the
  remainder on the next render.

### `renderSkeletonRow(height, index)`

- Keep it **lightweight** - this runs often during fast scrolling.

### `renderRaw(index, row)`

- Only required when row objects are used.

### `scrollingProgress(firstVisible)`

- Fires _after_ every DOM update.
  Use it for sticky section titles, analytics, lazy image decoding, etc.

## 5. Internal behaviour (high-level)

1. **Constructor**

   - Sets up `@tanstack/virtual-core`.
   - Optionally paints initial skeletons.
   - Schedules first fetch on `queueMicrotask`.
2. **Scroll** triggers the virtualizer which calls `render()`.
3. **render()**

   - Calculates visible range.
   - Inserts skeletons / cached rows.
   - Measures real DOM heights (dynamic rows supported).
   - Schedules a debounced fetch for the first missing gap.
4. **Fetch completes**

   - Cache is patched.
   - `render()` runs again to swap skeletons for real data.
5. **Optional eviction** keeps memory use bounded.

## 6. Type aliases

```ts
type RowLike = string | Record<string, unknown>;
type Clusterize<TRow = RowLike> = ClusterizeLazy<TRow>;
```

The generic lets you retain strong typing for your domain rows.

## 7. FAQ (abridged)

- **Does it work in Safari / Firefox?**
  Yes, any browser with `ResizeObserver` (all evergreen versions).

- **Can rows have variable height?**
  Yes - as soon as the real element is in the DOM it's measured and the
  virtualizer is informed.

- **How to hide the scroll bar?**
  Style `scrollElem` with `scrollbar-width:none` / WebKit overrides - the
  virtualizer is agnostic.

- **Why no update/insert/delete APIs?**
  The current scope focuses on read-only infinite scrolling.
  Mutable helpers may come later once the contract stabilises.

## 8. Acknowledgements

Clusterize-Lazy stands on the shoulders of
**[@tanstack/virtual-core](https://github.com/TanStack/virtual)** - an
excellent, framework-agnostic virtual list engine.
If this library helps you, please consider supporting TanStack.

## 9. License

MIT © 2025 JoobyPM
