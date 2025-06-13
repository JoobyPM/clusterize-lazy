# Clusterize-Lazy

A minimal yet powerful virtual scroll helper written in plain ES modules.

* **Zero dependencies** - ships as a single 6 kB minified file  
* **Deno + Node + Browser** - works everywhere out of the box  
* **End-to-end lazy fetch** - plug in `fetchOnInit` and `fetchOnScroll` and forget  
* **Skeleton rows** - smooth UX while data is streaming  
* **Index-based updates** - optional primary-key map for O(1) row mutation  

[![bundle size](https://img.shields.io/bundlephobia/minzip/clusterize-lazy?label=gzip)](https://bundlephobia.com/result?p=clusterize-lazy)
[![license](https://img.shields.io/github/license/JoobyPM/clusterize-lazy)](LICENSE)


## Installation

### NPM / Yarn / pnpm

```bash
npm i clusterize-lazy
````

```js
import Clusterize from "clusterize-lazy";
```

### Deno

```ts
import Clusterize from "https://esm.sh/clusterize-lazy@1";
```

### Plain `<script>` tag

```html
<script src="https://unpkg.com/clusterize-lazy/dist/clusterize.min.js"></script>
<!-- window.Clusterize is now available -->
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

    renderSkeletonRow: (h, i) =>
      `<div class="skeleton" style="height:${h}px"></div>`,

    renderRaw: (idx, data) => `<div>${idx}: ${data.name}</div>`
  });

  function fetchRows(offset, size = 40) {
    return fetch(`/api/items?offset=${offset}&size=${size}`)
           .then(r => r.json());
  }
</script>
```


## API overview

| Method / option            | Type / signature             | Purpose                             |                          |
| -------------------------- | ---------------------------- | ----------------------------------- | ------------------------ |
| `rowHeight` (required)     | `number`                     | Fixed row height in px              |                          |
| `fetchOnInit` (required)   | \`() => Promise\<Row\[]      | { totalRows, rows }>\`              | Initial dataset or count |
| `fetchOnScroll` (required) | `(offset) => Promise<Row[]>` | Lazy fetch for missing rows         |                          |
| `renderSkeletonRow`        | `(height, index) => string`  | Placeholder HTML while loading      |                          |
| `renderRaw`                | `(index, data) => string`    | Render object rows                  |                          |
| `buffer`                   | `number` (default 5)         | Extra rows above and below viewport |                          |
| `cacheTTL`                 | `number` ms or `Infinity`    | Controls stale row eviction         |                          |
| `insert(rows, offset?)`    | `(Row[], number)`            | Insert new rows                     |                          |
| `update(updates)`          | \`({index                    | id, data}\[])\`                     | Replace rows in place    |
| `delete(keys)`             | \`(number\[]                 | id\[])\`                            | Remove rows              |
| `invalidateCache()`        | `void`                       | Force refetch of everything         |                          |
| `scrollToRow(idx, smooth)` | `(number, boolean)`          | Scroll programmatically             |                          |
| `destroy()`                | `void`                       | Tear down listeners and DOM         |                          |

See [docs/API.md](docs/API.md) for the full contract.


## Contributing

1. `git clone https://github.com/JoobyPM/clusterize-lazy.git`
2. `pnpm i` or `npm i`
3. `pnpm test` - runs Deno and Node test suites
4. `pnpm build` - outputs `dist/` bundles
5. Open a pull request targeting the `main` branch

We follow Conventional Commits and SemVer. Releases are automated via release-please.


## License

MIT © 2025 JoobyPM
