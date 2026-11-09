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
const hi = () => innerWidth * (devicePixelRatio || 1) > 1500;
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
const UI = 44;
function boxFor(it, mode, vw, vh, m) {
  if (mode === 'cover') return { w: vw, h: vh, left: 0, top: 0 };
  const r = it.w / it.h;
  let s = mode === 'small' ? (it.s || .9) : mode === 'layer' ? .74 : 1;
  let cx = mode === 'small' ? (it.x ?? 50) / 100 : .5;
  if (m && mode !== 'full') { s = Math.min(1, s * 1.2); cx = .5; }
  const availH = vh - UI * 2;
  let maxW, maxH;
  if (mode === 'full') { maxW = vw - (m ? 0 : 40); maxH = availH; }
  else { maxH = availH * s; maxW = (vw - 40) * (m ? .9 : .8); }
  let h = maxH, w = h * r;
  if (w > maxW) { w = maxW; h = w / r; }
  let left = vw * cx - w / 2, top = vh / 2 - h / 2;
  left = Math.min(Math.max(left, m ? 0 : 20), vw - w - (m ? 0 : 20));
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
  return new Promise(r => {
    const want = new URL(url, location.href).href;
    if (el.src !== want) { el.poster = poster; el.src = want; }
    if (el.readyState >= 2) return r();
    el.addEventListener('loadeddata', r, { once: true }); setTimeout(r, 1500);
  });
}
function place(it, size) {
  const vw = innerWidth, vh = innerHeight, m = mobile();
  let mode = modeOf(it);
  let b = boxFor(it, mode, vw, vh, m);
  // intro: every flash lands in one fixed window (the first slide's), so nothing resizes or bounces
  const fixed = intro.running && intro.box;
  if (fixed) { b = intro.box; mode = 'full'; }
  const { w, h, left, top } = b;
  const token = ++placeToken;
  const url = it.v ? vposter(it.f) : src(it.p.slug, it.f, size);
  const box = { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px' };
  // what sits behind a layered picture: a video, or a photo
  const under = mode === 'layer' ? BYF[it.u] || FLOW.find(x => x.v) : null;
  const underImg = under && !under.v ? src(under.p.slug, under.f) : null;
  // the new picture is decoded off-screen, laid on top of the old one, and the old one is removed
  // only after the new one has painted — so there is never a frame with no picture
  const nf = it.v ? null : fresh('fg', url, it.p.title);
  if (nf) Object.assign(nf.style, box, { objectFit: fixed || mode === 'cover' ? 'cover' : '', objectPosition: it.fp || '' });
  const nb = underImg && bg.getAttribute('src') !== underImg ? fresh('bg', underImg, '') : null;
  if (nb) nb.setAttribute('aria-hidden', 'true');
  const dec = el => el ? (el.decode ? el.decode() : new Promise(r => el.onload = r)).catch(() => {}) : 0;
  const later = f => requestAnimationFrame(() => requestAnimationFrame(f));
  const apply = () => {
    if (token !== placeToken) return;
    const oldFg = fg, oldBg = bg;
    if (it.v) { Object.assign(fgv.style, box); fgv.play?.().catch(() => {}); }
    else { fgv.pause?.(); oldFg.after(nf); fg = nf; }
    if (nb) { oldBg.after(nb); bg = nb; }
    if (under?.v) uv.play?.().catch(() => {}); else uv.pause?.();
    stage.classList.toggle('isvid', !!it.v);
    stage.classList.toggle('layer', mode === 'layer');
    stage.classList.toggle('ulayer', !!under?.v);
    stage.classList.toggle('ilayer', !!underImg);
    document.body.classList.toggle('dark', mode === 'cover' || mode === 'layer');
    setName(it, mode, top, h, vw, vh, m);
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
function preloadVideo(f) { ready(vposter(f)); const v = document.createElement('link'); v.rel = 'preload'; v.as = 'video'; v.href = vsrc(f); document.head.appendChild(v); }
function preload(i) {
  [i + 1, i - 1, i + 2].forEach(j => {
    const n = FLOW[(j + FLOW.length) % FLOW.length];
    if (n.v) return preloadVideo(n.f);
    ready(src(n.p.slug, n.f));
    if (modeOf(n) === 'layer') { const u = BYF[n.u] || FLOW.find(x => x.v); if (u) u.v ? preloadVideo(u.f) : ready(src(u.p.slug, u.f)); }
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

/* ---------- credits: white, big pictures; three layouts to compare (switch shows with ?preview) ---------- */
const CL = { strip: 'Strip', stack: 'Stack', grid: 'Grid' };
const store = { get: k => { try { return localStorage.getItem('lm3-' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('lm3-' + k, v); } catch {} } };
let creditsLayout = (qs.get('credits') in CL && qs.get('credits')) || (qs.has('preview') && store.get('credits') in CL && store.get('credits')) || (data.creditsLayout in CL ? data.creditsLayout : 'strip');
function renderCredits() {
  const cur = FLOW[Math.max(g, 0)], p = cur.p, L = layers.credits;
  L.className = 'layer credits l-' + creditsLayout;
  const media = p.images.map((im, k) => im.v
    ? `<video src="${vsrc(im.f)}" poster="${vposter(im.f)}" data-k="${k}" muted loop playsinline autoplay></video>`
    : `<img src="${src(p.slug, im.f, creditsLayout === 'strip' || !mobile() ? (hi() ? 'web' : 'md') : 'md')}" data-k="${k}" alt="${esc(p.title)}" style="aspect-ratio:${im.w}/${im.h}">`).join('');
  const meta = `<div class="meta"><h2>${esc(p.title)}</h2><dl>${(p.credits || []).filter(c => c.role || c.name).map(c => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join('')}
      ${p.client ? `<dt>Client</dt><dd>${esc(p.client)}</dd>` : ''}${p.year ? `<dt>Year</dt><dd>${esc(p.year)}</dd>` : ''}</dl></div>`;
  const sw = qs.has('preview') ? `<div class="clay">${Object.entries(CL).map(([k, v]) => `<button data-l="${k}" class="${k === creditsLayout ? 'on' : ''}">${v}</button>`).join('')}</div>` : '';
  L.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    ${creditsLayout === 'strip' ? `<div class="media">${media}</div>${meta}` : `${meta}<div class="media">${media}</div>`}${sw}`;
  L.querySelector('.close').onclick = close;
  L.querySelectorAll('.media [data-k]').forEach(el => el.onclick = () => {
    const i = FLOW.findIndex(x => x.pi === cur.pi && x.k === +el.dataset.k); g = i; lastPi = cur.pi; location.hash = hashFor(i);
  });
  L.querySelectorAll('.clay button').forEach(b => b.onclick = () => { creditsLayout = b.dataset.l; store.set('credits', creditsLayout); renderCredits(); });
  const strip = L.querySelector('.l-strip .media');
  if (strip) strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

function renderInfo() {
  // one narrow column, almost nothing: a line about her, Instagram, then a two-line note and a quiet newsletter link
  const L = layers.info;
  L.innerHTML = `<a class="home" href="#/">${esc(data.name)}</a><button class="close">Close</button>
    <div class="col">
      <p class="bio">${esc(data.bio)}</p>
      <p>${data.instagram ? `<a href="https://instagram.com/${esc(data.instagram)}" target="_blank" rel="noopener">Instagram</a>` : '<span>Instagram</span>'}</p>
      <form class="contact" novalidate>
        <textarea name="message" rows="1" placeholder="Write something" aria-label="Message" required></textarea>
        <div class="row"><input name="email" type="email" placeholder="Your email" aria-label="Email" required autocomplete="email"><button class="send" type="submit" hidden>Send</button></div>
        <p class="note"></p>
      </form>
      <form class="news" novalidate><button type="button" class="nlink">Newsletter</button><input name="email" type="email" placeholder="Your email" aria-label="Newsletter email" required hidden><button class="join" type="submit" hidden>Join</button></form>
    </div>`;
  L.querySelector('.close').onclick = close;
  const c = L.querySelector('.contact'), note = c.querySelector('.note'), send = c.querySelector('.send'), ta = c.querySelector('textarea');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  c.addEventListener('input', () => { grow(); send.hidden = !c.checkValidity(); });
  c.addEventListener('submit', async e => {
    e.preventDefault(); if (!c.checkValidity()) return;
    try { const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(c))) });
      if (!r.ok) throw 0; } catch {}
    c.reset(); grow(); send.hidden = true; note.textContent = 'Thank you.';
  });
  const nf = L.querySelector('.news'), nl = nf.querySelector('.nlink'), ni = nf.querySelector('input'), nj = nf.querySelector('.join');
  nl.onclick = () => { nl.hidden = true; ni.hidden = false; ni.focus(); };
  ni.addEventListener('input', () => { nj.hidden = !nf.checkValidity(); });
  nf.addEventListener('submit', async e => { e.preventDefault(); if (!nf.checkValidity()) return;
    try { await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(nf))) }); } catch {}
    nf.innerHTML = '<p class="note">Thank you.</p>'; });
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
