# Clusterize-Lazy

A minimal yet powerful virtual scroll helper written in plain ES modules.

* **Zero dependencies** - ships as a single file
* **Browser‑first** - works in all modern browsers without build steps and also exposes `window.Clusterize` for classic `<script>` usage
* **End‑to‑end lazy fetch** - wire `fetchOnInit` and `fetchOnScroll` once and forget
* **Skeleton rows** - delightful UX while data streams in
* **Primary‑key index** - optional O(1) updates and deletes when your rows have unique ids

[![bundle size](https://img.shields.io/bundlephobia/minzip/clusterize-lazy?label=gzip)](https://bundlephobia.com/result?p=clusterize-lazy)
[![license](https://img.shields.io/github/license/JoobyPM/clusterize-lazy)](LICENSE)

## Live demo
Check out the interactive quotes list powered by Clusterize-Lazy on GitHub Pages:
[https://joobypm.github.io/clusterize-lazy/examples/quotes.html](https://joobypm.github.io/clusterize-lazy/examples/quotes.html)
(works in any modern browser without a build step; source lives in `examples/`).

## Installation

### npm / Yarn / pnpm

```bash
npm i clusterize-lazy
```

```js
import Clusterize from "clusterize-lazy";
```

### Deno (via esm.sh)

```ts
import Clusterize from "https://esm.sh/clusterize-lazy@0.1";
```

### Plain `<script>` tag

```html
<script src="https://unpkg.com/clusterize-lazy/dist/clusterize.min.js"></script>
<!-- window.Clusterize available -->
```

## Quick start

```html
<div id="scroll" style="height:300px;overflow:auto">
  <div id="content"></div>
</div>

<script type="module">
  import Clusterize from "./dist/clusterize.esm.js";

  const cluster = new Clusterize({
    rowHeight: 28,
    scrollElem: document.getElementById("scroll"),
    contentElem: document.getElementById("content"),

    // initial batch
    fetchOnInit: async () => ({
      totalRows: 1000,
      rows: await fetchRows(0, 40)
    }),

    // subsequent lazy batches
    fetchOnScroll: fetchRows,

    renderSkeletonRow: (h, i) => `<div class="skeleton" style="height:${h}px"></div>`,

    renderRaw: (idx, data) => `<div>${idx}: ${data.name}</div>`
  });

  function fetchRows(offset, size = 40) {
    return fetch(`/api/items?offset=${offset}&size=${size}`).then(r => r.json());
  }
</script>
```

## API overview (quick reference)

| Name / method                    | Type / signature                                   | Purpose                             |
| -------------------------------- | -------------------------------------------------- | ----------------------------------- |
| `rowHeight` **required**         | `number`                                           | Fixed row height in px              |
| `fetchOnInit` **required**       | `() => Promise<RowArray \| { totalRows, rows }>`   | Initial dataset or count            |
| `fetchOnScroll` **required**     | `(offset) => Promise<RowArray>`                    | Lazy fetch for missing rows         |
| `renderSkeletonRow` **required** | `(height, index) => string`                        | Placeholder HTML while loading      |
| `renderRaw`                      | `(index, data) => string`                          | Render row objects                  |
| `buffer`                         | `number` (default 5)                               | Extra rows above and below viewport |
| `cacheTTL`                       | `number` ms or `Infinity`                          | Controls stale row eviction         |
| `debounceMs`                     | `number` (default 120)                             | Debounce for scroll driven fetches  |
| `buildIndex`                     | `boolean`                                          | Enable primary‑key index            |
| DOM hooks                        | `scrollElem`/`scrollId`, `contentElem`/`contentId` | Pass elements or their ids          |
| `insert(rows, offset?)`          | `(RowArray, number)`                               | Insert new rows                     |
| `update(updates)`                | `({index, id, data}[])`                            | Replace rows in place               |
| `delete(keys)`                   | `(number[] \| IdType[])`                           | Remove rows by index or id          |
| `applyFilter()`                  | `(newTotal, rows?)`                                | Reset with a new dataset            |
| `invalidateCache()`              | `void`                                             | Force refetch of everything         |
| `scrollToRow(idx, smooth)`       | `(number, boolean)`                                | Programmatic scroll                 |
| `renderEmptyState(renderer)`     | `(() => string) \| string \| null`                 | Set or restore empty‑state renderer |
| `recalculateHeight()`            | `void`                                             | Manual resize adjustment            |
| `scrollingProgress(cb)`          | `((firstVisibleRow) => void) \| null`              | Continuous scroll progress          |
| `refresh()`                      | `void`                                             | Force synchronous re‑render         |
| `getLoadedCount()`               | `() => number`                                     | Rows currently live in cache        |
| `destroy()`                      | `void`                                             | Tear down listeners and DOM         |

See [docs/API.md](docs/API.md) for the full contract.

## Contributing

1. `git clone https://github.com/JoobyPM/clusterize-lazy.git`
2. `pnpm i` or `npm i`
3. `pnpm test` - runs Deno and Node test suites
4. `pnpm build` - outputs `dist/` bundles
5. Open a pull request targeting the `main` branch

We follow Conventional Commits and SemVer. Releases are automated with release‑please.

## License

MIT © 2025 JoobyPM
