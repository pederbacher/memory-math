// Collections page: search the collections and start a new one.
import {
  loadCards, loadCollections, mathReady, cardFaces, makeFilter, escapeHTML,
  getDraft, setDraft, ID_PATTERN, showFatal,
} from './common.js';

const $ = id => document.getElementById(id);
let collections = [], cardsById = new Map();
let idEdited = false;

function render() {
  const { re, error } = makeFilter($('q').value);
  $('qError').hidden = !error;
  $('qError').textContent = error ? `Not a valid regular expression: ${error}` : '';
  const shown = collections.filter(c => !re || re.test(`${c.id} ${c.name} ${c.description || ''}`));
  if (!collections.length) {
    $('list').innerHTML = '<p class="empty">No collections yet. Create the first one.</p>';
    return;
  }
  if (!shown.length) {
    $('list').innerHTML = '<p class="empty">No collections match the filter.</p>';
    return;
  }
  $('list').innerHTML = shown.map(c => {
    const cards = c.cards.map(id => cardsById.get(id)).filter(Boolean);
    return `<a class="panel collection-item" href="collection.html?id=${encodeURIComponent(c.id)}">
      <div>
        <h2>${escapeHTML(c.name)}</h2>
        <p>${escapeHTML(c.description || '')}</p>
        <p class="muted small">${cards.length} card${cards.length === 1 ? '' : 's'}</p>
      </div>
      <div class="thumbs" aria-hidden="true">${cards.slice(0, 4).map(card => `<div class="tile">${cardFaces(card).graph}</div>`).join('')}</div>
    </a>`;
  }).join('');
}

async function main() {
  const [cards, cols] = await Promise.all([loadCards(), loadCollections(), mathReady()]);
  cardsById = new Map(cards.map(c => [c.id, c]));
  collections = cols;
  $('q').addEventListener('input', render);
  render();
}

$('form').addEventListener('input', e => {
  if (e.target.id === 'id') idEdited = true;
  if (e.target.id === 'name' && !idEdited) {
    $('id').value = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
});

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('id').value.trim(), name = $('name').value.trim();
  if (!ID_PATTERN.test(id)) return ($('msg').textContent = 'The ID must use only lowercase letters, digits and dashes.');
  if (collections.some(c => c.id === id)) return ($('msg').textContent = `There is already a collection with the ID "${id}".`);
  if (!name) return ($('msg').textContent = 'Give the collection a name.');
  const old = getDraft();
  if (old && !old.saved && old.cards.length && !confirm(`You have unsaved changes to "${old.name || 'a new collection'}". Replace them?`)) return;
  setDraft({ id, name, description: $('description').value.trim(), cards: [], isNew: true, saved: false });
  location.href = './';
});

main().catch(e => showFatal($('list'), e));
