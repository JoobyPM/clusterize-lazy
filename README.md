# Clusterize-Lazy

Vanilla-JS virtual list with lazy loading and initial skeletons.

<span id="size-badge">![gzip](https://img.shields.io/bundlephobia/minzip/clusterize-lazy?label=gzip)</span> ![MIT](https://img.shields.io/github/license/JoobyPM/clusterize-lazy)

`Clusterize-Lazy` lets you render **millions of rows** in a scrollable
container while downloading data only for what the user can actually
see. Its goal is an **easy, framework-agnostic** API that just works in
any modern browser - no build step required.

> Small footprint, great DX - powered by [@tanstack/virtual-core](https://github.com/TanStack/virtual)

<div align="center"><img src="docs/assets/demo.gif" width="600" alt="demo"/></div>

## Features

- **Single dependency** - relies on the rock-solid engine\
  `@tanstack/virtual-core` (thanks Tanner & the TanStack team!)
- **Dynamic row height** - actual DOM sizes are measured automatically
- **Lazy loading + skeletons** - smooth UX even on shaky connections
- **Typed from the ground up** - shipped `.d.ts` works in ESM browsers and legacy browsers (with polyfills)
- **Batteries included** - debug logging, auto cache eviction, progress callback

## Live demo

Test it instantly (no transpiler):\
<https://joobypm.github.io/clusterize-lazy/examples/quotes.html>

> Source lives in `docs/examples/`

## Installation

### pnpm / npm / Yarn

```bash
pnpm add clusterize-lazy
```

```js
import Clusterize from 'clusterize-lazy';
const cluster = Clusterize({...});
```

### `<script>` tag (UMD)

```html
<script src="https://unpkg.com/clusterize-lazy/dist/index.iife.js"></script>
<script>
  const cluster = Clusterize.default({...});
</script>
```

## 30-second example

```html
<div id="scroll" style="height: 320px; overflow: auto">
	<div id="content"></div>
</div>

<script type="module">
	import Clusterize from '/dist/index.esm.js';

	function fetchRows(offset, size = 40) {
		return fetch(`/api/items?skip=${offset}&limit=${size}`).then((r) => r.json());
	}

	const cluster = Clusterize({
		rowHeight: 32,
		scrollElem: document.getElementById('scroll'),
		contentElem: document.getElementById('content'),

		fetchOnInit: async () => {
			const rows = await fetchRows(0);
			return { totalRows: 50_000, rows };
		},
		fetchOnScroll: fetchRows,
		renderSkeletonRow: (h, i) => `<div class="skeleton" style="height:${h}px"></div>`,
		renderRaw: (i, row) => `<div>${i + 1}. ${row.title}</div>`,
	});
</script>
```

## Quick reference

| Option / method                   | Type / default                               | Purpose                                        |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| **required**                      |                                              |                                                |
| `rowHeight`                       | `number`                                     | Fixed row estimate (px)                        |
| `fetchOnInit()`                   | `() ⇒ Promise<Row[] \| { totalRows, rows }>` | First data batch _or_ rows + total count       |
| `fetchOnScroll(offset)`           | `(number) ⇒ Promise<Row[]>`                  | Fetches when a gap becomes visible             |
| `renderSkeletonRow(height,index)` | `(number,number) ⇒ string`                   | Placeholder HTML                               |
| **optional**                      |                                              |                                                |
| `renderRaw(index,data)`           | `(number,Row) ⇒ string` · `undefined`        | Row renderer for object data                   |
| `buffer`                          | `5`                                          | Rows rendered above/under viewport             |
| `prefetchRows`                    | `buffer`                                     | Rows fetched ahead of viewport                 |
| `debounceMs`                      | `120`                                        | Debounce between scroll & fetch                |
| `cacheTTL`                        | `300 000`                                    | Milliseconds before a cached row is stale      |
| `autoEvict`                       | `false`                                      | Drop stale rows automatically                  |
| `showInitSkeletons`               | `true`                                       | Paint skeletons immediately before first fetch |
| `debug`                           | `false`                                      | Console debug output                           |
| `scrollingProgress(cb)`           | `(firstVisible:number) ⇒ void`               | Fires on every render                          |
| **methods**                       |                                              |                                                |
| `refresh()`                       | `void`                                       | Force re-render                                |
| `scrollToRow(idx, smooth?)`       | `void` ( `true` = smooth)                    | Programmatic scroll                            |
| `getLoadedCount()`                | `number`                                     | How many rows are cached                       |
| `destroy()`                       | `void`                                       | Tear down listeners & cache                    |

> See [docs/API.md](docs/API.md) for the full contract.

## Contributing

```bash
git clone https://github.com/JoobyPM/clusterize-lazy.git
pnpm i
pnpm test      # vitest + jsdom
pnpm build     # tsup + esbuild
```

Formatting & linting are handled by **Deno** (`deno fmt`, `deno lint`).
Please follow Conventional Commits; releases are automated.

## Acknowledgements

_Huge shout-out to_ **\[@tanstack/virtual-core]** - Clusterize-Lazy is
basically a thin, opinionated shell around this fantastic engine.
If you need a React / Vue / Solid binding or more power, use the TanStack
package directly and consider sponsoring the project.

## License

MIT © 2025 JoobyPM
