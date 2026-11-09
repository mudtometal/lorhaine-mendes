/* Lorhaine Mendes · Editor
   Works like a slideshow editor: pick a project on the left, see the real slide in the middle,
   reorder slides in the strip below, set how the selected slide shows on the right.
   Everything saves as a draft automatically; Publish puts it live.                           */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REPO = { owner: 'mudtometal', repo: 'lorhaine-mendes', branch: 'main' };

const LAYOUTS = {
  cover: ['Full screen', 'Fills the screen'],
  full: ['Large', 'Whole picture, big'],
  small: ['Small', 'Smaller, off-centre'],
  layer: ['Layered', 'On top of a video'],
};
const CREDITS = { strip: ['Strip', 'Pictures in one row, scroll sideways'], stack: ['Stack', 'Credits left, pictures down the right'], grid: ['Grid', 'Credits on top, two columns'] };
const modeOf = im => im.m === 'frame' ? 'full' : LAYOUTS[im.m] ? im.m : 'full';
const nameOk = m => m === 'full' || m === 'small';
const art = k => `<div class="art ${k}">${'<i></i>'.repeat(k === 'strip' ? 3 : k === 'grid' ? 4 : 1)}${CREDITS[k] ? '<u></u>' : ''}</div>`;

/* ---------- data ---------- */
let published = await fetch('../data/projects.json', { cache: 'no-cache' }).then(r => r.json());
let D = structuredClone(published);
try { const s = JSON.parse(localStorage.getItem('lm-studio') || 'null'); if (s && s.base === JSON.stringify(published)) D = s.data; } catch {}
const pending = {};
const clean = d => JSON.parse(JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v));
const thumb = (p, im, size = 'md') => im.v ? (pending[im.f]?.poster || `../media/video/${im.f}.jpg`) : (pending[im.f]?.[size] || `../media/${size}/${p.slug}/${im.f}.webp`);
const allItems = () => D.projects.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, im })));
const dirty = () => JSON.stringify(clean(D)) !== JSON.stringify(published) || Object.values(pending).some(b => b.files);
const countOf = p => { const v = p.images.filter(i => i.v).length, ph = p.images.length - v; return [ph && `${ph} photo${ph > 1 ? 's' : ''}`, v && `${v} video${v > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'No slides yet'; };

/* ---------- what's selected ---------- */
let V = { pi: 0, k: 0, page: null };          // page: 'info' | 'credits' | null
let multi = new Set();                          // extra slides selected with ⇧ / ⌘
let tab = 'slide';                              // right panel: 'slide' | 'project'
let uploading = 0;
const P = () => D.projects[V.pi];

/* ---------- undo ---------- */
const history = [];
function snapshot() { history.push(JSON.stringify(D)); if (history.length > 80) history.shift(); $('.undo').disabled = false; }
function undo() {
  if (!history.length) return;
  D = JSON.parse(history.pop()); $('.undo').disabled = !history.length;
  V.pi = Math.min(V.pi, D.projects.length - 1); V.k = Math.min(V.k, Math.max(0, (P()?.images.length || 1) - 1)); multi.clear();
  saved(); render(); toast('Undone');
}
$('.undo').onclick = undo;
// every change: snapshot first, then mutate, then commit()
function edit(fn) { snapshot(); fn(); saved(); render(); }
function saved() {
  try { localStorage.setItem('lm-studio', JSON.stringify({ base: JSON.stringify(published), data: D })); } catch {}
  writeDraft(); status(); refresh();
}
function writeDraft() {
  const blobs = Object.fromEntries(Object.entries(pending).map(([f, b]) => [f, { md: b.md, web: b.web, poster: b.poster, mp4: b.mp4 }]));
  try { localStorage.setItem('lm-draft', JSON.stringify({ ...D, _blobs: blobs })); } catch {}
}
function status() {
  const d = dirty(), s = $('.state');
  s.textContent = d ? 'Unpublished changes' : 'All changes published';
  s.classList.toggle('dirty', d);
  $('.top .pub').disabled = !d;
  $('.discard').hidden = !d;
}

/* ---------- the live slide in the middle ---------- */
let device = 'desk', ver = 0;
const frames = $$('.scaler iframe');
function target() {
  if (V.page === 'info') return { hash: '#/info' };
  const p = P(); if (!p || !p.images.length) return { hash: '#/' };
  if (V.page === 'credits' || tab === 'project') return { hash: `#/${p.slug}/1`, then: '#/credits' };
  return { hash: `#/${p.slug}/${V.k + 1}` };
}
let front = frames[0];
function go() {
  const t = target(), cl = D.creditsLayout || 'strip';
  if (+front.dataset.ver === ver) {                       // same draft: just move to the slide
    try { const w = front.contentWindow; w.location.hash = t.hash; if (t.then) setTimeout(() => { w.location.hash = t.then; }, 60); return; } catch {}
  }
  const back = frames.find(f => f !== front), v = ver;
  back.onload = () => {
    back.onload = null;
    if (t.then) setTimeout(() => { try { back.contentWindow.location.hash = t.then; } catch {} }, 80);
    setTimeout(() => {                                    // let the picture paint, then swap
      if (v !== ver) return;
      back.dataset.ver = v; back.classList.remove('back'); front.classList.add('back'); front = back;
    }, t.then ? 380 : 260);
  };
  back.src = `../?draft&credits=${cl}&v=${v}${t.hash}`;
}
let rT = null;
function refresh() { ver++; clearTimeout(rT); rT = setTimeout(go, 280); }
function fit() {
  const c = $('.canvas'), W = c.clientWidth - 48, H = c.clientHeight - 48;
  const [fw, fh] = device === 'desk' ? [1440, 900] : [390, 844];
  const s = Math.min(W / fw, H / fh);
  frames.forEach(f => { f.style.width = fw + 'px'; f.style.height = fh + 'px'; });
  $('.scaler').style.transform = `scale(${s})`;
  const f = $('.frame'); f.style.width = fw * s + 'px'; f.style.height = fh * s + 'px'; f.classList.toggle('phone', device === 'phone');
}
$$('.device button').forEach(b => b.onclick = () => { device = b.dataset.dev; $$('.device button').forEach(x => x.classList.toggle('on', x === b)); fit(); });
addEventListener('resize', fit);

/* ---------- render ---------- */
function render() { renderProjects(); renderStrip(); renderPanel(); }

function renderProjects() {
  $('.plist').innerHTML = D.projects.map((p, i) => {
    const c = p.images.find(x => !x.v) || p.images[0];
    return `<div class="prow ${!V.page && i === V.pi ? 'on' : ''}" draggable="true" data-pi="${i}">
      ${c ? `<img src="${thumb(p, c)}" alt="">` : '<img alt="">'}<div class="t"><b>${esc(p.title) || 'Untitled'}</b><span class="c">${countOf(p)}</span></div></div>`;
  }).join('');
  $$('.pg').forEach(b => b.classList.toggle('on', V.page === b.dataset.page));
  let from = null;
  $$('.prow').forEach(r => {
    const i = +r.dataset.pi;
    r.onclick = () => { V = { pi: i, k: 0, page: null }; multi.clear(); tab = 'slide'; render(); go(); };
    r.ondragstart = () => { from = i; r.classList.add('drag'); };
    r.ondragend = () => { r.classList.remove('drag'); $$('.prow.over').forEach(x => x.classList.remove('over')); };
    r.ondragover = e => { if (from === null) return; e.preventDefault(); r.classList.add('over'); };
    r.ondragleave = () => r.classList.remove('over');
    r.ondrop = e => {
      e.preventDefault(); if (from === null || from === i) return;
      const cur = D.projects[V.pi];
      edit(() => { const [p] = D.projects.splice(from, 1); D.projects.splice(i, 0, p); V.pi = D.projects.indexOf(cur); });
      from = null;
    };
  });
}

function renderStrip() {
  const strip = $('.strip');
  if (V.page) { strip.hidden = true; return; }
  strip.hidden = false;
  const p = P();
  $('.sl').innerHTML = p ? `${esc(p.title) || 'Untitled'}<em>${p.images.length} slide${p.images.length === 1 ? '' : 's'}</em>` : '';
  $('.dpn').textContent = p?.title || '';
  $('.slides').innerHTML = (p?.images || []).map((im, k) => `
    <div class="sld ${k === V.k || multi.has(k) ? 'on' : ''}" draggable="true" data-k="${k}">
      <div class="im"><img src="${thumb(p, im)}" alt="" draggable="false">${im.v ? '<span class="v">Video</span>' : ''}</div>
      <div class="cap">${k + 1} · ${LAYOUTS[modeOf(im)][0]}</div>
    </div>`).join('') +
    (uploading ? `<div class="upl">Adding ${uploading}…</div>` : '') +
    `<button class="addsl" title="Add photos or videos">+</button>`;
  let from = null;
  $$('.sld').forEach(el => {
    const k = +el.dataset.k;
    el.onclick = e => {
      if (e.shiftKey) { const a = Math.min(V.k, k), b = Math.max(V.k, k); for (let i = a; i <= b; i++) multi.add(i); }
      else if (e.metaKey || e.ctrlKey) { multi.has(k) ? multi.delete(k) : multi.add(k); multi.add(V.k); }
      else multi.clear();
      V.k = k; tab = 'slide'; renderStrip(); renderPanel(); go();
    };
    el.ondragstart = e => { from = k; el.classList.add('drag'); e.dataTransfer.setData('text/x-slide', String(k)); };
    el.ondragend = () => { el.classList.remove('drag'); $$('.sld.over').forEach(x => x.classList.remove('over')); };
    el.ondragover = e => { if (from === null) return; e.preventDefault(); el.classList.add('over'); };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = e => {
      if (from === null) return; e.preventDefault(); e.stopPropagation();
      move(from, k); from = null;
    };
  });
  const move = (a, k) => {            // drop on slide k = put it before k
    const to = a < k ? k - 1 : k; if (to === a) return;
    edit(() => { const [im] = p.images.splice(a, 1); p.images.splice(to, 0, im); V.k = to; multi.clear(); });
  };
  const add = $('.addsl');
  add.ondragover = e => { if (from !== null) e.preventDefault(); };
  add.ondrop = e => { if (from === null) return; e.preventDefault(); e.stopPropagation(); move(from, p.images.length); from = null; };
  $('.addsl').onclick = () => $('.filepick').click();
}

function renderPanel() {
  const el = $('.panel');
  if (V.page === 'info') return panelInfo(el);
  if (V.page === 'credits') return panelCreditsPage(el);
  const p = P();
  if (!p) { el.innerHTML = '<p class="empty">Add a project to get started.</p>'; return; }
  const tabs = `<div class="tabs"><button data-tab="slide" class="${tab === 'slide' ? 'on' : ''}">Slide</button><button data-tab="project" class="${tab === 'project' || tab === 'credits' ? 'on' : ''}">Project &amp; credits</button></div>`;
  el.innerHTML = tabs + (tab === 'slide' ? slideHTML(p) : projectHTML(p));
  $$('[data-tab]', el).forEach(b => b.onclick = () => { tab = b.dataset.tab; renderPanel(); go(); });
  tab === 'slide' ? bindSlide(el, p) : bindProject(el, p);
}

function slideHTML(p) {
  if (!p.images.length) return `<p class="empty">This project has no slides yet.<br><br>Click <b>+</b> in the strip below, or drop photos and videos onto the preview.</p>`;
  const sel = [...new Set([V.k, ...multi])].sort((a, b) => a - b), im = p.images[V.k], many = sel.length > 1;
  const m = modeOf(im), anyVideo = sel.some(k => p.images[k].v);
  const vids = allItems().filter(x => x.im.v);
  const run = (() => { let r = 1, best = 0, s = ''; p.images.forEach((x, i) => { r = i && modeOf(x) === modeOf(p.images[i - 1]) ? r + 1 : 1; if (r > best) { best = r; s = modeOf(x); } }); return best >= 3 ? LAYOUTS[s][0] : ''; })();
  return `
    <div class="ph"><b>${many ? `${sel.length} slides selected` : `Slide ${V.k + 1}`}</b><span>${many ? 'changes apply to all of them' : `of ${p.images.length}${im.v ? ' · video' : ''}`}</span></div>
    ${run && !many ? `<div class="note">${run} is used 3 times in a row in this project. Mixing layouts keeps it from feeling repetitive.</div>` : ''}
    <div class="sec"><span class="lab">Layout</span>
      <div class="lays">${Object.entries(LAYOUTS).map(([k, [t, d]]) => {
        const off = k === 'layer' && anyVideo;
        return `<button class="lay ${!many && k === m ? 'on' : ''}" data-m="${k}" ${off ? 'disabled style="opacity:.35;cursor:default"' : ''}>${art(k)}<b>${t}</b><span class="d">${d}</span></button>`;
      }).join('')}</div>
    </div>
    ${!many && m === 'small' ? `<div class="sec"><span class="lab">Position</span><div class="seg">${[['Left', 42], ['Centre', 50], ['Right', 58]].map(([t, x]) => `<button data-x="${x}" class="${(im.x ?? 50) === x ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}
    ${!many && m === 'cover' && !im.v ? `<div class="sec"><span class="lab">Keep in view</span><div class="seg">${[['Top', '50% 15%'], ['Middle', ''], ['Bottom', '50% 85%']].map(([t, v]) => `<button data-fp="${v}" class="${(im.fp || '') === v ? 'on' : ''}">${t}</button>`).join('')}</div><p class="help">Which part stays visible when the screen crops it.</p></div>` : ''}
    ${!many && m === 'layer' ? `<div class="sec"><span class="lab">Video behind it</span>${vids.length ? `<div class="unders">${vids.map(x => `<button data-u="${x.im.f}" class="${(im.u || vids[0].im.f) === x.im.f ? 'on' : ''}" title="${esc(x.p.title)}"><img src="${thumb(x.p, x.im)}" alt=""></button>`).join('')}</div>` : '<p class="help">Add a video to any project first.</p>'}</div>` : ''}
    ${!many ? `<div class="sec"><button class="sw ${im.n && nameOk(m) ? 'on' : ''}" ${nameOk(m) ? '' : 'disabled'}><i></i>Her name behind this slide</button><p class="help">${nameOk(m) ? 'Shows “Lorhaine Mendes” large behind the picture. Best on a few slides only.' : 'Available with Large or Small. Other layouts would cover it.'}</p></div>` : ''}
    <div class="sec"><button class="danger del">${many ? `Delete ${sel.length} slides` : 'Delete slide'}</button></div>`;
}
function bindSlide(el, p) {
  if (!p.images.length) return;
  const sel = [...new Set([V.k, ...multi])], im = p.images[V.k];
  $$('[data-m]', el).forEach(b => b.onclick = () => { if (b.disabled) return; edit(() => sel.forEach(k => setLayout(p.images[k], b.dataset.m))); });
  $$('[data-x]', el).forEach(b => b.onclick = () => edit(() => { im.x = +b.dataset.x; }));
  $$('[data-fp]', el).forEach(b => b.onclick = () => edit(() => { if (b.dataset.fp) im.fp = b.dataset.fp; else delete im.fp; }));
  $$('[data-u]', el).forEach(b => b.onclick = () => edit(() => { im.u = b.dataset.u; }));
  const sw = $('.sw', el); if (sw) sw.onclick = () => edit(() => { im.n = !im.n; });
  $('.del', el).onclick = () => {
    edit(() => { sel.sort((a, b) => b - a).forEach(k => p.images.splice(k, 1)); V.k = Math.max(0, Math.min(Math.min(...sel), p.images.length - 1)); multi.clear(); });
    toast(sel.length > 1 ? 'Slides deleted' : 'Slide deleted', true);
  };
}
function setLayout(im, m) {
  if (m === 'layer' && im.v) return;
  im.m = m;
  if (m === 'small') { im.s = .9; im.x ??= 58; } else { delete im.s; delete im.x; }
  if (m === 'layer') im.u ||= allItems().find(x => x.im.v)?.im.f; else delete im.u;
  if (m !== 'cover') delete im.fp;
}

function projectHTML(p) {
  return `
    <div class="sec">
      <div class="field"><span class="lab">Project name</span><input class="in" data-k="title" value="${esc(p.title)}"></div>
      <div class="field" style="display:grid;grid-template-columns:1fr 90px;gap:8px">
        <div><span class="lab">Client</span><input class="in" data-k="client" value="${esc(p.client)}" placeholder="Optional"></div>
        <div><span class="lab">Year</span><input class="in" data-k="year" value="${esc(p.year)}" placeholder="Optional"></div>
      </div>
    </div>
    <div class="sec"><span class="lab">Credits</span>
      ${(p.credits || []).map((c, i) => `<div class="cred"><input class="in" data-ci="${i}" data-f="role" value="${esc(c.role)}" placeholder="Role"><input class="in" data-ci="${i}" data-f="name" value="${esc(c.name)}" placeholder="Name"><button class="x" data-rm="${i}" title="Remove">×</button></div>`).join('')}
      <button class="addc">+ Add credit</button>
      <p class="help">The preview shows this project’s credits page while you edit.</p>
    </div>
    <div class="sec"><button class="danger delp">Delete project</button></div>`;
}
function bindProject(el, p) {
  // typing: one undo step per field visit
  const typed = (inp, set) => { inp.onfocus = () => snapshot(); inp.oninput = () => { set(inp.value); saved(); renderProjects(); renderStrip(); }; };
  $$('[data-k]', el).forEach(i => typed(i, v => { p[i.dataset.k] = v; }));
  $$('[data-ci]', el).forEach(i => typed(i, v => { p.credits[+i.dataset.ci][i.dataset.f] = v; }));
  $$('[data-rm]', el).forEach(b => b.onclick = () => edit(() => p.credits.splice(+b.dataset.rm, 1)));
  $('.addc', el).onclick = () => { edit(() => (p.credits ||= []).push({ role: '', name: '' })); $$('.cred .in[data-f="role"]').at(-1)?.focus(); };
  $('.delp', el).onclick = () => {
    if (!confirm(`Delete “${p.title}” and all its slides?`)) return;
    edit(() => { D.projects.splice(V.pi, 1); V = { pi: Math.max(0, V.pi - 1), k: 0, page: null }; });
    toast('Project deleted', true);
  };
}

function panelInfo(el) {
  el.innerHTML = `
    <div class="ph"><b>Info page</b></div>
    <div class="field"><span class="lab">Bio</span><textarea class="in bio" rows="4">${esc(D.bio)}</textarea></div>
    <div class="field"><span class="lab">Instagram</span><input class="in ig" value="${esc(D.instagram)}" placeholder="username, without @"></div>`;
  const b = $('.bio', el), i = $('.ig', el);
  b.onfocus = i.onfocus = () => snapshot();
  b.oninput = () => { D.bio = b.value; saved(); };
  i.oninput = () => { D.instagram = i.value.replace(/^@/, '').trim(); saved(); };
}
function panelCreditsPage(el) {
  const cur = D.creditsLayout || 'strip';
  el.innerHTML = `
    <div class="ph"><b>Credits page</b></div>
    <div class="sec"><span class="lab">Layout for every project</span>
      <div class="lays" style="grid-template-columns:1fr">${Object.entries(CREDITS).map(([k, [t, d]]) => `<button class="lay ${k === cur ? 'on' : ''}" data-cl="${k}">${art(k)}<b>${t}</b><span class="d">${d}</span></button>`).join('')}</div>
    </div>`;
  $$('[data-cl]', el).forEach(b => b.onclick = () => edit(() => { D.creditsLayout = b.dataset.cl; }));
}
$$('.pg').forEach(b => b.onclick = () => { V.page = b.dataset.page; multi.clear(); render(); go(); });

/* ---------- new project ---------- */
$('.addp').onclick = () => {
  let slug = 'project', n = 1; while (D.projects.some(p => p.slug === slug)) slug = 'project-' + ++n;
  edit(() => { D.projects.push({ slug, title: 'New project', client: '', year: '', credits: [{ role: 'Styling', name: D.name || '' }, { role: 'Photography', name: '' }], images: [] }); V = { pi: D.projects.length - 1, k: 0, page: null }; tab = 'project'; });
  setTimeout(() => $('.panel [data-k="title"]')?.select(), 30);
};

/* ---------- adding photos and videos: + button, or drop anywhere ---------- */
$('.filepick').onchange = e => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); };
const stageEl = $('.stage');
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', e => { if (!hasFiles(e) || V.page || !P()) return; dragDepth++; stageEl.classList.add('dropping'); });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; stageEl.classList.remove('dropping'); } });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; stageEl.classList.remove('dropping'); if (!V.page && P()) addFiles([...e.dataTransfer.files]); });

async function addFiles(files) {
  const p = P(); if (!p || !files.length) return;
  snapshot();
  uploading = files.length; renderStrip();
  for (const file of files) {
    try {
      const f = nextName(p.slug);
      if (file.type.startsWith('video/')) {
        if (file.size > 90 * 1024 * 1024) throw new Error(`${file.name} is over 90 MB. Export a smaller version and try again.`);
        const { w, h, poster } = await videoInfo(file);
        pending[f] = { mp4: URL.createObjectURL(file), poster: URL.createObjectURL(poster), files: { [`media/video/${f}.mp4`]: file, [`media/video/${f}.jpg`]: poster } };
        p.images.push({ f, w, h, m: 'cover', v: true, n: false });
      } else if (file.type.startsWith('image/')) {
        const bmp = await createImageBitmap(file).catch(() => { throw new Error(`${file.name} can’t be opened here. Export it as a JPG.`); });
        const web = await resize(bmp, 2400, .86), md = await resize(bmp, 1400, .84);
        pending[f] = { web: URL.createObjectURL(web.blob), md: URL.createObjectURL(md.blob), files: { [`media/web/${p.slug}/${f}.webp`]: web.blob, [`media/md/${p.slug}/${f}.webp`]: md.blob } };
        p.images.push({ f, w: web.w, h: web.h, m: 'full', n: false });
      } else throw new Error(`${file.name} isn’t a photo or video.`);
    } catch (err) { toast(err.message || 'That file couldn’t be added'); }
    uploading--; renderStrip();
  }
  V.k = p.images.length - 1; multi.clear(); tab = 'slide';
  saved(); render();
}
function nextName(slug) { const used = new Set(allItems().map(x => x.im.f)); let n = 1, f; do f = `${slug}-${String(n++).padStart(2, '0')}`; while (used.has(f) || pending[f]); return f; }
async function resize(bmp, max, q) {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = new OffscreenCanvas(w, h); c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return { blob: await c.convertToBlob({ type: 'image/webp', quality: q }), w, h };
}
function videoInfo(file) {
  return new Promise((ok, no) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
    v.onloadeddata = () => { v.currentTime = Math.min(.2, (v.duration || 1) / 4); };
    v.onseeked = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); c.toBlob(b => ok({ w: v.videoWidth, h: v.videoHeight, poster: b }), 'image/jpeg', .85); };
    v.onerror = () => no(new Error(`${file.name} can’t play in a browser. Export it as an MP4.`));
  });
}

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  const p = P(); if (V.page || !p?.images.length) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault(); V.k = Math.max(0, Math.min(p.images.length - 1, V.k + (e.key === 'ArrowRight' ? 1 : -1))); multi.clear(); tab = 'slide'; renderStrip(); renderPanel(); go();
    $('.sld.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); $('.panel .del')?.click(); }
});

/* ---------- publish: one commit with the data file and any new media ---------- */
const gh = async (path, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, { ...opt, headers: { Authorization: `Bearer ${localStorage.getItem('lm-gh-token')}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
  return r.json();
};
const b64 = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
async function publish() {
  if (!localStorage.getItem('lm-gh-token') && !(await connect())) return;
  const btn = $('.top .pub'); btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const out = clean(D);
    const files = { 'data/projects.json': new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }) };
    for (const b of Object.values(pending)) if (b.files) Object.assign(files, b.files);
    const tree = [];
    for (const [path, blob] of Object.entries(files)) {
      const { sha } = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(blob), encoding: 'base64' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha });
    }
    const ref = await gh(`/git/ref/heads/${REPO.branch}`), head = await gh(`/git/commits/${ref.object.sha}`);
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Editor update', tree: t.sha, parents: [ref.object.sha] }) });
    await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    published = structuredClone(out);
    for (const b of Object.values(pending)) delete b.files;
    localStorage.removeItem('lm-studio');
    toast('Published. The site updates within a minute.');
  } catch (err) {
    if ([401, 403, 404].includes(err.status)) { localStorage.removeItem('lm-gh-token'); toast('The publishing key didn’t work. Please connect again.'); }
    else toast('Couldn’t publish. Check your connection and try again.');
  }
  btn.textContent = 'Publish'; status();
}
function connect() {
  const dlg = $('.connect'); $('.token', dlg).value = ''; dlg.showModal();
  return new Promise(r => dlg.onclose = () => { const v = $('.token', dlg).value.trim(); if (dlg.returnValue === 'ok' && v) { localStorage.setItem('lm-gh-token', v); r(true); } else r(false); });
}
$('.top .pub').onclick = publish;
$('.discard').onclick = () => {
  if (!confirm('Throw away everything that isn’t published yet?')) return;
  snapshot(); D = structuredClone(published); Object.keys(pending).forEach(k => delete pending[k]);
  localStorage.removeItem('lm-studio'); V = { pi: 0, k: 0, page: null }; multi.clear(); saved(); render();
};
addEventListener('beforeunload', e => { if (Object.values(pending).some(b => b.files)) { e.preventDefault(); e.returnValue = ''; } });
function toast(msg, withUndo = false) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  if (withUndo) { const b = document.createElement('button'); b.textContent = 'Undo'; b.onclick = () => { t.remove(); undo(); }; t.appendChild(b); }
  document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 200); }, withUndo ? 5000 : 2600);
}

/* ---------- go ---------- */
writeDraft(); status(); render(); fit(); go();
