/* Import the ESM bundle directly from the CDN */
import Clusterize from 'https://unpkg.com/clusterize-lazy@0.1/dist/clusterize.esm.js';

const PAGE_SIZE = 20;          // rows per request
const ROW_H     = 96;          // fixed row height in px

// Simple state tracking, for demo purposes
let totalRows       = 0;       // filled after the first fetch
let requestCounter  = 0;       // increments on every fetch
let firstVisible    = 0;       // updated by scrollingProgress

/* UI helpers ----------------------------------------------------------- */
const progressEl = document.getElementById('progress');
const requestsEl = document.getElementById('requests');

function updateStats() {
  progressEl.textContent = `Row ${firstVisible + 1} / ${totalRows}`;
  requestsEl.textContent = `Requests: ${requestCounter}`;
}

/* Network fetch -------------------------------------------------------- */
async function fetchSlice(offset, size = PAGE_SIZE) {
  requestCounter += 1;
  updateStats();

  const url = `https://dummyjson.com/quotes?limit=${size}&skip=${offset}&select=quote,author`;
  const res = await fetch(url);
  const json = await res.json();// expected: { quotes, total, skip, limit }

  if (totalRows === 0) totalRows = json.total;   // capture grand total once
  return json.quotes;                           // array of { id, quote, author }
}

/* Renderers ------------------------------------------------------------ */
const skeletonRow = h => `
  <div class="px-6 py-4" style="height:${h}px">
    <div class="space-y-2 animate-pulse">
      <div class="h-4 w-3/4 bg-gray-200 rounded"></div>
      <div class="h-4 w-1/2 bg-gray-200 rounded"></div>
    </div>
  </div>`;

const renderRow = (i, q) => `
  <div class="px-6 py-4 hover:bg-slate-50" style="height:${ROW_H}px">
    <p class="text-gray-700 italic mb-2">"${q.quote}"</p>
    <p class="text-sm text-gray-500">- ${q.author}</p>
  </div>`;

/* Clusterize-Lazy instance -------------------------------------------- */
const cluster = new Clusterize({
  rowHeight: ROW_H,
  scrollElem: document.getElementById('scroll'),
  contentElem: document.getElementById('content'),

  /* first request supplies rows and total */
  fetchOnInit: async () => {
    const firstBatch = await fetchSlice(0);
    return { totalRows, rows: firstBatch };
  },

  /* later requests fetch additional rows only */
  fetchOnScroll: fetchSlice,

  renderSkeletonRow: skeletonRow,
  renderRaw: renderRow,

  /* continuous progress update while scrolling */
  scrollingProgress: (firstIndex) => {
    firstVisible = firstIndex;
    updateStats();
  }
});

/* start with zeroed stats */
updateStats();

/* expose for console experimentation */
window.cluster = cluster;
