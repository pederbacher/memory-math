// Shared code for all pages: loading data, drawing the two faces of a card,
// the collection being edited, and links that save files to GitHub.
// Needs the globals `math` (math.js) and `MathJax` (tex-svg), loaded by each page.

export const REPO = 'pederbacher/memory-math';
export const BRANCH = 'main';
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------- data

// Jekyll gives {id: {...}}, or null when the folder is empty
function toList(obj) {
  return Object.entries(obj || {}).map(([id, d]) => ({ id, ...d }));
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
}

export async function loadCards() {
  const cards = toList(await fetchJSON('data/cards.json'));
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCollections() {
  const cols = toList(await fetchJSON('data/collections.json'));
  return cols.sort((a, b) => a.name.localeCompare(b.name));
}

// x and y limits may be numbers or expressions such as "2*pi"
export function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : math.evaluate(String(v));
  if (typeof n !== 'number' || !isFinite(n)) throw new Error(`"${v}" is not a number`);
  return n;
}

// The file contents for a card or collection, keys in a fixed order
export function cardFile(c) {
  const keys = ['name', 'expression', 'tex', 'xmin', 'xmax', 'ymin', 'ymax', 'yticks', 'equalAspect', 'text', 'wikipedia'];
  const out = {};
  for (const k of keys) if (c[k] !== undefined && c[k] !== null && c[k] !== '' && c[k] !== false) out[k] = c[k];
  return JSON.stringify(out, null, 2) + '\n';
}

export function collectionFile(c) {
  return JSON.stringify({ name: c.name, description: c.description || '', cards: c.cards }, null, 2) + '\n';
}

// ---------------------------------------------------------------- GitHub

// Opens GitHub's "new file" page with name and contents filled in. Owners
// commit directly; anyone else gets a fork and a pull request.
export function newFileUrl(dir, filename, content, message) {
  const p = new URLSearchParams({ filename, value: content });
  if (message) p.set('message', message);
  return `https://github.com/${REPO}/new/${BRANCH}/${dir}?${p}`;
}

// GitHub can't prefill an edit, so the new contents go to the clipboard
export function editFileUrl(path) {
  return `https://github.com/${REPO}/edit/${BRANCH}/${path}`;
}

export function fileUrl(path) {
  return `https://github.com/${REPO}/blob/${BRANCH}/${path}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- draft collection

// The collection being edited, kept in the browser so it survives moving
// between pages. Falls back to memory when storage is blocked.
const DRAFT_KEY = 'memory-math-draft';
let memoryDraft = null;

export function getDraft() {
  try {
    const s = localStorage.getItem(DRAFT_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return memoryDraft;
  }
}

export function setDraft(d) {
  memoryDraft = d;
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage blocked: memoryDraft only */ }
}

// ---------------------------------------------------------------- drawing

const SIZE = 400;
const M = { left: 62, right: 16, top: 16, bottom: 62 };
const FONT = "'Palatino Linotype', Palatino, 'TeX Gyre Pagella', 'URW Palladio L', serif";

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const mag = 10 ** Math.floor(Math.log10(span / n));
  const step = [1, 2, 5, 10].map(f => f * mag).find(s => span / s <= n);
  const ticks = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) {
    ticks.push(+t.toPrecision(12));
  }
  return ticks;
}

function fmt(v) {
  return String(+v.toPrecision(6)).replace('-', '−');
}

function evalAt(code, x) {
  try {
    const v = code.evaluate({ x });
    return typeof v === 'number' && isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

// The graph face: an SVG string, white card with black ink.
// Throws if the expression or the limits can't be read.
export function graphSVG(card) {
  const code = math.compile(card.expression);
  const xmin = toNumber(card.xmin), xmax = toNumber(card.xmax);
  if (xmin === null || xmax === null || !(xmax > xmin)) throw new Error('x range: "from" must be smaller than "to"');
  let ymin = toNumber(card.ymin), ymax = toNumber(card.ymax);
  const fixedY = ymin !== null && ymax !== null;
  if (fixedY && !(ymax > ymin)) throw new Error('y range: "from" must be smaller than "to"');

  const n = 1001;
  const xs = Array.from({ length: n }, (_, i) => xmin + (xmax - xmin) * i / (n - 1));
  let ys = xs.map(x => evalAt(code, x));
  if (fixedY) {
    // Drop points far outside the y range, so asymptotes break the line
    const d = ymax - ymin;
    ys = ys.map(y => (y < ymin - d || y > ymax + d ? NaN : y));
  } else {
    const ok = ys.filter(isFinite);
    if (!ok.length) throw new Error('The expression has no real values in this x range');
    ymin = Math.min(...ok);
    ymax = Math.max(...ok);
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
  }

  // 4% padding on both axes, as R does
  const px = (xmax - xmin) * 0.04, py = (ymax - ymin) * 0.04;
  let x0 = xmin - px, x1 = xmax + px, y0 = ymin - py, y1 = ymax + py;
  const pw = SIZE - M.left - M.right, ph = SIZE - M.top - M.bottom;
  if (card.equalAspect) {
    // Same scale on both axes: widen whichever axis has room to spare
    const ux = (x1 - x0) / pw, uy = (y1 - y0) / ph;
    if (ux > uy) { const c = (y0 + y1) / 2, h = ux * ph / 2; y0 = c - h; y1 = c + h; }
    else { const c = (x0 + x1) / 2, h = uy * pw / 2; x0 = c - h; x1 = c + h; }
  }
  const sx = x => M.left + (x - x0) / (x1 - x0) * pw;
  const sy = y => M.top + (y1 - y) / (y1 - y0) * ph;

  let d = '', pen = false;
  for (let i = 0; i < n; i++) {
    const y = ys[i];
    if (!isFinite(y)) { pen = false; continue; }
    // A jump bigger than the whole window is an asymptote, not a line
    if (pen && fixedY && Math.abs(y - ys[i - 1]) > ymax - ymin) pen = false;
    d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(y).toFixed(1)}`;
    pen = true;
  }

  const xt = niceTicks(x0, x1).filter(t => t >= x0 && t <= x1);
  const yt = (card.yticks?.length ? card.yticks.map(toNumber) : niceTicks(y0, y1)).filter(t => t >= y0 && t <= y1);
  const bottom = M.top + ph;
  const text = (x, y, s, extra = '') =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" ${extra}>${fmt(s)}</text>`;

  // The curve sits in a nested svg, which clips it to the plot area. (A
  // clipPath needs an id, and the same face can appear twice on a page.)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`
    + `<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>`
    + `<svg x="${M.left}" y="${M.top}" width="${pw}" height="${ph}" viewBox="${M.left} ${M.top} ${pw} ${ph}" overflow="hidden">`
    + `<path d="${d}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg>`
    + `<rect x="${M.left}" y="${M.top}" width="${pw}" height="${ph}" fill="none" stroke="#000" stroke-width="2.5"/>`
    + `<g stroke="#000" stroke-width="2.5">`
    + xt.map(t => `<line x1="${sx(t).toFixed(1)}" x2="${sx(t).toFixed(1)}" y1="${bottom}" y2="${bottom + 8}"/>`).join('')
    + yt.map(t => `<line x1="${M.left - 8}" x2="${M.left}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}"/>`).join('')
    + `</g><g font-family="${FONT}" font-size="28" fill="#000">`
    + xt.map(t => text(sx(t), bottom + 36, t)).join('')
    + yt.map(t => text(M.left - 18, sy(t), t, `transform="rotate(-90 ${(M.left - 18).toFixed(1)} ${sy(t).toFixed(1)})"`)).join('')
    + `</g></svg>`;
}

export function mathReady() {
  return MathJax.startup.promise;
}

// The expression face: {svg, error}. Call after mathReady().
export function expressionSVG(tex) {
  const node = MathJax.tex2svg(tex || '', { display: true });
  const inner = node.querySelector('svg');
  const err = node.querySelector('[data-mjx-error]');
  const [vx, vy, vw, vh] = inner.getAttribute('viewBox').split(/\s+/).map(Number);
  // Fit inside the card, but no bigger than about 95 px per em for short ones
  const s = vw > 0 && vh > 0 ? Math.min(340 / vw, 280 / vh, 0.095) : 0;
  const w = vw * s, h = vh * s;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" color="#000">`
    + `<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>`
    + `<svg x="${((SIZE - w) / 2).toFixed(1)}" y="${((SIZE - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${vx} ${vy} ${vw} ${vh}">`
    + inner.innerHTML + `</svg></svg>`;
  return { svg, error: err ? err.getAttribute('data-mjx-error') : null };
}

// Both faces of a stored card, cached. A broken card gets an error face.
const faceCache = new Map();
export function cardFaces(card) {
  if (!faceCache.has(card.id)) {
    let graph;
    try {
      graph = graphSVG(card);
    } catch (e) {
      graph = errorSVG(e.message);
    }
    faceCache.set(card.id, { graph, expression: expressionSVG(card.tex).svg });
  }
  return faceCache.get(card.id);
}

export function errorSVG(msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">`
    + `<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>`
    + `<text x="200" y="200" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#b3261e">${escapeHTML(msg).slice(0, 60)}</text></svg>`;
}

// A square PNG of a face, for downloads
export async function svgToPng(svg, px = 1200) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    canvas.getContext('2d').drawImage(img, 0, 0, px, px);
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- small helpers

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// A case-insensitive RegExp, or {error} when the pattern is invalid
export function makeFilter(pattern) {
  if (!pattern.trim()) return { re: null };
  try {
    return { re: new RegExp(pattern, 'i') };
  } catch (e) {
    return { error: e.message };
  }
}

// Only http(s) links are shown as links
export function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : null;
}

export function showFatal(el, e) {
  el.innerHTML = `<p class="error">${escapeHTML(e.message)}</p>`;
  console.error(e);
}

// A detail dialog for one card, shared by the card and collection pages
export function openCardDialog(dialog, card) {
  const faces = cardFaces(card);
  const wiki = safeUrl(card.wikipedia);
  dialog.innerHTML = `
    <form method="dialog" class="dialog-close"><button aria-label="Close">×</button></form>
    <h2>${escapeHTML(card.name)}</h2>
    <div class="faces big">
      <div class="tile">${faces.graph}</div>
      <div class="tile">${faces.expression}</div>
    </div>
    ${card.text ? `<p>${escapeHTML(card.text)}</p>` : ''}
    <p class="muted small">Plotted: <code>${escapeHTML(card.expression)}</code> for x from
      <code>${escapeHTML(card.xmin)}</code> to <code>${escapeHTML(card.xmax)}</code>
      · <a href="${fileUrl(`_data/cards/${card.id}.json`)}" target="_blank" rel="noopener">Card file</a></p>
    ${wiki ? `<p><a href="${escapeHTML(wiki)}" target="_blank" rel="noopener">Read more on Wikipedia →</a></p>` : ''}`;
  dialog.showModal();
}
