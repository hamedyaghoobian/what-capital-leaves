# What Capital Leaves

Marx's *Capital*, all three volumes, with every word taken out. What is left is the punctuation: 162,890 marks, laid down in reading order and painted as a sea after Turner's *Slave Ship* (1840).

**See it:** [hamedyaghoobian.com/readings-otherwise/what-capital-leaves](https://hamedyaghoobian.com/readings-otherwise/what-capital-leaves/)

No. 1 in *Readings, Otherwise*, a series of pieces that take a book apart and keep what usually gets thrown away.

## What it does

- **The sea.** Every mark is a point drawn in WebGL. From a distance each is a brushstroke drifting on a current: Volume I (production) is the sky, Volume II (circulation) is where the water starts, Volume III (the process as a whole) is the deep. Zoom in and the currents settle into the marks, in the order Marx wrote them.
- **The ghosts.** Stay still and the words that were taken out rise through the water, drawn from the chapter underneath.
- **The voices.** Quotation marks glow. In *Capital* they are where other people speak: factory inspectors, physicians, child workers. Click one to read the quoted passage; click any other mark for its sentence.
- **Living labour.** The painting is lifeless until someone looks at it. The pointer leaves red traces that sink back into the grey within a minute, and the time spent is counted. **Strike** withdraws your labour.
- **Layers.** ≋ takes the painting apart into ground, marks, voices and ghosts.
- **Reading page.** `read/` is the same text as a scrolling page of punctuation, with a chapter rail you can drag to race through the book.
- Light and dark modes, shared between the two pages; dark by default.

## Layout

```
build.py      cleans the OCR, splits it into chapters, extracts the punctuation,
              picks each chapter's "ghost" words, counts tokens
fetch.sh      downloads the source texts into raw/
site/         the published pages, static: copy the folder anywhere
  index.html, painting.js, painting.css    the painting (WebGL 2)
  read/                                    the reading page
  data/marks.json                          every chapter's marks, one character each
  data/ch/<volume>-<chapter>.json          cleaned chapter text and each mark's offset,
                                           loaded only when a mark is clicked
```

## Building

```bash
./fetch.sh
```

```bash
uv run --isolated --no-project --with 'tiktoken>=0.7' python build.py
```

`build.py` needs Python 3.10+ and `tiktoken` (for the token count, o200k tokenizer). It writes `site/data/`.

To look at it locally, serve `site/` over HTTP (the pages fetch their data, so `file://` won't work):

```bash
python3 -m http.server 8765 --directory site
```

## Source and limits

The text is the Internet Archive's OCR of the [marxists.org](https://www.marxists.org/archive/marx/works/1867-c1/index.htm) edition of *Capital* (Moore & Aveling's translation of Volume I; Progress Publishers for II and III). The OCR made its own reading: some full stops are misread, some footnote brackets survive the cleaning, quotation marks are sometimes mis-paired, and numbers lose their separators on purpose. marxists.org publishes its archive under a [Creative Commons Attribution-ShareAlike 2.0](https://www.marxists.org/admin/legal/cc/by-sa.htm) licence; the derived chapter texts in `site/data/` come from those transcriptions and keep that attribution.

Made in 2026 by [Hamed Yaghoobian](https://hamedyaghoobian.com/) with Claude.
