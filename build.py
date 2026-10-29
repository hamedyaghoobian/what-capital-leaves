"""Strip the words from Capital I–III, keep the punctuation.

Reads the archive.org OCR text (printouts of marxists.org pages) and writes:
  site/data/marks.json          every chapter's punctuation, one char per mark,
                                paragraphs separated by "\n"
  site/data/ch/<v>-<ch>.json    cleaned chapter text + offset of each mark,
                                fetched lazily to show the sentence on hover
"""
import json, math, re, sys
from collections import Counter
from pathlib import Path

import tiktoken

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT / "site" / "data"

VOLS = [("I", "1867-c1", "The Process of Production of Capital"),
        ("II", "1885-c2", "The Process of Circulation of Capital"),
        ("III", "1894-c3", "The Process of Capitalist Production as a Whole")]

FOOTER = re.compile(r"^\s*http://www\.marxists\.org/\S*?/(\d{4}-c\d)/(\S+?)\.htm\b.*$")

# Glyph codes used in marks.json. Brackets and parens are kept as themselves.
NORMAL = {"“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
          "‘": "'", "’": "'", "`": "'", "–": "-", "—": "—"}
TOKENIZER = "o200k_base"
STOP = set("""about above after again against these those their there where which while whilst
would could should shall other others being before between through under until within without
because therefore however itself himself themselves another though every first second third
since thus further whole great certain still whose whom never always often since quite rather
also only even such very much more most less same each both into upon from with this that than
then them they what when were have been will your our ours hers yours sense part case form""".split())
MARKS = set('.,;:?!()[]"\'-—…')


def titles(slug):
    s = (RAW / f"idx-{slug}.htm").read_text(encoding="latin-1")
    out = {}
    for href, t in re.findall(r'<a[^>]+href="([^"#/]+)\.htm"[^>]*>(.*?)</a>', s, re.S):
        t = re.sub(r"<[^>]+>|\s+", " ", t).strip()
        t = re.sub(r"\s*\((?:P|p)art \d of \d\)", "", t)
        out.setdefault(href.split("_")[0], t)
    out.update({"part0": "Prefaces and Afterwords", "ch00": "Prefaces", "pref": "Preface",
                "supp": "Supplement"})
    return out


def pages(text):
    """Yield (chapter_id, page_text): a page's footer URL names its chapter."""
    buf = []
    for line in text.splitlines():
        m = FOOTER.match(line)
        if m:
            yield m.group(2).split("_")[0], buf
            buf = []
        else:
            buf.append(line)


def clean(lines):
    # The first non-blank line of each page is the running header ("Capital Vol. I - Chapter One").
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and re.match(r"\s*Capital\b", lines[i]):
        lines = lines[i + 1:]
    t = "\n".join(l.rstrip() for l in lines)
    for a, b in NORMAL.items():
        t = t.replace(a, b)
    t = t.replace("…", "...")
    t = re.sub(r"--+", "—", t)
    t = re.sub(r" - ", " — ", t)                         # spaced hyphen is a dash
    t = re.sub(r"(?m)^\s*\d{1,4}\s*$", "", t)                 # stray page numbers
    # footnote references, OCR'd as [12], [121, fl21, f 121 ...
    t = re.sub(r"(?m)^.*\[\d\d/\d\d/\d{4}.*$", "", t)          # footers in another format
    t = re.sub(r"(?m)^\s*(Next|Previous|Table of Contents)\b.*$", "", t)
    t = re.sub(r"(?m)^\s*[\[\\f]\s?[\dIlOQSZ]{1,3}[a-z]?\s?[\]1lJ\\]\s", "", t)
    t = re.sub(r"[\[\\]\s?[\dIlOQSZ]{1,3}[a-z]?\s?[\]1lJ\\]", "", t)
    t = re.sub(r"\[(?:\d+\s*)?etext\]|\[note \d+ etext\]", "", t)
    t = re.sub(r"(?<=\d)[,.](?=\d)", "", t)                   # 146,662 and 3.5 are numbers, not marks
    t = re.sub(r"(\w)- (\w)", r"\1-\2", t)                    # "Use- Value"
    t = re.sub(r"(\w)-\n(\w)", r"\1\2", t)                    # line-end hyphenation
    t = re.sub(r"[^\S\n]+", " ", t)
    return t


def paragraphs(t):
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", t)]
    out = []
    for p in paras:
        if not p:
            continue
        # OCR breaks paragraphs at page edges: glue a fragment that doesn't end a sentence
        # onto a following one that starts lowercase.
        if out and not re.search(r'[.?!:"\)\]]$', out[-1]) and re.match(r"[a-z(,;]", p):
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def marks_of(paras):
    """Return the chapter text, its mark string and each mark's offset into the text."""
    text = "\n".join(paras)
    marks, pos = [], []
    i = 0
    while i < len(text):
        c = text[i]
        if text.startswith("...", i):
            marks.append("…"); pos.append(i); i += 3; continue
        if c == "\n":
            marks.append("\n"); pos.append(i)
        elif c in MARKS:
            # an apostrophe inside a word ("man's") is still a mark; a hyphen at a page edge is not
            marks.append(c); pos.append(i)
        i += 1
    return text, "".join(marks), pos


def ghosts(texts):
    """The words of each chapter that haunt it most: frequent there, rarer elsewhere."""
    words = {k: Counter(w.lower() for w in re.findall(r"[A-Za-z][a-z]+(?:-[a-z]+)?", t)
                        if len(w) >= 5 and w.lower() not in STOP) for k, t in texts.items()}
    df = Counter(w for c in words.values() for w in c)
    out = {}
    for k, c in words.items():
        score = {w: n * math.log(len(words) / df[w]) + n * 0.05 for w, n in c.items() if n >= 3}
        out[k] = [w for w, _ in sorted(score.items(), key=lambda kv: -kv[1])[:28]]
    return out


def main():
    OUT.joinpath("ch").mkdir(parents=True, exist_ok=True)
    index = {"volumes": [], "totals": {}}
    totals = {}
    texts = {}
    for vol, slug, sub in VOLS:
        names = titles(slug)
        raw = (RAW / f"vol{vol}.txt").read_text(encoding="utf-8", errors="replace")
        chapters = {}
        for cid, lines in pages(raw):
            if cid.startswith("index") or cid not in names:
                continue
            chapters.setdefault(cid, []).append(clean(lines))
        vout = {"id": vol, "subtitle": sub, "chapters": []}
        for cid, chunks in chapters.items():
            paras = paragraphs("\n\n".join(chunks))
            # skip the chapter's header block (author, part, contents) up to the first real paragraph
            while paras and len(paras[0].split()) < 15:
                paras.pop(0)
            # and the section headings and contents entries ("Section 2 — ...", "3. The Equivalent Form")
            paras = [p for p in paras if not (len(p.split()) < 15 and
                     re.match(r"(?i)(section\b|footnotes?$|notes$|[0-9]{1,2}\.|[a-h]\.|[IVX]{1,4}\.)\s*", p))]
            text, marks, pos = marks_of(paras)
            key = f"{vol}-{cid}"
            texts[key] = text
            (OUT / "ch" / f"{key}.json").write_text(
                json.dumps({"text": text, "pos": pos}, ensure_ascii=False, separators=(",", ":")))
            num = int(cid[2:]) if re.fullmatch(r"ch\d+", cid) and cid != "ch00" else None
            vout["chapters"].append({"key": key, "n": num, "title": names[cid], "marks": marks,
                                     "words": len(text.split())})
            for m in marks:
                totals[m] = totals.get(m, 0) + 1
        index["volumes"].append(vout)
        print(vol, len(vout["chapters"]), "chapters",
              sum(len(c["marks"]) for c in vout["chapters"]), "marks", file=sys.stderr)
    index["totals"] = totals
    haunt = ghosts(texts)
    for v in index["volumes"]:
        for c in v["chapters"]:
            c["ghosts"] = haunt[c["key"]]
    enc = tiktoken.get_encoding(TOKENIZER)
    index["tokens"] = sum(len(enc.encode_ordinary(t)) for t in texts.values())
    index["tokenizer"] = TOKENIZER
    print("tokens", index["tokens"], file=sys.stderr)
    (OUT / "marks.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    print(sorted(totals.items(), key=lambda kv: -kv[1]), file=sys.stderr)


if __name__ == "__main__":
    main()
