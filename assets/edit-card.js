// Edit card page: a form with a live preview of both faces. Opened with
// ?id=<card> it loads that card; saving with the same ID overwrites it,
// and a new ID saves a new card.
import {
  loadCards, mathReady, graphSVG, expressionSVG, errorSVG, toNumber, cardFile,
  newFileUrl, editFileUrl, copyText, escapeHTML, ID_PATTERN,
} from './common.js';

const $ = id => document.getElementById(id);
let cards = new Map();
let editing = null;   // the stored card being edited, or null for a new card
let idEdited = false; // stop deriving the ID from the name once it is typed or loaded
let dirty = false;

const FIELDS = ['name', 'id', 'expression', 'tex', 'xmin', 'xmax', 'ymin', 'ymax', 'xticks', 'yticks', 'text', 'wikipedia'];

// Numbers stay numbers in the file; expressions like 2*pi stay text
function limit(v) {
  v = v.trim();
  if (v === '') return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

// A list of ticks: split on commas, or on spaces when there are no commas
function tickList(v) {
  v = v.trim();
  if (!v) return null;
  return v.split(/[,;]/.test(v) ? /[,;]/ : /\s+/).map(limit).filter(t => t !== null);
}

function readForm() {
  return {
    id: $('id').value.trim(),
    name: $('name').value.trim(),
    expression: $('expression').value.trim(),
    tex: $('tex').value.trim(),
    xmin: limit($('xmin').value),
    xmax: limit($('xmax').value),
    ymin: limit($('ymin').value),
    ymax: limit($('ymax').value),
    xticks: tickList($('xticks').value),
    yticks: tickList($('yticks').value),
    equalAspect: $('equalAspect').checked,
    text: $('text').value.trim(),
    wikipedia: $('wikipedia').value.trim(),
  };
}

// Puts a card in the form, or empties it for a new card
function fill(card) {
  editing = card;
  const v = k => (card?.[k] ?? '');
  for (const k of FIELDS) $(k).value = Array.isArray(v(k)) ? v(k).join(', ') : String(v(k));
  if (!card) { $('xmin').value = '-1'; $('xmax').value = '1'; }
  $('equalAspect').checked = !!card?.equalAspect;
  // Show the extra plot settings when the card uses any of them
  $('form').querySelector('details').open = !!card && ['ymin', 'ymax', 'xticks', 'yticks', 'equalAspect']
    .some(k => card[k] !== undefined && card[k] !== null && card[k] !== false);
  $('pick').value = card ? card.id : '';
  idEdited = !!card;
  dirty = false;
  message('');
  history.replaceState(null, '', card ? `?id=${encodeURIComponent(card.id)}` : location.pathname);
  document.title = `${card ? `Edit ${card.name}` : 'New card'} · Memory Math`;
  update();
}

// Says whether saving overwrites the loaded card or makes a new one
function showMode() {
  const id = $('id').value.trim();
  const overwrite = editing && id === editing.id;
  $('save').textContent = overwrite ? 'Save changes' : 'Save as new card';
  $('mode').innerHTML = !editing
    ? 'A new card. To change an existing card, pick it above.'
    : overwrite
      ? `Saving overwrites <strong>${escapeHTML(editing.name)}</strong>. Give it a new ID to save a copy as a new card instead.`
      : `Saving makes a new card with the ID <code>${escapeHTML(id || '…')}</code>; <strong>${escapeHTML(editing.name)}</strong> stays as it is.`;
}

// Draws the preview; returns a list of problems
function update() {
  showMode();
  const c = readForm();
  const problems = [];

  $('expressionError').textContent = '';
  $('rangeError').textContent = '';
  if (!c.expression) {
    $('pGraph').innerHTML = '';
  } else {
    try {
      for (const t of [...(c.xticks || []), ...(c.yticks || [])]) {
        try { toNumber(t); } catch { throw new Error(`Axis ticks: "${t}" is not a number`); }
      }
      $('pGraph').innerHTML = graphSVG(c);
    } catch (e) {
      const isRange = /range|number/.test(e.message);
      $(isRange ? 'rangeError' : 'expressionError').textContent = e.message;
      $('pGraph').innerHTML = errorSVG('Cannot draw the graph');
      problems.push(e.message);
    }
  }

  const { svg, error } = expressionSVG(c.tex);
  $('pExpression').innerHTML = c.tex ? svg : '';
  $('texError').textContent = error ? `LaTeX: ${error}` : '';
  if (error) problems.push(`LaTeX: ${error}`);
  return { card: c, problems };
}

function message(html, cls = '') {
  $('msg').className = `msg ${cls}`;
  $('msg').innerHTML = html;
}

function validate() {
  const { card, problems } = update();
  if (!card.name) problems.unshift('Give the card a name.');
  if (!ID_PATTERN.test(card.id)) problems.unshift('The ID must use only lowercase letters, digits and dashes.');
  else if (cards.has(card.id) && card.id !== editing?.id) {
    problems.unshift(`There is already a card with the ID "${card.id}". Choose another ID, or pick that card above to edit it.`);
  }
  if (!card.expression) problems.push('Write the expression to plot.');
  if (!card.tex) problems.push('Write the expression as LaTeX.');
  if (card.wikipedia && !/^https?:\/\//.test(card.wikipedia)) problems.push('The Wikipedia link must start with https://');
  return { card, problems };
}

async function save(e) {
  e.preventDefault();
  const { card, problems } = validate();
  if (problems.length) return message(problems.map(escapeHTML).join('<br>'), 'error');
  const content = cardFile(card);
  const after = 'The site shows the change about a minute after the commit.';
  if (editing && card.id === editing.id) {
    // GitHub can't prefill an edit: copy first (the clipboard needs this tab focused)
    const copied = await copyText(content);
    window.open(editFileUrl(`_data/cards/${card.id}.json`), '_blank', 'noopener');
    message(copied
      ? `The new contents are copied. In the GitHub editor that just opened, select everything, paste, and click <strong>Commit changes</strong>. ${after}`
      : `In the GitHub editor that just opened, replace everything with the text below and click <strong>Commit changes</strong>. ${after}
         <textarea rows="10" readonly>${escapeHTML(content)}</textarea>`, 'ok');
  } else {
    window.open(newFileUrl('_data/cards', `${card.id}.json`, content, `Add card ${card.name}`), '_blank', 'noopener');
    message(`GitHub opened in a new tab with the card file filled in. Click <strong>Commit changes</strong> there
      (without write access to the repository, GitHub suggests a pull request instead). ${after}`, 'ok');
  }
  dirty = false;
}

async function main() {
  await mathReady();
  const list = await loadCards();
  cards = new Map(list.map(c => [c.id, c]));
  $('pick').insertAdjacentHTML('beforeend',
    list.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join(''));

  $('pick').addEventListener('change', () => {
    if (dirty && !confirm('Discard your changes to this card?')) {
      $('pick').value = editing ? editing.id : '';
      return;
    }
    fill(cards.get($('pick').value) || null);
  });

  let timer;
  $('form').addEventListener('input', e => {
    if (e.target.id === 'pick') return;
    dirty = true;
    if (e.target.id === 'id') idEdited = true;
    if (e.target.id === 'name' && !idEdited) {
      $('id').value = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    showMode();
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });
  $('form').addEventListener('submit', save);

  const id = new URLSearchParams(location.search).get('id');
  fill(cards.get(id) || null);
  if (id && !cards.has(id)) message(`There is no card with the ID <code>${escapeHTML(id)}</code>, so this is a new card.`, 'error');
}

main().catch(e => message(escapeHTML(e.message), 'error'));
