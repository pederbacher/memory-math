// Cards page: all cards, regex filter, printing, and editing a collection
// by ticking cards (the draft bar).
import {
  loadCards, loadCollections, mathReady, cardFaces, makeFilter, escapeHTML, openCardDialog,
  getDraft, setDraft, collectionFile, newFileUrl, editFileUrl, copyText, ID_PATTERN, showFatal,
} from './common.js';

const $ = id => document.getElementById(id);
const grid = $('cards');
let cards = [], collections = [];
let draft = null;      // {id, name, description, cards: [], isNew, saved}
const pairs = new Map(); // card id -> element

async function main() {
  [cards, collections] = await Promise.all([loadCards(), loadCollections(), mathReady()]);
  draft = getDraft();

  // ?edit=<id> starts editing a stored collection
  const editId = new URLSearchParams(location.search).get('edit');
  if (editId) {
    const col = collections.find(c => c.id === editId);
    if (col && (!draft || draft.id === editId || confirm(`Stop editing "${draft.name || 'the new collection'}" and edit "${col.name}" instead?`))) {
      draft = { id: col.id, name: col.name, description: col.description || '', cards: [...col.cards], isNew: false, saved: true };
      setDraft(draft);
    }
    history.replaceState(null, '', location.pathname);
  }

  renderCards();
  renderDraft();
  applyFilter();
}

function renderCards() {
  grid.innerHTML = '';
  if (!cards.length) {
    grid.innerHTML = '<p class="empty">No cards yet.</p>';
    return;
  }
  for (const card of cards) {
    const faces = cardFaces(card);
    const el = document.createElement('article');
    el.className = 'pair';
    el.innerHTML = `
      <header><label><input type="checkbox" value="${escapeHTML(card.id)}"> <span>${escapeHTML(card.name)}</span></label></header>
      <div class="faces">
        <button class="tile" aria-label="Graph of ${escapeHTML(card.name)}">${faces.graph}</button>
        <button class="tile" aria-label="Expression of ${escapeHTML(card.name)}">${faces.expression}</button>
      </div>`;
    el.querySelectorAll('button.tile').forEach(b => b.addEventListener('click', () => openCardDialog($('detail'), card)));
    // Clicking the name or the box both end up here; note whether shift was held
    const box = el.querySelector('input');
    el.querySelector('header').addEventListener('click', e => { shiftHeld = e.shiftKey; }, true);
    // Firefox ignores shift-clicks on a label, so toggle the box ourselves
    el.querySelector('label').addEventListener('click', e => {
      if (!e.shiftKey || e.target === box) return;
      e.preventDefault();
      box.checked = !box.checked;
      box.dispatchEvent(new Event('change'));
    });
    box.addEventListener('change', e => {
      const ids = shiftHeld && lastClicked ? rangeBetween(lastClicked, card.id) : [card.id];
      toggleCards(ids, e.target.checked);
      lastClicked = card.id;
      shiftHeld = false;
    });
    pairs.set(card.id, el);
    grid.append(el);
  }
}

// ---------------------------------------------------------------- filter

function applyFilter() {
  const { re, error } = makeFilter($('q').value);
  $('qError').hidden = !error;
  $('qError').textContent = error ? `Not a valid regular expression: ${error}` : '';
  const scope = $('scope').value;
  const onlySelected = $('onlySelected').checked;
  const chosen = new Set(draft?.cards || []);
  let shown = 0;
  for (const card of cards) {
    const name = `${card.id} ${card.name}`;
    const text = `${card.text || ''} ${card.tex} ${card.expression}`;
    const hay = scope === 'name' ? name : scope === 'text' ? text : `${name} ${text}`;
    const visible = (!re || re.test(hay)) && (!onlySelected || chosen.has(card.id));
    pairs.get(card.id).hidden = !visible;
    if (visible) shown++;
  }
  $('count').textContent = `Showing ${shown} of ${cards.length} cards`;
}

$('q').addEventListener('input', applyFilter);
$('scope').addEventListener('change', applyFilter);
$('onlySelected').addEventListener('change', applyFilter);

// ---------------------------------------------------------------- printing

function visibleCards() {
  return cards.filter(c => !pairs.get(c.id).hidden);
}

$('print').addEventListener('click', () => {
  const list = visibleCards();
  const cols = Math.max(2, Math.ceil(Math.sqrt(list.length)));
  const page = (title, face) => `
    <section class="print-page">
      <h1>Memory Math</h1><h2>${title}, ${list.length} cards</h2>
      <div class="print-grid" style="grid-template-columns: repeat(${cols}, 1fr)">
        ${list.map(c => `<div class="tile">${cardFaces(c)[face]}</div>`).join('')}
      </div>
    </section>`;
  $('printArea').innerHTML = page('Graphs', 'graph') + page('Expressions', 'expression');
  window.print();
});

// ---------------------------------------------------------------- draft collection

// Shift-click: every card shown from the last clicked one to this one
let lastClicked = null, shiftHeld = false;

function rangeBetween(fromId, toId) {
  const shown = cards.filter(c => !pairs.get(c.id).hidden).map(c => c.id);
  const a = shown.indexOf(fromId), b = shown.indexOf(toId);
  if (a < 0 || b < 0) return [toId];
  return shown.slice(Math.min(a, b), Math.max(a, b) + 1);
}

function toggleCards(ids, on) {
  if (!draft) {
    draft = { id: '', name: '', description: '', cards: [], isNew: true, saved: false };
  }
  // Cards already ticked keep their place in the order
  if (on) draft.cards.push(...ids.filter(id => !draft.cards.includes(id)));
  else draft.cards = draft.cards.filter(c => !ids.includes(c));
  draft.saved = false;
  setDraft(draft);
  renderDraft();
  if ($('onlySelected').checked) applyFilter();
}

function renderDraft() {
  const bar = $('draftbar');
  bar.hidden = !draft;
  $('startHint').hidden = !!draft;
  const chosen = new Set(draft?.cards || []);
  for (const [id, el] of pairs) {
    el.classList.toggle('selected', chosen.has(id));
    el.querySelector('input').checked = chosen.has(id);
  }
  if (!draft) return;
  $('draftTitle').textContent = draft.isNew ? 'New collection' : `Editing collection: ${draft.name}`;
  $('draftCount').textContent = `${draft.cards.length} card${draft.cards.length === 1 ? '' : 's'} ticked`;
  // Don't overwrite a field while the user is typing in it
  for (const [field, key] of [['dId', 'id'], ['dName', 'name'], ['dDesc', 'description']]) {
    if (document.activeElement !== $(field)) $(field).value = draft[key] || '';
  }
  $('dId').readOnly = !draft.isNew;
  $('dId').title = draft.isNew ? '' : 'The ID of a saved collection cannot be changed';
}

for (const [field, key] of [['dId', 'id'], ['dName', 'name'], ['dDesc', 'description']]) {
  $(field).addEventListener('input', () => {
    draft[key] = $(field).value;
    draft.saved = false;
    setDraft(draft);
    if (key === 'name') renderDraft();
  });
}

function message(html, cls = '') {
  $('dMsg').className = `msg ${cls}`;
  $('dMsg').innerHTML = html;
}

$('dSave').addEventListener('click', async () => {
  draft.id = draft.id.trim();
  draft.name = draft.name.trim();
  if (!ID_PATTERN.test(draft.id)) return message('The ID must use only lowercase letters, digits and dashes, e.g. <code>trig-basics</code>.', 'error');
  if (draft.isNew && collections.some(c => c.id === draft.id)) return message(`There is already a collection with the ID <code>${escapeHTML(draft.id)}</code>.`, 'error');
  if (!draft.name) return message('Give the collection a name.', 'error');
  if (!draft.cards.length) return message('Tick at least one card.', 'error');

  // Keep the stored order of cards: the order they were ticked
  const content = collectionFile(draft);
  const path = `_data/collections/${draft.id}.json`;
  const after = 'The site shows the change about a minute after the commit.';
  if (draft.isNew) {
    window.open(newFileUrl('_data/collections', `${draft.id}.json`, content, `Add collection ${draft.name}`), '_blank', 'noopener');
    message(`GitHub opened in a new tab with the file filled in. Click <strong>Commit changes</strong> there
      (without write access to the repository, GitHub suggests a pull request instead). ${after}`, 'ok');
  } else {
    // Copy before opening: the clipboard needs this tab to have focus
    const copied = await copyText(content);
    window.open(editFileUrl(path), '_blank', 'noopener');
    message(copied
      ? `The new contents are copied. In the GitHub editor that just opened, select everything, paste, and click <strong>Commit changes</strong>. ${after}`
      : `In the GitHub editor that just opened, replace everything with the text below and click <strong>Commit changes</strong>. ${after}
         <textarea rows="8" readonly>${escapeHTML(content)}</textarea>`, 'ok');
  }
  draft.saved = true;
  setDraft(draft);
});

function syncShowButton() {
  $('dShow').textContent = $('onlySelected').checked ? 'Show all cards' : 'Show only these cards';
}
$('dShow').addEventListener('click', () => {
  $('onlySelected').checked = !$('onlySelected').checked;
  syncShowButton();
  applyFilter();
});
$('onlySelected').addEventListener('change', syncShowButton);

$('dClose').addEventListener('click', () => {
  if (!draft.saved && draft.cards.length && !confirm('This collection has unsaved changes. Stop editing anyway?')) return;
  draft = null;
  setDraft(null);
  message('');
  renderDraft();
  applyFilter();
});

main().catch(e => showFatal(grid, e));
