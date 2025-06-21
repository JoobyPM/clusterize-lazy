/* Import the ESM bundle of the new build (change version tag as you publish) */
import Clusterize from 'https://unpkg.com/clusterize-lazy@1/dist/index.esm.js';

const PAGE_SIZE = 20;
const ROW_H     = 96;

/* Demo state */
let totalRows      = 0;
let requestCounter = 0;
let firstVisible   = 0;

/* DOM shortcuts */
const progressEl = document.getElementById('progress');
const requestsEl = document.getElementById('requests');
function updateStats() {
  progressEl.textContent = `Row ${firstVisible + 1} / ${totalRows}`;
  requestsEl.textContent = `Requests: ${requestCounter}`;
}

/* Network helper */
async function fetchSlice(offset, size = PAGE_SIZE) {
  requestCounter += 1;
  updateStats();

  const start = Math.floor(offset / PAGE_SIZE) * PAGE_SIZE;
  const url   = `https://dummyjson.com/quotes?skip=${start}&limit=${size}`;
  const resp = await fetch(url);
  const json = await resp.json();               // We expect { quotes, total, skip, limit }

  if (totalRows === 0) totalRows = json.total;
  return json.quotes.slice(offset - start);                           // array of { id, quote, author }
}

/* Row renderers */
const skeletonRow = (h, i) => `
  <div class="px-6 py-4" data-index="${i}" style="height:${h}px">
    <div class="space-y-2 animate-pulse">
      <div class="h-4 w-3/4 bg-gray-200 rounded"></div>
      <div class="h-4 w-1/2 bg-gray-200 rounded"></div>
    </div>
  </div>`;

const renderRow = (i, q) => `
  <div class="px-6 py-4 hover:bg-slate-50" data-index="${i}" style="min-height:${ROW_H}px">
    <p class="text-gray-700 italic mb-2">"${q.quote}"</p>
    <p class="text-sm text-gray-500">- ${q.author}</p>
  </div>`;

/* Clusterize-Lazy instance */
const cluster = Clusterize({
  debug: true,
  rowHeight  : ROW_H,
  scrollElem : document.getElementById('scroll'),
  contentElem: document.getElementById('content'),

  fetchOnInit : async () => {
    const firstBatch = await fetchSlice(0);
    return { totalRows, rows: firstBatch };
  },
  fetchOnScroll   : fetchSlice,
  renderSkeletonRow: skeletonRow,
  renderRaw       : renderRow,

  /* live progress */
  scrollingProgress: firstVisibleIndex => {
    firstVisible = firstVisibleIndex;
    updateStats();
  }
});

/* zero out UI */
updateStats();

/* expose for console tinkering */
globalThis['cluster'] = cluster;
