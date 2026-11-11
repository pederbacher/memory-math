// One collection: its cards, QR code, a PDF overview and a ZIP of
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
          <button id="pdf" class="primary">Download PDF</button>
          <button id="zip">Download images (ZIP)</button>
          <a class="button" href="./?edit=${encodeURIComponent(col.id)}">Add or remove cards</a>
          <a class="button" href="${fileUrl(`_data/collections/${col.id}.json`)}" target="_blank" rel="noopener">File on GitHub</a>
        </div>
        <p id="pdfMsg" class="msg" role="status"></p>
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

  $('pdf').addEventListener('click', () => downloadPdf(col, cards, url));
  $('zip').addEventListener('click', () => downloadZip(col, cards));
}

// ---------------------------------------------------------------- PDF

// DejaVu covers the Greek letters and symbols in the card texts, which the
// fonts built into jsPDF do not
const FONT_BASE = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/';
const FONTS = [
  ['DejaVuSans.ttf', 'sans', 'normal', 'sha384-WWCI8RVJmiZvis8EpwnSyGn7cTtzGfshxkxsg5ZuL9AUFpzKg99zhn/2lkFh2+vG'],
  ['DejaVuSerif-Bold.ttf', 'serif', 'bold', 'sha384-AjS85o+YCTwC7GOiOSeyu+ter5SSZVKv0MKK+WQ6PW8IPBtfZRdLU3Rv6dpC8+gz'],
];

async function addFonts(doc) {
  for (const [file, name, style, integrity] of FONTS) {
    const res = await fetch(FONT_BASE + file, { integrity });
    if (!res.ok) throw new Error(`could not load the font ${file}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    doc.addFileToVFS(file, btoa(bin));
    doc.addFont(file, name, style);
  }
}

// A QR code drawn as black squares, size mm wide, top left at (x, y)
function drawQr(doc, text, x, y, size, level) {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), m = size / n;
  doc.setFillColor(0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) doc.rect(x + c * m, y + r * m, m + 0.01, m + 0.01, 'F');
    }
  }
}

const pngBytes = async svg => new Uint8Array(await (await svgToPng(svg, 600)).arrayBuffer());

// A4 in mm: description and QR code, then one row per card with graph,
// expression, explanation and a QR code of its link
async function downloadPdf(col, cards, url) {
  const btn = $('pdf');
  btn.disabled = true;
  try {
    $('pdfMsg').textContent = 'Loading fonts…';
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    await addFonts(doc);
    const W = 210, H = 297, M = 10, TOP = 12, BOTTOM = 12;
    const inner = W - 2 * M;
    const face = inner * 0.2, pad = 1.5, tile = face - 2 * pad;
    const qrCol = 17, qrSize = 14;
    const textX = M + 2 * face + 4, textW = inner - 2 * face - qrCol - 4 - pad;

    // Header
    const headQr = 30, headW = inner - headQr - 6;
    let y = TOP;
    doc.setFont('serif', 'bold').setFontSize(16);
    const title = doc.splitTextToSize(col.name, headW);
    doc.text(title, M, y, { baseline: 'top' });
    y += title.length * 16 * 0.3528 * 1.2 + 2;
    doc.setFont('sans', 'normal').setFontSize(10);
    const desc = doc.splitTextToSize(col.description || '', headW);
    doc.text(desc, M, y, { baseline: 'top' });
    y += desc.length * 10 * 0.3528 * 1.2 + 1;
    doc.setFontSize(8).setTextColor(85);
    doc.textWithLink(url, M, y, { url, baseline: 'top' });
    doc.setTextColor(0);
    drawQr(doc, url, W - M - headQr, TOP, headQr, 'M');
    doc.link(W - M - headQr, TOP, headQr, headQr, { url });
    y = Math.max(y + 8, TOP + headQr + 6);

    for (const [i, c] of cards.entries()) {
      $('pdfMsg').textContent = `Drawing card ${i + 1} of ${cards.length}…`;
      const link = safeUrl(c.wikipedia);
      doc.setFont('serif', 'bold').setFontSize(11);
      const name = doc.splitTextToSize(c.name, textW);
      doc.setFont('sans', 'normal').setFontSize(9.5);
      const body = c.text ? doc.splitTextToSize(c.text, textW) : [];
      doc.setFontSize(8);
      const linkLines = link ? doc.splitTextToSize(link, textW) : [];
      const lh = pt => pt * 0.3528 * 1.25;
      const textH = name.length * lh(11) + body.length * lh(9.5) + linkLines.length * lh(8);
      const rowH = Math.max(face, textH + 2 * pad);
      if (y + rowH > H - BOTTOM) { doc.addPage(); y = TOP; }

      const faces = cardFaces(c);
      const ty = y + (rowH - tile) / 2;
      for (const [k, svg] of [faces.graph, faces.expression].entries()) {
        const x = M + k * face + pad;
        doc.addImage(await pngBytes(svg), 'PNG', x, ty, tile, tile);
        doc.setDrawColor(187).setLineWidth(0.2).rect(x, ty, tile, tile);
      }

      let t = y + (rowH - textH) / 2;
      doc.setFont('serif', 'bold').setFontSize(11);
      doc.text(name, textX, t, { baseline: 'top', lineHeightFactor: 1.25 });
      t += name.length * lh(11);
      doc.setFont('sans', 'normal').setFontSize(9.5);
      doc.text(body, textX, t, { baseline: 'top', lineHeightFactor: 1.25 });
      t += body.length * lh(9.5);
      if (link) {
        doc.setFontSize(8);
        doc.text(linkLines, textX, t, { baseline: 'top', lineHeightFactor: 1.25 });
        doc.link(textX, t, textW, linkLines.length * lh(8), { url: link });
        const qx = W - M - pad - qrSize, qy = y + (rowH - qrSize) / 2;
        drawQr(doc, link, qx, qy, qrSize, 'L');
        doc.link(qx, qy, qrSize, qrSize, { url: link });
      }
      y += rowH;
    }

    doc.save(`${col.id}.pdf`);
    $('pdfMsg').textContent = '';
  } catch (e) {
    $('pdfMsg').innerHTML = `<span class="error">Could not make the PDF: ${escapeHTML(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- ZIP

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
