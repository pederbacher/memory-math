// One collection: its cards, QR code, a two-page print and a ZIP of
// PNG images for ordering printed cards.
import {
  loadCards, loadCollections, mathReady, cardFaces, escapeHTML, safeUrl, openCardDialog,
  svgToPng, fileUrl, showFatal, setupTokenUI,
} from './common.js';

setupTokenUI();

const $ = id => document.getElementById(id);
const main = $('main');

// The address of this collection, for the QR code (without other parameters)
function collectionUrl(id) {
  return `${location.origin}${location.pathname}?id=${encodeURIComponent(id)}`;
}

function qrSVG(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function wikiLink(card) {
  const u = safeUrl(card.wikipedia);
  return u ? `<a href="${escapeHTML(u)}" target="_blank" rel="noopener">Wikipedia →</a>` : '';
}

function render(col, cards, missing) {
  const url = collectionUrl(col.id);
  const qr = qrSVG(url);
  document.title = `${col.name} · Memory Math`;

  main.innerHTML = `
    <div class="collection-head">
      <div>
        <p class="small"><a href="collections.html">← All collections</a></p>
        <h1>${escapeHTML(col.name)}</h1>
        <p>${escapeHTML(col.description || '')}</p>
        <p class="muted small">${cards.length} card${cards.length === 1 ? '' : 's'}</p>
        ${missing.length ? `<p class="error small">Missing cards (removed or renamed): ${missing.map(escapeHTML).join(', ')}</p>` : ''}
        <div class="form-actions">
          <button id="print" class="primary">Print</button>
          <button id="zip">Download images (ZIP)</button>
          <a class="button" href="./?edit=${encodeURIComponent(col.id)}">Add or remove cards</a>
          <a class="button" href="${fileUrl(`_data/collections/${col.id}.json`)}" target="_blank" rel="noopener">File on GitHub</a>
        </div>
        <p id="zipMsg" class="msg" role="status"></p>
      </div>
      <figure style="margin: 0">
        <div class="qr" title="${escapeHTML(url)}">${qr}</div>
        <figcaption class="qr-caption">Scan to open</figcaption>
      </figure>
    </div>
    <div class="card-rows">
      ${cards.map((c, i) => `
        <article class="panel card-row">
          <div class="faces">
            <button class="tile" data-i="${i}" aria-label="Graph of ${escapeHTML(c.name)}">${cardFaces(c).graph}</button>
            <button class="tile" data-i="${i}" aria-label="Expression of ${escapeHTML(c.name)}">${cardFaces(c).expression}</button>
          </div>
          <div>
            <h3>${escapeHTML(c.name)}</h3>
            ${c.text ? `<p>${escapeHTML(c.text)}</p>` : ''}
            <p class="small">${wikiLink(c)}</p>
          </div>
        </article>`).join('')}
    </div>`;

  main.querySelectorAll('button.tile').forEach(b =>
    b.addEventListener('click', () => openCardDialog($('detail'), cards[b.dataset.i])));

  // Description and QR code, then one table: graph, expression, explanation
  $('printArea').innerHTML = `
    <section class="print-page long">
      <div class="print-head">
        <div>
          <h1>${escapeHTML(col.name)}</h1>
          <p>${escapeHTML(col.description || '')}</p>
          <p style="font-size: 8pt; color: #555">${escapeHTML(url)}</p>
        </div>
        <div class="qr">${qr}</div>
      </div>
      <table class="print-table">
        <colgroup><col class="face"><col class="face"><col></colgroup>
        <thead class="page-gap"><tr><td colspan="3"></td></tr></thead>
        <tfoot class="page-gap"><tr><td colspan="3"></td></tr></tfoot>
        ${cards.map(c => `<tr>
          <td><div class="tile">${cardFaces(c).graph}</div></td>
          <td><div class="tile">${cardFaces(c).expression}</div></td>
          <td class="explain"><strong>${escapeHTML(c.name)}</strong><br>${escapeHTML(c.text || '')}
            ${safeUrl(c.wikipedia) ? `<br><a href="${escapeHTML(c.wikipedia)}">${escapeHTML(c.wikipedia)}</a>` : ''}</td>
        </tr>`).join('')}
      </table>
    </section>`;

  $('print').addEventListener('click', () => window.print());
  $('zip').addEventListener('click', () => downloadZip(col, cards));
}

// One PNG per face, in graphs/ and expressions/ (like the R script's output),
// to upload to a photo service such as Pixum.
async function downloadZip(col, cards) {
  const btn = $('zip');
  btn.disabled = true;
  try {
    const zip = new JSZip();
    for (const [i, c] of cards.entries()) {
      $('zipMsg').textContent = `Drawing card ${i + 1} of ${cards.length}…`;
      const faces = cardFaces(c);
      zip.file(`graphs/${c.id}.png`, await svgToPng(faces.graph));
      zip.file(`expressions/${c.id}.png`, await svgToPng(faces.expression));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${col.id}-cards.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    $('zipMsg').textContent = `Downloaded ${cards.length * 2} images (1200×1200 px). Upload them to your photo service, for example in Pixum's card or photo book editor.`;
  } catch (e) {
    $('zipMsg').innerHTML = `<span class="error">Could not make the images: ${escapeHTML(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

async function start() {
  const id = new URLSearchParams(location.search).get('id');
  const [cards, cols] = await Promise.all([loadCards(), loadCollections(), mathReady()]);
  const col = cols.find(c => c.id === id);
  if (!col) {
    main.innerHTML = `<h1>Collection not found</h1>
      <p>There is no collection called <code>${escapeHTML(id || '')}</code>. A new collection appears about a minute after it is committed.</p>
      <p><a href="collections.html">See all collections</a></p>`;
    return;
  }
  const byId = new Map(cards.map(c => [c.id, c]));
  render(col, col.cards.map(i => byId.get(i)).filter(Boolean), col.cards.filter(i => !byId.has(i)));
}

start().catch(e => showFatal(main, e));
