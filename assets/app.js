const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
// ?draft = the studio's live preview: read the unsaved draft instead of the published file
const DRAFT = qs.has('draft');
const data = DRAFT
  ? JSON.parse(localStorage.getItem('lm-draft') || 'null') || await fetch('data/projects.json', { cache: 'no-cache' }).then(r => r.json())
  : await fetch('data/projects.json', { cache: 'no-cache' }).then(r => r.json());
const B = data._blobs || {};                 // files uploaded in the studio but not published yet
const P = data.projects.filter(p => p.images.length);
const FLOW = P.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, ...im })));
const BYF = Object.fromEntries(FLOW.map(x => [x.f, x]));
const hi = () => innerWidth * (devicePixelRatio || 1) > 1900;
const src = (slug, f, size) => { size = size || (hi() ? 'web' : 'md'); return B[f]?.[size] || B[f]?.md || `media/${size}/${slug}/${f}.webp`; };
const vsrc = f => B[f]?.mp4 || `media/video/${f}.mp4`, vposter = f => B[f]?.poster || `media/video/${f}.jpg`;
const thumb = (p, im) => im.v ? vposter(im.f) : src(p.slug, im.f, 'md');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const touch = matchMedia('(hover: none)').matches;
const mobile = () => innerWidth < 760;
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const stage = $('.stage');
let bg = $('.bg'), fg = $('.fg');
const fgv = $('.fgv'), uv = $('.uv'), cursor = $('.cursor');
const ptitle = $('.ptitle'), bigname = $('.bigname');
const layers = { credits: $('.credits'), info: $('.info') };

// warm the cache so cuts are instant
FLOW.forEach(it => { new Image().src = it.v ? vposter(it.f) : src(it.p.slug, it.f, 'md'); });

/* ---------- the four ways a picture or video can sit ----------
   cover  Full screen  fills the screen edge to edge
   full   Large        the whole picture, big, white around it
   small  Small        the whole picture, smaller, a little off-centre
   layer  Layered      a video (or photo) fills the screen, the picture sits on top        */
const MODES = ['cover', 'full', 'small', 'layer'];
const modeOf = it => it.m === 'frame' ? 'full' : MODES.includes(it.m) ? it.m : 'full';
// each slide has its desktop settings; `ph` holds the phone version when it differs
const lay = it => mobile() && it.ph ? { ...it, ...it.ph } : it;
const SIZE = { full: 1, small: .55, layer: .7 };     // share of the biggest size that fits
const UI = 44;
function boxFor(L, mode, vw, vh, m) {
  if (mode === 'cover') return { w: vw, h: vh, left: 0, top: 0 };
  const r = L.w / L.h, pad = m ? (mode === 'full' ? 0 : 14) : 20;
  const availW = vw - pad * 2, availH = vh - UI * 2;
  let h = availH, w = h * r;
  if (w > availW) { w = availW; h = w / r; }
  const s = Math.min(1, Math.max(.2, L.s ?? SIZE[mode] ?? 1));
  w *= s; h *= s;
  let left = vw * (L.x ?? 50) / 100 - w / 2, top = vh * (L.y ?? 50) / 100 - h / 2;
  left = Math.min(Math.max(left, pad), vw - w - pad);
  top = Math.min(Math.max(top, UI), vh - h - UI);
  return { w, h, left, top };
}

let placeToken = 0;
const cache = new Map();
function ready(url) {
  if (!cache.has(url)) { const im = new Image(); im.src = url; cache.set(url, (im.decode ? im.decode() : new Promise(r => im.onload = r)).catch(() => {})); }
  return cache.get(url);
}
function fresh(cls, url, alt) { const n = new Image(); n.className = cls; n.alt = alt; n.src = url; return n; }
function vidReady(el, url, poster) {
  // the poster is on screen straight away; the video takes over as soon as it can play
  const want = new URL(url, location.href).href;
  if (el.src !== want) { el.poster = poster; el.src = want; }
  return ready(poster);
}
function underOf(L) {
  if (L.ub?.f) return { ...L.ub, p: { slug: L.ub.slug || 'bg' } };
  return BYF[L.u] || FLOW.find(x => x.v) || null;
}
function underBox(L, u, vw, vh, m) {
  const s = L.bs ?? 1;
  if (s >= .999) return { left: '0px', top: '0px', width: vw + 'px', height: vh + 'px', right: 'auto', bottom: 'auto', objectFit: 'cover', objectPosition: L.bfp || '' };
  const b = boxFor({ w: u.w, h: u.h, s, x: L.bx, y: L.by }, 'full', vw, vh, m);
  return { left: b.left + 'px', top: b.top + 'px', width: b.w + 'px', height: b.h + 'px', right: 'auto', bottom: 'auto', objectFit: '', objectPosition: '' };
}
function place(it, size) {
  const vw = innerWidth, vh = innerHeight, m = mobile(), L = lay(it);
  let mode = modeOf(L);
  let b = boxFor(L, mode, vw, vh, m);
  // intro: every flash lands in one fixed window (the first slide's), so nothing resizes or bounces
  const fixed = intro.running && intro.box;
  if (fixed) { b = intro.box; mode = 'full'; }
  const { w, h, left, top } = b;
  const token = ++placeToken;
  const url = it.v ? vposter(it.f) : src(it.p.slug, it.f, size);
  const box = { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' };
  // what sits behind a layered picture: a video, or a photo
  // what sits behind a layered picture: its own photo or video (ub), sized and placed separately
  const under = mode === 'layer' ? underOf(L) : null;
  const ubox = under ? underBox(L, under, vw, vh, m) : null;
  const underImg = under && !under.v ? src(under.p.slug, under.f) : null;
  // the new picture is decoded off-screen, laid on top of the old one, and the old one is removed
  // only after the new one has painted — so there is never a frame with no picture
  const nf = it.v ? null : fresh('fg', url, it.p.title);
  if (nf) Object.assign(nf.style, box, { objectFit: fixed || mode === 'cover' ? 'cover' : '', objectPosition: L.fp || '' });
  const nb = underImg && bg.getAttribute('src') !== underImg ? fresh('bg', underImg, '') : null;
  if (nb) nb.setAttribute('aria-hidden', 'true');
  const dec = el => el ? (el.decode ? el.decode() : new Promise(r => el.onload = r)).catch(() => {}) : 0;
  const later = f => requestAnimationFrame(() => requestAnimationFrame(f));
  const apply = () => {
    if (token !== placeToken) return;
    const oldFg = fg, oldBg = bg;
    if (it.v) { Object.assign(fgv.style, box, { objectPosition: L.fp || '' }); fgv.play?.().catch(() => {}); }
    else { fgv.pause?.(); oldFg.after(nf); fg = nf; }
    if (nb) { oldBg.after(nb); bg = nb; }
    if (ubox) Object.assign((under.v ? uv : bg).style, ubox);
    if (under?.v) uv.play?.().catch(() => {}); else uv.pause?.();
    stage.classList.toggle('isvid', !!it.v);
    stage.classList.toggle('is-layer', mode === 'layer');
    stage.classList.toggle('ulayer', !!under?.v);
    stage.classList.toggle('ilayer', !!underImg);
    document.body.classList.toggle('dark', mode === 'cover' || (mode === 'layer' && !!under && (L.bs ?? 1) >= .999));
    setName(L, mode, top, h, vw, vh, m);
    tone();
    later(() => { if (!it.v && oldFg !== fg) oldFg.remove(); if (nb && oldBg !== bg) oldBg.remove(); });
  };
  Promise.all([dec(nf), dec(nb), it.v ? vidReady(fgv, vsrc(it.f), url) : 0, under?.v ? vidReady(uv, vsrc(under.f), vposter(under.f)) : 0]).then(apply, apply);
}

/* ---------- her name in Bodoni: still, only on the slides chosen for it, a different slice each time ---------- */
const nameOn = (it, mode) => (mode === 'full' || mode === 'small') && (it.n ?? (hash(it.f + 'n') % 6 === 0));
function setName(it, mode, top, h, vw, vh, m) {
  const show = !intro.running && nameOn(it, mode);
  bigname.classList.toggle('on', show);
  if (!show) return;
  const H = hash(it.f);
  // placed by hand in the editor: ny = height of the line's centre (% of screen), nx = which slice shows
  if (it.ny != null || it.nx != null) {
    const f = m ? vh * .13 : vh * .38;
    const c = it.ny != null ? it.ny / 100 : (m ? (top + h + f * .22) / vh : .5 + (((H >>> 8) % 100) / 100 - .5) * .36);
    const y = Math.min(Math.max(c * vh - f / 2, 0), vh - f);
    bigname.style.setProperty('--nf', f + 'px'); bigname.style.setProperty('--ny', y + 'px');
    bigname.style.setProperty('--nx', -(it.nx ?? (H % 3333) / 100) + '%');
    return;
  }
  if (!m) {
    bigname.style.setProperty('--nx', -(H % 3333) / 100 + '%');          // slide the endless line
    const f = vh * .38, c = .5 + (((H >>> 8) % 100) / 100 - .5) * .36;    // near the middle, sometimes higher / lower
    const y = Math.min(Math.max(c * vh - f / 2, UI + 6), vh - UI - 6 - f);
    bigname.style.setProperty('--nf', f + 'px'); bigname.style.setProperty('--ny', y + 'px');
  } else {
    // phone: once, in the bigger free band, tucked against the picture so it sits near the centre
    const above = top - UI, below = vh - UI - (top + h);
    const band = Math.max(above, below), f = Math.min(vh * .13, band * 1.2);
    if (f < 46) return bigname.classList.remove('on');
    const tuck = f * .28;
    const y = above >= below ? Math.max(UI, top - f + tuck) : Math.min(top + h - tuck, vh - UI - f);
    bigname.style.setProperty('--nf', f + 'px'); bigname.style.setProperty('--ny', y + 'px');
    const sp = bigname.querySelectorAll('span'), sw = sp[0].offsetWidth, tw = sw - f * .35;
    const j = (((H >>> 4) % 100) / 100 - .5) * vw * .16;
    bigname.style.setProperty('--nx', (vw / 2 + j - (sw + tw / 2)) + 'px');
  }
}

/* ---------- intro: one cover per project at an even rhythm ---------- */
let g = -1, lastPi = -1, flickT = null;
function intro(done) {
  clearTimeout(flickT);
  const covers = P.map((p, pi) => FLOW.find(x => x.pi === pi && !x.v)).filter(Boolean);
  const vw = innerWidth, vh = innerHeight, first = covers[0] || FLOW[0], r = first.w / first.h, m = mobile();
  let h = vh - UI * 2, w = h * r; const maxW = vw - (m ? 0 : 40);
  if (w > maxW) { w = maxW; h = w / r; }
  intro.box = { w, h, left: (vw - w) / 2, top: Math.max(UI, (vh - h) / 2) };
  intro.running = true;
  let i = 0;
  return Promise.all(covers.map(c => ready(src(c.p.slug, c.f)))).then(() => {
    const tick = () => {
      if (i >= covers.length) { intro.running = false; return done(); }
      const c = covers[i++]; place(c); ptitle.textContent = c.p.title;
      flickT = setTimeout(tick, 170);
    };
    tick();
  });
}

function show(i) {
  i = (i + FLOW.length) % FLOW.length;
  const it = FLOW[i];
  const land = () => { place(it); setTitle(it.p); preload(i); };
  const first = g < 0;
  g = i;
  if (first && i === 0 && !DRAFT) intro(land);
  else { clearTimeout(flickT); intro.running = false; land(); }
  lastPi = it.pi;
}
const preloaded = new Set();
function preloadVideo(f) {
  ready(vposter(f));
  if (preloaded.has(f)) return; preloaded.add(f);
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = vsrc(f);
}
function preload(i) {
  [i + 1, i - 1, i + 2, i + 3].forEach(j => {
    const n = FLOW[(j + FLOW.length) % FLOW.length];
    if (n.v) return preloadVideo(n.f);
    ready(src(n.p.slug, n.f));
    const L = lay(n);
    if (modeOf(L) === 'layer') { const u = underOf(L); if (u) u.v ? preloadVideo(u.f) : ready(src(u.p.slug, u.f)); }
  });
}
const hashFor = i => i === 0 ? '#/' : `#/${FLOW[i].p.slug}/${FLOW[i].k + 1}`;
function go(i) { i = (i + FLOW.length) % FLOW.length; history.replaceState(null, '', hashFor(i)); show(i); }
const step = d => go(g + d);
addEventListener('resize', () => { if (g >= 0) place(FLOW[g]); });

/* project name bottom-left opens that shoot's credits */
function setTitle(p) { ptitle.textContent = p.title; }

/* ---------- cursor: Prev / Next ---------- */
let mx = -1, my = -1;
function tone() {
  const r = (stage.classList.contains('isvid') ? fgv : fg).getBoundingClientRect();
  cursor.classList.toggle('light', document.body.classList.contains('dark') || (mx > r.left && mx < r.right && my > r.top && my < r.bottom));
}
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; cursor.style.transform = `translate(${mx}px,${my}px) translate(-50%,-60%)`; tone(); });
document.querySelectorAll('.zones i').forEach(z => {
  z.addEventListener('mouseenter', () => { cursor.textContent = z.dataset.a === 'prev' ? 'Prev' : 'Next'; cursor.classList.toggle('on', !touch); });
  z.addEventListener('click', () => step(z.dataset.a === 'prev' ? -1 : 1));
});
$('.zones').addEventListener('mouseleave', () => cursor.classList.remove('on'));

let tx = null;
addEventListener('touchstart', e => { tx = openLayer() ? null : e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', e => { if (tx == null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 45) step(d < 0 ? 1 : -1); tx = null; });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') return openLayer() && close();
  if (openLayer()) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft') step(-1);
});

/* ---------- overlays ---------- */
const openLayer = () => Object.keys(layers).find(k => !layers[k].hidden);
const close = () => { location.hash = hashFor(Math.max(g, 0)); };
document.querySelectorAll('[data-go="credits"]').forEach(b => b.addEventListener('click', () => { location.hash = '#/credits'; }));

/* ---------- credits: white, big pictures; layout chosen in the website editor ---------- */
const CL = { strip: 'Strip', stack: 'Stack', grid: 'Grid' };
const creditsLayout = (DRAFT && qs.get('credits') in CL && qs.get('credits')) || (data.creditsLayout in CL ? data.creditsLayout : 'strip');
function renderCredits() {
  const cur = FLOW[Math.max(g, 0)], p = cur.p, L = layers.credits;
  L.className = 'layer credits l-' + creditsLayout;
  const media = p.images.map((im, k) => im.v
    ? `<video src="${vsrc(im.f)}" poster="${vposter(im.f)}" data-k="${k}" muted loop playsinline autoplay></video>`
    : `<img src="${src(p.slug, im.f, creditsLayout === 'strip' || !mobile() ? (hi() ? 'web' : 'md') : 'md')}" data-k="${k}" alt="${esc(p.title)}" style="aspect-ratio:${im.w}/${im.h}">`).join('');
  const meta = `<div class="meta"><h2>${esc(p.title)}</h2><dl>${(p.credits || []).filter(c => c.role || c.name).map(c => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}
      ${p.client ? `<dt>Client</dt><dd>${esc(p.client)}</dd>` : ''}${p.year ? `<dt>Year</dt><dd>${esc(p.year)}</dd>` : ''}</dl></div>`;
  L.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    ${creditsLayout === 'strip' ? `<div class="media">${media}</div>${meta}` : `${meta}<div class="media">${media}</div>`}`;
  L.querySelector('.close').onclick = close;
  L.querySelectorAll('.media [data-k]').forEach(el => el.onclick = () => {
    const i = FLOW.findIndex(x => x.pi === cur.pi && x.k === +el.dataset.k); g = i; lastPi = cur.pi; location.hash = hashFor(i);
  });
  const strip = L.querySelector('.l-strip .media');
  if (strip) strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

function renderInfo() {
  // one narrow column: a line about her, then "Write something" (opens an email to her) and Instagram.
  // The newsletter only shows once it is switched on in the editor and connected.
  const L = layers.info, mail = data.email ? `mailto:${data.email}` : '';
  L.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    <div class="col">
      <p class="bio">${esc(data.bio)}</p>
      <p class="links">
        ${mail ? `<a class="write" href="${esc(mail)}">Write something</a>` : ''}
        ${data.instagram ? `<a href="https://instagram.com/${esc(data.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}
      </p>
      ${data.newsletter ? `<form class="news" novalidate><button type="button" class="nlink">Newsletter</button><input name="email" type="email" placeholder="Your email" aria-label="Newsletter email" required hidden><button class="join" type="submit" hidden>Join</button></form>` : ''}
    </div>`;
  L.querySelector('.close').onclick = close;
  const nf = L.querySelector('.news'); if (!nf) return;
  const nl = nf.querySelector('.nlink'), ni = nf.querySelector('input'), nj = nf.querySelector('.join');
  nl.onclick = () => { nl.hidden = true; ni.hidden = false; ni.focus(); };
  ni.addEventListener('input', () => { nj.hidden = !nf.checkValidity(); });
  nf.addEventListener('submit', async e => {
    e.preventDefault(); if (!nf.checkValidity()) return;
    try { const r = await fetch(data.newsletter, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(nf))) }); if (!r.ok) throw 0; nf.innerHTML = '<p class="note">Thank you.</p>'; }
    catch { nf.innerHTML = '<p class="note">That didn’t go through. Please try again later.</p>'; }
  });
}

/* ---------- router ---------- */
document.documentElement.dataset.colour = 'mono';
function route() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  Object.values(layers).forEach(l => l.hidden = true); document.body.classList.remove('overlay');
  if (layers[a]) {
    if (g < 0) { g = 0; lastPi = 0; place(FLOW[0]); setTitle(FLOW[0].p); }
    ({ info: renderInfo, credits: renderCredits })[a]();
    layers[a].hidden = false; cursor.classList.remove('on'); document.body.classList.add('overlay');
    return;
  }
  const pi = P.findIndex(p => p.slug === a);
  const i = pi < 0 ? 0 : FLOW.findIndex(x => x.pi === pi && x.k === Math.min(Math.max((+b || 1) - 1, 0), P[pi].images.length - 1));
  if (i !== g || (!fg.getAttribute('src') && !fgv.getAttribute('src'))) show(i); else { place(FLOW[i]); setTitle(FLOW[i].p); }
}
addEventListener('hashchange', route);
route();
