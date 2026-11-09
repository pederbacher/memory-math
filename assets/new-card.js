// New card page: a form with a live preview of both faces.
import {
  loadCards, mathReady, graphSVG, expressionSVG, errorSVG, toNumber, cardFile,
  newFileUrl, copyText, escapeHTML, ID_PATTERN,
} from './common.js';

const $ = id => document.getElementById(id);
let existing = new Set();
let idEdited = false;

// Numbers stay numbers in the file; expressions like 2*pi stay text
function limit(v) {
  v = v.trim();
  if (v === '') return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

function readForm() {
  const ticks = $('yticks').value.trim();
  return {
    id: $('id').value.trim(),
    name: $('name').value.trim(),
    expression: $('expression').value.trim(),
    tex: $('tex').value.trim(),
    xmin: limit($('xmin').value),
    xmax: limit($('xmax').value),
    ymin: limit($('ymin').value),
    ymax: limit($('ymax').value),
    yticks: ticks ? ticks.split(/[,;\s]+/).filter(Boolean).map(limit) : null,
    equalAspect: $('equalAspect').checked,
    text: $('text').value.trim(),
    wikipedia: $('wikipedia').value.trim(),
  };
}

// Draws the preview; returns a list of problems
function update() {
  const c = readForm();
  const problems = [];

  $('expressionError').textContent = '';
  $('rangeError').textContent = '';
  if (!c.expression) {
    $('pGraph').innerHTML = '';
  } else {
    try {
      if (c.yticks) c.yticks.forEach(toNumber);
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
  else if (existing.has(card.id)) problems.unshift(`There is already a card with the ID "${card.id}".`);
  if (!card.expression) problems.push('Write the expression to plot.');
  if (!card.tex) problems.push('Write the expression as LaTeX.');
  if (card.wikipedia && !/^https?:\/\//.test(card.wikipedia)) problems.push('The Wikipedia link must start with https://');
  return { card, problems };
}

async function main() {
  await mathReady();
  existing = new Set((await loadCards()).map(c => c.id));

  let timer;
  $('form').addEventListener('input', e => {
    if (e.target.id === 'id') idEdited = true;
    if (e.target.id === 'name' && !idEdited) {
      $('id').value = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const { card, problems } = validate();
    if (problems.length) return message(problems.map(escapeHTML).join('<br>'), 'error');
    window.open(newFileUrl('_data/cards', `${card.id}.json`, cardFile(card), `Add card ${card.name}`), '_blank', 'noopener');
    message(`GitHub opened in a new tab with the card file filled in. Click <strong>Commit changes</strong> there
      (without write access to the repository, GitHub suggests a pull request instead).
      The card appears on the site about a minute after the commit.`, 'ok');
  });

  $('copy').addEventListener('click', async () => {
    const { card, problems } = validate();
    const content = cardFile(card);
    const copied = await copyText(content);
    message((problems.length ? `<span class="error">${problems.map(escapeHTML).join('<br>')}</span><br>` : '')
      + (copied ? `Copied. Save it as <code>_data/cards/${escapeHTML(card.id || 'id')}.json</code> in the repository.`
        : `<textarea rows="10" readonly>${escapeHTML(content)}</textarea>`));
  });

  update();
}

main().catch(e => message(escapeHTML(e.message), 'error'));
