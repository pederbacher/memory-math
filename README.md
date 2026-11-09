# Memory Math

A memory game with mathematical functions: each pair of cards is a graph and its expression.

The website is at **https://pederbacher.github.io/memory-math/**. It shows all the cards, lets you search them with regular expressions, put them into collections, print them, and download a collection as PNG images for ordering printed cards.

## How the site works

It is a static site on GitHub Pages, with no server or database. The repository is the database:

- `_data/cards/<id>.json` holds one card.
- `_data/collections/<id>.json` holds one collection.

GitHub Pages runs Jekyll, which combines these files into `data/cards.json` and `data/collections.json` that the pages load. The graphs are drawn in the browser with [math.js](https://mathjs.org/), and the expressions are typeset with [MathJax](https://www.mathjax.org/).

### Adding cards and collections

The **New card** page and the collection editor on the **Cards** page don't need a login or token. Saving opens GitHub's "new file" page with the file filled in:

- If you have write access, click **Commit changes**. The site updates about a minute later.
- If you don't, GitHub offers to make a pull request instead, which the owner can accept or reject.

GitHub can't prefill an edit to an existing file. So when you change a saved collection, the new contents are copied to the clipboard and the GitHub editor opens, ready for you to paste.

### Card file format

```json
{
  "name": "Tangent",
  "expression": "tan(x)",
  "tex": "\\tan x",
  "xmin": "-2*pi",
  "xmax": "2*pi",
  "ymin": -5,
  "ymax": 5,
  "text": "The tangent is sin(x)/cos(x) ...",
  "wikipedia": "https://en.wikipedia.org/wiki/Trigonometric_functions"
}
```

| Key | Meaning |
|---|---|
| `expression` | What is plotted, in [math.js syntax](https://mathjs.org/docs/expressions/syntax.html) with the variable `x` |
| `tex` | The expression shown on the card, in LaTeX |
| `xmin`, `xmax` | The x range. A number, or an expression such as `"2*pi"` |
| `ymin`, `ymax` | Optional y range. Points far outside it are dropped, which breaks the line at asymptotes |
| `yticks` | Optional list of y-axis tick positions |
| `equalAspect` | Optional `true` for the same scale on both axes (for example the semicircle) |
| `text`, `wikipedia` | The explanation and a link for reading more |

A collection file has `name`, `description` and `cards`, a list of card IDs in the order they are shown.

## Running the site locally

With Jekyll installed, `jekyll serve` in this folder serves the site at http://localhost:4000/.

## The original R version

`generateImages.Rtex` and `make.R` generate print-quality PNGs of the cards with R, knitr and tikz (`Rscript make.R`, output in `output/`). The `.mcfx` files are photo book projects made from those images. The site's cards were moved over from `generateImages.Rtex`, so new cards only need to be added on the site.
