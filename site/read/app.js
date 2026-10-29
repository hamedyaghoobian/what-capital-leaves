// What Capital Leaves: Capital I–III with the words taken out.
// marks.json holds every chapter's punctuation; data/ch/<key>.json holds the chapter's
// text and each mark's offset into it, fetched when the chapter scrolls near.

const CLASS = {
  ".": "p", ",": "c", ";": "s", ":": "o", "—": "d", "-": "h", "'": "a",
  '"': "q", "(": "r", ")": "r", "[": "b", "]": "b", "?": "x", "!": "e", "…": "l",
};
const LEGEND = [
  ["p", ".", "full stop"], ["c", ",", "comma"], ["s", ";", "semicolon"], ["o", ":", "colon"],
  ["d", "—", "dash"], ["r", "( )", "parentheses"], ["q", "“ ”", "quotation marks"],
  ["x", "?", "question mark"], ["e", "!", "exclamation mark"], ["l", "…", "ellipsis"],
  ["b", "[ ]", "brackets"], ["h", "-", "hyphen"], ["a", "’", "apostrophe"],
];
const ROMAN = { I: "Volume One", II: "Volume Two", III: "Volume Three" };
const MOUNT_MARGIN = "150% 0px";

const book = document.getElementById("book");
const rail = document.getElementById("rail");
const legend = document.getElementById("legend");
const panel = document.getElementById("panel");
const fmt = new Intl.NumberFormat("en");

const chapters = [];          // {key, vol, n, title, marks, el, box, mounted, height}
const texts = new Map();      // key -> Promise<{text, pos}>

function loadText(key) {
  if (!texts.has(key)) texts.set(key, fetch(`../data/ch/${key}.json`).then(r => r.json()));
  return texts.get(key);
}

function hidden(cls) { return document.body.classList.contains("hide-" + cls); }

function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- layout ----------

let glyphW = 12, lineH = 24, paraGap = 17, colW = 800;

function measure() {
  const probe = document.createElement("div");
  probe.className = "marks";
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
  probe.innerHTML = `<p><i class="m-c">${",".repeat(60)}</i><i class="m-p">${".".repeat(34)}</i><i class="m-d">${"—".repeat(6)}</i></p>`;
  book.appendChild(probe);
  const p = probe.firstChild;
  glyphW = p.firstChild.getBoundingClientRect().width / 60 * 0.62 +
           p.children[1].getBoundingClientRect().width / 34 * 0.34 +
           p.children[2].getBoundingClientRect().width / 6 * 0.04;
  const cs = getComputedStyle(probe);
  lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
  paraGap = parseFloat(getComputedStyle(p).marginBottom);
  probe.remove();
  colW = book.clientWidth - parseFloat(getComputedStyle(book).paddingLeft) -
         parseFloat(getComputedStyle(book).paddingRight);
}

// Height a chapter will take once mounted, given which marks are hidden.
function estimate(ch) {
  const perLine = Math.max(1, Math.floor(colW / glyphW));
  let h = 0, n = 0;
  for (const m of ch.marks) {
    if (m === "\n") { if (n) h += Math.ceil(n / perLine) * lineH + paraGap; n = 0; continue; }
    if (!hidden(CLASS[m])) n++;
  }
  if (n) h += Math.ceil(n / perLine) * lineH + paraGap;
  return Math.round(h);
}

function render(ch) {
  let html = "<p>", open = true;
  const m = ch.marks;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === "\n") { html += "</p><p>"; open = true; continue; }
    let g = c;
    if (c === '"') { g = open ? "“" : "”"; open = !open; }
    else if (c === "'") g = "’";
    html += `<i class="m-${CLASS[c]}" data-i="${i}">${g}</i>`;
  }
  return html + "</p>";
}

function mount(ch) {
  if (ch.mounted) return;
  ch.box.style.height = "";
  ch.box.innerHTML = render(ch);
  ch.mounted = true;
  loadText(ch.key);
}

function unmount(ch) {
  if (!ch.mounted) return;
  ch.box.style.height = ch.box.offsetHeight + "px";
  ch.box.innerHTML = "";
  ch.mounted = false;
}

function reflowPlaceholders() {
  measure();
  for (const ch of chapters) if (!ch.mounted) ch.box.style.height = estimate(ch) + "px";
}

// ---------- build ----------

function build(data) {
  let total = 0;
  for (const [k, v] of Object.entries(data.totals)) if (k !== "\n") total += v;
  document.getElementById("total").textContent = fmt.format(total);

  const frag = document.createDocumentFragment();
  for (const vol of data.volumes) {
    const head = document.createElement("div");
    head.className = "vol-head";
    head.id = "vol-" + vol.id;
    const vm = vol.chapters.reduce((s, c) => s + c.marks.length, 0);
    head.innerHTML = `<b>${vol.id}</b>${ROMAN[vol.id]} &middot; ${esc(vol.subtitle)}`;
    frag.appendChild(head);

    const rv = document.createElement("div");
    rv.className = "rv";
    rv.style.flex = `${vm} 1 0`;
    rv.innerHTML = `<span class="rv-label">${vol.id}</span>`;
    rail.appendChild(rv);

    for (const c of vol.chapters) {
      const sec = document.createElement("section");
      sec.className = "chapter";
      sec.id = c.key;
      const num = c.n ? `${vol.id}.${c.n}` : vol.id;
      sec.innerHTML = `<h2><span>${num}</span>${esc(c.title)}</h2><div class="marks"></div>`;
      frag.appendChild(sec);
      const ch = { ...c, vol: vol.id, el: sec, box: sec.lastChild, mounted: false };
      ch.box.dataset.k = chapters.length;
      chapters.push(ch);

      const a = document.createElement("a");
      a.href = "#" + c.key;
      a.title = `${num} ${c.title}`;
      a.style.flex = `${c.marks.length} 1 0`;
      rv.appendChild(a);
      ch.tick = a;
    }
  }
  book.appendChild(frag);
  reflowPlaceholders();

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const ch = chapters[e.target.dataset.k];
      e.isIntersecting ? mount(ch) : unmount(ch);
    }
  }, { rootMargin: MOUNT_MARGIN });
  for (const ch of chapters) io.observe(ch.box);

  buildLegend(data.totals);
}

// ---------- legend ----------

function buildLegend(totals) {
  const count = {};
  for (const [m, n] of Object.entries(totals)) if (CLASS[m]) count[CLASS[m]] = (count[CLASS[m]] || 0) + n;
  for (const [cls, glyph, name] of LEGEND) {
    const b = document.createElement("button");
    b.dataset.c = cls;
    b.title = `${name}: click to hide, double-click to see only this`;
    b.innerHTML = `<span class="g m-${cls}">${glyph}</span><span class="n">${fmt.format(count[cls] || 0)}</span>`;
    b.addEventListener("click", () => setHidden(cls, !hidden(cls)));
    b.addEventListener("dblclick", () => solo(cls));
    legend.appendChild(b);
  }
  syncLegend();
}

function setHidden(cls, on) {
  document.body.classList.toggle("hide-" + cls, on);
  syncLegend();
  reflowPlaceholders();
}

function solo(cls) {
  const others = LEGEND.map(l => l[0]).filter(c => c !== cls);
  const already = !hidden(cls) && others.every(hidden);
  for (const c of others) document.body.classList.toggle("hide-" + c, !already);
  document.body.classList.remove("hide-" + cls);
  syncLegend();
  reflowPlaceholders();
}

function syncLegend() {
  for (const b of legend.children) b.classList.toggle("off", hidden(b.dataset.c));
}

// ---------- the sentence a mark came from ----------

const ABBREV = /(?:\b(?:p|pp|vol|vols|ch|chap|mr|mrs|dr|viz|ed|eds|cf|no|nos|st|sq|ibid|loc|cit|op|art|sec|ff|l|c|b|s|t|v|i\.e|e\.g|etc|&c)|\b[A-Z])$/i;

function sentenceAround(text, pos) {
  const LIMIT = 420;
  let start = Math.max(0, pos - LIMIT), cut0 = start > 0;
  for (let j = pos - 1; j >= Math.max(0, pos - LIMIT); j--) {
    if (text[j] === "\n") { start = j + 1; cut0 = false; break; }
    if (".?!".includes(text[j]) && text[j + 1] === " " && /[A-Z"(\[]/.test(text[j + 2] || "") &&
        !ABBREV.test(text.slice(Math.max(0, j - 6), j))) { start = j + 2; cut0 = false; break; }
  }
  let end = Math.min(text.length, pos + LIMIT), cut1 = end < text.length;
  for (let j = pos; j < Math.min(text.length, pos + LIMIT); j++) {
    if (text[j] === "\n") { end = j; cut1 = false; break; }
    if (".?!".includes(text[j]) && !(text[j] === "." && text[j + 1] === ".") &&
        (j + 1 >= text.length || /[\s"')\]]/.test(text[j + 1])) &&
        !(text[j] === "." && ABBREV.test(text.slice(Math.max(0, j - 6), j)))) {
      end = j + 1;
      while (/["')\]]/.test(text[end] || "")) end++;
      if (j >= pos) { cut1 = false; break; }
    }
  }
  return { start, end, cut0, cut1 };
}

function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; arr[mid] < x ? lo = mid + 1 : hi = mid; }
  return lo;
}

function sentenceHTML(text, s, pos) {
  let out = s.cut0 ? "…" : "";
  for (let j = s.start; j < s.end; j++) {
    const ch = text[j];
    if (text.startsWith("...", j)) {
      out += `<b class="m-l${j === pos ? " here" : ""}">…</b>`; j += 2; continue;
    }
    const cls = CLASS[ch];
    if (!cls) { out += esc(ch); continue; }
    let g = ch;
    // a quote after a space or bracket opens; the slice may start mid-quotation, so parity won't do
    if (ch === '"') g = j === 0 || /[\s(\[—]/.test(text[j - 1]) ? "“" : "”";
    else if (ch === "'") g = "’";
    out += `<b class="m-${cls}${j === pos ? " here" : ""}">${g}</b>`;
  }
  return out + (s.cut1 ? "…" : "");
}

let litBox = null, hideTimer = 0, token = 0;

function clearLit() {
  if (!litBox) return;
  litBox.classList.remove("lit");
  for (const el of litBox.querySelectorAll("i.on, i.here")) el.classList.remove("on", "here");
  litBox = null;
}

async function reveal(el) {
  const box = el.closest(".marks");
  const ch = chapters[box.dataset.k];
  const i = +el.dataset.i;
  const my = ++token;
  clearTimeout(hideTimer);
  const { text, pos } = await loadText(ch.key);
  if (my !== token || !ch.mounted) return;

  const s = sentenceAround(text, pos[i]);
  clearLit();
  litBox = box;
  box.classList.add("lit");
  for (let k = lowerBound(pos, s.start); k < pos.length && pos[k] < s.end; k++) {
    const span = box.querySelector(`i[data-i="${k}"]`);
    if (span) span.classList.add("on");
  }
  el.classList.add("on", "here");

  const num = ch.n ? `Chapter ${ch.n}` : "";
  document.getElementById("where").textContent =
    [`Volume ${ch.vol}`, num, ch.title].filter(Boolean).join(" · ");
  document.getElementById("sentence").innerHTML = sentenceHTML(text, s, pos[i]);
  panel.classList.add("show");
}

function conceal() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { token++; clearLit(); panel.classList.remove("show"); }, 900);
}

book.addEventListener("pointerover", e => {
  if (e.pointerType === "touch") return;
  const el = e.target.closest(".marks i");
  if (el) reveal(el);
});
book.addEventListener("pointerout", e => {
  if (e.pointerType !== "touch" && e.target.closest(".marks i")) conceal();
});
book.addEventListener("click", e => {
  const el = e.target.closest(".marks i");
  if (el) reveal(el); else conceal();
});

// ---------- where we are ----------

let current = -1, ticking = false;

function onScroll() {
  ticking = false;
  const mid = innerHeight * 0.4;
  const top = book.getBoundingClientRect().top;
  const bottom = document.querySelector(".colophon").getBoundingClientRect().top;
  document.body.classList.toggle("reading", top < mid && bottom > mid);

  let lo = 0, hi = chapters.length - 1, found = -1;
  while (lo <= hi) {
    const k = (lo + hi) >> 1;
    if (chapters[k].el.getBoundingClientRect().top <= mid) { found = k; lo = k + 1; } else hi = k - 1;
  }
  if (found !== current) {
    if (current >= 0) chapters[current].tick.classList.remove("now");
    if (found >= 0) chapters[found].tick.classList.add("now");
    current = found;
  }
}

addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

// ---------- scrubbing: drag along the rail to race through the book ----------

const scrubLabel = document.createElement("div");
scrubLabel.id = "scrub";
scrubLabel.setAttribute("aria-hidden", "true");
document.body.appendChild(scrubLabel);
let scrubbing = false;

// The chapter under a height on the rail, and how far down that chapter's tick it is.
function railAt(y) {
  let best = 0, bd = Infinity, frac = 0;
  for (let k = 0; k < chapters.length; k++) {
    const r = chapters[k].tick.getBoundingClientRect();
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < bd) { bd = d; best = k; frac = r.height ? Math.min(1, Math.max(0, (y - r.top) / r.height)) : 0; }
    if (d === 0) break;
  }
  return [best, frac];
}

function showScrub(k, y) {
  const ch = chapters[k];
  scrubLabel.textContent = `${ch.n ? `${ch.vol}.${ch.n}` : ch.vol}  ${ch.title}`;
  scrubLabel.style.top = y + "px";
  scrubLabel.classList.add("show");
}

function scrubTo(y) {
  const [k, frac] = railAt(y);
  const top = chapters[k].el.getBoundingClientRect().top + scrollY;
  const next = k + 1 < chapters.length ? chapters[k + 1].el : document.querySelector(".colophon");
  const bottom = next.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + frac * Math.max(0, bottom - top - innerHeight * 0.5), behavior: "instant" });
  showScrub(k, y);
}

rail.addEventListener("pointerdown", e => {
  e.preventDefault();
  try { rail.setPointerCapture(e.pointerId); } catch (_) {}
  scrubbing = true;
  document.body.classList.add("scrubbing");
  scrubTo(e.clientY);
});
rail.addEventListener("pointermove", e => {
  if (scrubbing) scrubTo(e.clientY);
  else if (e.pointerType === "mouse") showScrub(railAt(e.clientY)[0], e.clientY);
});
function endScrub() {
  scrubbing = false;
  document.body.classList.remove("scrubbing");
  scrubLabel.classList.remove("show");
}
rail.addEventListener("pointerup", endScrub);
rail.addEventListener("pointercancel", endScrub);
rail.addEventListener("pointerleave", () => { if (!scrubbing) scrubLabel.classList.remove("show"); });
// the ticks stay links for the keyboard; a pointer click is already handled as a scrub
rail.addEventListener("click", e => { if (e.detail) e.preventDefault(); });

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(reflowPlaceholders, 200);
});

// ---------- light and dark (shared with the painting) ----------

const themeBtn = document.getElementById("theme");
const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
function syncThemeButton() {
  const next = theme() === "dark" ? "light" : "dark";
  themeBtn.textContent = next;
  themeBtn.setAttribute("aria-label", `Switch to ${next} mode`);
}
themeBtn.addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("what-capital-leaves:theme", next); } catch (_) {}
  syncThemeButton();
});
syncThemeButton();

fetch("../data/marks.json")
  .then(r => r.json())
  .then(data => {
    build(data);
    document.fonts.ready.then(reflowPlaceholders);
    onScroll();
  });
