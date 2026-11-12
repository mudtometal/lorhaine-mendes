/* Portfolio editor
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
  layer: ['Layered', 'On top of a photo or video'],
};
const SAMPLE = {
  rows: [['Director & Stylist', 'Taylor Thoroski'], ['Director of Photography', 'Zoe Que'], ['Hair Stylist', 'Sebastien Richard'], ['Make Up Artist', 'Cécile Paravina'],
    ['Manicurist', 'Melvyn Renaud'], ['Talent', 'Ana Elisa Brito'], ['Talent', 'Avishag Amir'], ['Talent', 'Kethia Ngeleza'], ['"Mouthy Jam"', 'Canje'],
    ['Casting', 'Calvin Wilson w/ The Establishement'], ['Video Editors', 'Zoe Que & Dora Abreu'], ['Producer', 'Ella Tyson'], ['Grade House', 'Doma'],
    ['Colourist', 'Thomas Kumeling & Doma'], ['Post EP', 'Jake Evans'], ['Artwork', 'Valentin Van Der Meulen & Fabien Montique'], ['Camera Assistant', 'Ella Delormas'],
    ['Stylist Assistant', 'Gaia De Rosa'], ['Make Up Assistant', 'Toma Marandeau'], ['Light Assistant', 'Elena Santolaya']].map(([role, name]) => ({ role, name })),
  notes: "The designer the model the photographer\nby Miguel Adrover\n\nPortraits by Martin Sabyno\n\nZaza' Art\nwww.z-a-z-a.art\n\nShe's on fa-yeh\nby Brianna Capozi\n\nAnalisa Teachworth Zero\nThe Gaylord Fine Arts, Los Angeles\n\nWomen's History Museum Vintage\n244 Canal Street 3rd Fl, New York"
};
const CREDITS = { strip: ['Strip', 'Pictures in one row, scroll sideways'], stack: ['Stack', 'Credits left, pictures down the right'], grid: ['Grid', 'Credits on top, two columns'] };
const modeOf = im => im.m === 'frame' ? 'full' : LAYOUTS[im.m] ? im.m : 'full';
const nameOk = m => m === 'full' || m === 'small' || m === 'layer';
const art = k => `<div class="art ${k}">${'<i></i>'.repeat(k === 'strip' ? 3 : k === 'grid' ? 4 : 1)}${CREDITS[k] ? '<u></u>' : ''}</div>`;

/* ---------- data ---------- */
let published = await fetch('../data/projects.json', { cache: 'no-cache' }).then(r => r.json());
let D = structuredClone(published);
try { const s = JSON.parse(localStorage.getItem('lm-studio') || 'null'); if (s && s.base === JSON.stringify(published)) D = s.data; } catch {}
const pending = {};
// one-time setup link: …/admin/#key=XXXX saves the publishing key in this browser, then the key is wiped from the address
function takeKey() {
  const k = location.hash.match(/(?:^#|&)key=([^&]+)/);
  if (!k) return;
  try { localStorage.setItem('lm-gh-token', decodeURIComponent(k[1])); } catch {}
  window.history.replaceState(null, "", location.pathname + location.search);
  setTimeout(() => toast('Publishing is set up on this computer'), 400);
}
takeKey(); addEventListener('hashchange', takeKey);
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
$$('.device button').forEach(b => b.onclick = () => { device = b.dataset.dev; $$('.device button').forEach(x => x.classList.toggle('on', x === b)); fit(); renderStrip(); renderPanel(); });
addEventListener('resize', fit);

/* ---------- render ---------- */
function render() { renderProjects(); renderStrip(); renderPanel(); }

function renderProjects() {
  $('.plist').innerHTML = D.projects.map((p, i) => {
    const c = p.images.find(x => !x.v) || p.images[0];
    return `<div class="prow ${!V.page && i === V.pi ? 'on' : ''}" draggable="true" data-pi="${i}">
      ${c ? `<img src="${thumb(p, c)}" alt="">` : '<img alt="">'}<div class="t"><b>${esc(p.title) || 'Untitled'}</b><span class="c">${countOf(p)}</span></div><button class="rm" data-rm="${i}" title="Delete project" aria-label="Delete ${esc(p.title)}">×</button></div>`;
  }).join('');
  $$('.pg').forEach(b => b.classList.toggle('on', V.page === b.dataset.page));
  let from = null;
  $$('.prow').forEach(r => {
    const i = +r.dataset.pi;
    r.onclick = e => {
      if (e.target.closest('.rm')) {
        const p = D.projects[i];
        if (p.images.length && !confirm(`Delete “${p.title}” and its ${p.images.length} slides?`)) return;
        edit(() => { D.projects.splice(i, 1); if (V.pi >= D.projects.length) V.pi = Math.max(0, D.projects.length - 1); V.k = 0; V.page = null; });
        return toast('Project deleted', true);
      }
      V = { pi: i, k: 0, page: null }; multi.clear(); tab = 'slide'; render(); go();
    };
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
      <div class="cap">${k + 1} · ${LAYOUTS[modeOf(view(im))][0]}${device === 'phone' && im.ph ? ' · phone' : ''}</div>
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

/* ---------- per-device settings ----------
   Desktop settings live on the slide; phone settings live in slide.ph when they differ. */
const fnv = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const SCREENS = { desk: [1440, 900], phone: [390, 844] };
const SIZE = { full: 1, small: .55, layer: .7 };
const view = im => device === 'phone' && im.ph ? { ...im, ...im.ph } : im;      // what this device shows
const tgt = im => device === 'phone' ? (im.ph ||= {}) : im;                  // where edits go
const clamp = (v, a, b) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
function coverBox(w0, h0, sc, x, y) {
  const [vw, vh] = SCREENS[device], c = Math.max(vw / w0, vh / h0), w = w0 * c * sc, h = h0 * c * sc;
  return { w, h, left: clamp(vw * (x ?? 50) / 100 - w / 2, 0, vw - w), top: clamp(vh * (y ?? 50) / 100 - h / 2, 0, vh - h), vw, vh };
}
function boxFor(L, mode) {                         // same maths as the site
  const [vw, vh] = SCREENS[device], m = device === 'phone', UI = 44;
  if (mode === 'cover') return coverBox(L.w, L.h, Math.max(1, L.s ?? 1), L.x, L.y);
  const r = L.w / L.h, pad = m ? (mode === 'full' ? 0 : 14) : 20, aw = vw - pad * 2, ah = vh - UI * 2;
  let h = ah, w = h * r; if (w > aw) { w = aw; h = w / r; }
  const sc = Math.min(2, Math.max(.2, L.s ?? SIZE[mode] ?? 1)); w *= sc; h *= sc;
  return { w, h, left: clamp(vw * (L.x ?? 50) / 100 - w / 2, pad, vw - w - pad), top: clamp(vh * (L.y ?? 50) / 100 - h / 2, UI, vh - h - UI), vw, vh };
}
const bgBox = (L, u) => coverBox(u.w, u.h, Math.min(2, Math.max(.2, L.bs ?? 1)), L.bx, L.by);

// layered slides: the background is its own media {f,w,h,v,slug}, picked from the site or uploaded
const bgMedia = () => {                       // everything that can go behind: all slides + uploaded backgrounds
  const seen = new Set(), out = [];
  const add = (x, label) => { if (!x?.f || seen.has(x.f)) return; seen.add(x.f); out.push({ ...x, label }); };
  allItems().forEach(({ p, im }) => add({ f: im.f, w: im.w, h: im.h, v: !!im.v, slug: p.slug }, p.title));
  allItems().forEach(({ im }) => [im.ub, im.ph?.ub].forEach(u => add(u, 'Uploaded background')));
  return out;
};
const ubOf = L => L.ub?.f ? L.ub : (() => { const x = allItems().find(y => y.im.f === L.u) || allItems().find(y => y.im.v); return x ? { f: x.im.f, w: x.im.w, h: x.im.h, v: !!x.im.v, slug: x.p.slug } : null; })();
const ubThumb = u => u.v ? (pending[u.f]?.poster || `../media/video/${u.f}.jpg`) : (pending[u.f]?.md || `../media/md/${u.slug || 'bg'}/${u.f}.webp`);

function slideHTML(p) {
  if (!p.images.length) return `<p class="empty">This project has no slides yet.<br><br>Click <b>+</b> in the strip below, or drop photos and videos onto the preview.</p>`;
  const sel = [...new Set([V.k, ...multi])].sort((a, b) => a - b), im = p.images[V.k], many = sel.length > 1;
  const L = view(im), m = modeOf(L), anyVideo = sel.some(k => p.images[k].v);
  const dev = device === 'phone' ? 'Phone' : 'Desktop';
  const others = allItems().filter(x => x.im !== im && !(modeOf(x.im) === 'layer' && !x.im.v));
  const run = (() => { let r = 1, best = 0, s = ''; p.images.forEach((x, i) => { r = i && modeOf(view(x)) === modeOf(view(p.images[i - 1])) ? r + 1 : 1; if (r > best) { best = r; s = modeOf(view(x)); } }); return best >= 3 ? LAYOUTS[s][0] : ''; })();
  const ub = ubOf(L);
  return `
    <div class="ph"><b>${many ? `${sel.length} slides selected` : `Slide ${V.k + 1}`}</b><span>${many ? 'changes apply to all of them' : `of ${p.images.length}${im.v ? ' · video' : ''}`}</span></div>
    <div class="devnote"><span class="pill">${dev} layout</span>${device === 'phone'
      ? (im.ph && !many ? `<button class="link same">Use the desktop layout</button>` : '<span>Same as desktop until you change it</span>')
      : '<span>Switch to Phone at the top to set the phone layout</span>'}</div>
    ${run && !many ? `<div class="note">${run} is used 3 times in a row on ${dev.toLowerCase()}. Mixing layouts keeps it from feeling repetitive.</div>` : ''}
    <div class="sec"><span class="lab">Layout</span>
      <div class="lays">${Object.entries(LAYOUTS).map(([k, [t, d]]) => {
        const off = k === 'layer' && anyVideo;
        return `<button class="lay ${!many && k === m ? 'on' : ''}" data-m="${k}" ${off ? 'disabled' : ''}>${art(k)}<b>${t}</b><span class="d">${d}</span></button>`;
      }).join('')}</div>
    </div>
    ${!many ? padHTML(p, im, L, m) : ''}
    ${!many && m === 'layer' ? `<div class="sec"><span class="lab">Behind it</span>
      <div class="bgcur">${ub ? `<img src="${ubThumb(ub)}" alt="">` : '<span class="nobg">Nothing yet</span>'}
        <div><button class="btn2 upbg">${bgUp ? 'Adding…' : 'Upload new'}</button><button class="btn2 pickbg">${pickOpen ? 'Hide' : 'Choose from site'}</button></div></div>
      ${pickOpen ? `<div class="unders">${bgMedia().filter(u => u.f !== im.f).map(u => `<button data-ub="${u.f}" class="${ub?.f === u.f ? 'on' : ''}" title="${esc(u.label)}${u.v ? ' · video' : ''}"><img src="${ubThumb(u)}" alt="">${u.v ? '<span class="v">Video</span>' : ''}</button>`).join('')}</div>` : ''}
      <p class="help">Upload a new photo or video, or pick one from the site. It only shows behind this slide.</p></div>
` : ''}
    ${!many ? `<div class="sec"><button class="sw ${L.n && nameOk(m) ? 'on' : ''}" ${nameOk(m) ? '' : 'disabled'}><i></i>Name in the background</button><p class="help">${nameOk(m) ? `“${esc(D.backText || D.name || 'Lorhaine Mendes')}” in large type behind the picture. Move it in the box above. Looks best on a few slides only.` : 'Not with Full screen. The picture would cover it.'}</p></div>` : ''}
    <div class="sec"><button class="danger del">${many ? `Delete ${sel.length} slides` : 'Delete slide'}</button></div>`;
}
/* ---------- the placement box ----------
   A little screen showing the slide as it will look. Drag the picture (and on Layered the
   background) to move it, the slider sizes whatever is selected (up to 200%), and the
   Name handle moves her name anywhere up/down/sideways. Everything snaps to centre and thirds. */
let layerSel = 'pic';
function padHTML(p, im, L, m) {
  const [vw, vh] = SCREENS[device], ub = m === 'layer' ? ubOf(L) : null, name = L.n && nameOk(m);
  const selBg = m === 'layer' && layerSel === 'bg' && ub;
  const sz = Math.round((selBg ? (L.bs ?? 1) : (L.s ?? SIZE[m] ?? 1)) * 100);
  return `<div class="sec"><span class="lab">Size and position</span>
    ${m === 'layer' ? `<div class="seg mini2"><button data-ls="pic" class="${selBg ? '' : 'on'}">Picture</button><button data-ls="bg" class="${selBg ? 'on' : ''}" ${ub ? '' : 'disabled'}>Background</button></div>` : ''}
    <div class="pad ${device} ${selBg ? 'bgsel' : ''}" style="aspect-ratio:${vw}/${vh}">
      ${ub ? `<div class="bbox ${selBg ? 'act' : ''}"><img src="${ubThumb(ub)}" alt="" draggable="false"></div>` : ''}
      ${name ? `<div class="pname"><div class="prun">${`<span>${esc(D.backText || D.name || 'Lorhaine Mendes')}</span>`.repeat(3)}</div></div><button class="nhandle" title="Drag to move the name">Name</button>` : ''}
      <div class="pbox ${selBg ? '' : 'act'}"><img src="${thumb(p, im)}" alt="" draggable="false"></div>
    </div>
    <div class="sizer"><span>Size</span><input type="range" min="${m === 'cover' && !selBg ? 100 : 20}" max="200" step="1" value="${sz}"><b></b></div>
    <p class="help">${m === 'cover' ? 'Fills the screen. Make it bigger to zoom in, then drag to choose what shows.' : m === 'layer' ? 'Drag the picture or the background to move it. The slider sizes the one selected.' : 'Drag the picture to place it.'} <button class="link centre">Centre it</button> · ${snapLink()}</p>
    ${name ? `<p class="help">Drag <b>Name</b> to move her name up, down or sideways. It stays where you put it. ${L.ny != null || L.nx != null ? '<button class="link nreset">Reset name</button>' : ''}</p>` : ''}
  </div>`;
}
function bindPad(el, p, im) {
  const pad = $('.pad', el); if (!pad) return;
  const L0 = view(im), m = modeOf(L0), ub = m === 'layer' ? ubOf(L0) : null;
  const pbox = $('.pbox', pad), bbox = $('.bbox', pad), range = $('.sizer input', el), out = $('.sizer b', el);
  const t = { ...L0 };                                     // working copy while dragging
  const pct = (b, box) => Object.assign(box.style, { left: b.left / b.vw * 100 + '%', top: b.top / b.vh * 100 + '%', width: b.w / b.vw * 100 + '%', height: b.h / b.vh * 100 + '%' });
  const draw = () => { pct(boxFor(t, m), pbox); if (bbox && ub) pct(bgBox(t, ub), bbox); out.textContent = range.value + '%'; drawName(); };
  const sel = () => (m === 'layer' && layerSel === 'bg' && ub) ? 'bg' : 'pic';
  const setSel = k => { if (k === sel()) return; layerSel = k; renderPanel(); };
  // picture
  let c0;
  const centreOf = b => [(b.left + b.w / 2) / b.vw * 100, (b.top + b.h / 2) / b.vh * 100];
  drag(pbox, pad, () => { setSelQuiet('pic'); c0 = m === 'cover' ? [t.x ?? 50, t.y ?? 50] : centreOf(boxFor(t, m)); }, (dx, dy, W, H, ev) => {
    let gx, gy;                                              // the box follows the hand (full screen too: it pans)
    [t.x, gx] = snap(Math.min(100, Math.max(0, c0[0] + dx / W * 100)), ev);
    [t.y, gy] = snap(Math.min(100, Math.max(0, c0[1] + dy / H * 100)), ev);
    [t.x, t.y] = centreOf(boxFor(t, m));                     // stop at the edges (no dead zone when dragging back)
    draw(); guides(pad, gx, gy);
  }, () => edit(() => { const g = tgt(im); g.x = +t.x.toFixed(1); g.y = +t.y.toFixed(1); }));
  // background
  if (bbox && ub) drag(bbox, pad, () => { setSelQuiet('bg'); c0 = [t.bx ?? 50, t.by ?? 50]; }, (dx, dy, W, H, ev) => {
    const b = bgBox(t, ub), big = b.w > b.vw || b.h > b.vh; let gx, gy;
    [t.bx, gx] = snap(Math.min(100, Math.max(0, c0[0] + dx / W * 100)), ev);
    [t.by, gy] = snap(Math.min(100, Math.max(0, c0[1] + dy / H * 100)), ev);
    [t.bx, t.by] = centreOf(bgBox(t, ub));
    draw(); guides(pad, big ? null : gx, big ? null : gy);
  }, () => edit(() => { const g = tgt(im); g.bx = +t.bx.toFixed(1); g.by = +t.by.toFixed(1); }));
  function setSelQuiet(k) { if (m !== 'layer' || !ub) return; layerSel = k; pbox.classList.toggle('act', k === 'pic'); bbox?.classList.toggle('act', k === 'bg'); pad.classList.toggle('bgsel', k === 'bg');
    $$('[data-ls]', el).forEach(b => b.classList.toggle('on', b.dataset.ls === k));
    range.min = 20; range.value = Math.round((k === 'bg' ? (t.bs ?? 1) : (t.s ?? SIZE[m] ?? 1)) * 100); out.textContent = range.value + '%'; }
  $$('[data-ls]', el).forEach(b => b.onclick = () => setSel(b.dataset.ls));
  range.oninput = () => { range.value = snapSize(+range.value); if (sel() === 'bg') t.bs = range.value / 100; else t.s = range.value / 100; draw(); };
  range.onchange = () => edit(() => { const g = tgt(im), v = +(range.value / 100).toFixed(2); if (sel() === 'bg') g.bs = v; else g.s = v; });
  $('.centre', el).onclick = () => edit(() => { const g = tgt(im); if (sel() === 'bg') { delete g.bx; delete g.by; } else { delete g.x; delete g.y; } });
  // her name: placed on the screen (not tied to the picture)
  const band = $('.pname', pad), run = $('.prun', pad), handle = $('.nhandle', pad);
  function nameGeom() {
    const [vw, vh] = SCREENS[device], phone = device === 'phone', H = fnv(im.f), UI = 44, b = boxFor(t, m);
    let f = phone ? vh * .13 : vh * .38, c;
    if (t.ny != null || t.nx != null) c = t.ny != null ? t.ny / 100 : (phone ? (b.top + b.h + f * .22) / vh : .5 + (((H >>> 8) % 100) / 100 - .5) * .36);
    else if (!phone) c = (Math.min(Math.max((.5 + (((H >>> 8) % 100) / 100 - .5) * .36) * vh - f / 2, UI + 6), vh - UI - 6 - f) + f / 2) / vh;
    else { const above = b.top - UI, below = vh - UI - (b.top + b.h); f = Math.max(1, Math.min(vh * .13, Math.max(above, below) * 1.2)); const tk = f * .28;
      c = ((above >= below ? Math.max(UI, b.top - f + tk) : Math.min(b.top + b.h - tk, vh - UI - f)) + f / 2) / vh; }
    return { f, c, vh };
  }
  function drawName() {
    if (!band) return;
    const { f, c, vh } = nameGeom(), P = pad.clientHeight, fs = f / vh * P;
    run.style.fontSize = fs + 'px';
    const top = Math.min(Math.max(c * P - fs / 2, 0), P - fs);
    Object.assign(band.style, { top: top + 'px', height: fs + 'px' });
    handle.style.top = top + fs / 2 + 'px';
    const H = fnv(im.f), sp = run.children[0].offsetWidth;
    let x = t.nx;
    if (x == null) {
      if (device === 'phone' && t.ny == null) { const W = pad.clientWidth, tw = sp - fs * .35, j = (((H >>> 4) % 100) / 100 - .5) * W * .16; x = ((sp + tw / 2) - W / 2 - j) / (sp * 3) * 100; }
      else x = (H % 3333) / 100;
    }
    run.style.transform = `translateX(${-x}%)`; run.dataset.x = x;
  }
  if (handle) {
    let n0, x0;
    drag(handle, pad, () => { n0 = nameGeom().c * 100; x0 = +run.dataset.x; }, (dx, dy, W, H, ev) => {
      const sp = run.children[0].offsetWidth; let gy;
      [t.ny, gy] = snap(Math.min(100, Math.max(0, n0 + dy / H * 100)), ev);
      t.nx = ((x0 - dx / (sp * 3) * 100) % (100 / 3) + 100 / 3) % (100 / 3);    // the line repeats, so it wraps
      drawName(); guides(pad, null, gy);
    }, () => edit(() => { const g = tgt(im); g.ny = +t.ny.toFixed(1); g.nx = +t.nx.toFixed(2); }));
  }
  const nr = $('.nreset', el); if (nr) nr.onclick = () => edit(() => { const g = tgt(im); delete g.ny; delete g.nx; });
  draw();
}
let snapOn = (() => { try { return localStorage.getItem('lm-snap') !== 'off'; } catch { return true; } })();
const LINES = [100 / 3, 50, 200 / 3];
// returns [value, line it snapped to or null]
function snap(v, ev, targets = LINES, reach = 1.8) {
  if (!snapOn || ev?.altKey) return [v, null];
  for (const t of targets) if (Math.abs(v - t) <= reach) return [t, t];
  return [v, null];
}
function snapSize(v) { if (!snapOn) return v; for (const t of [200, 150, 100, 75, 50, 33]) if (Math.abs(v - t) <= 2) return t; return v; }
function guides(pad, gx, gy) {
  let v = $('.gv', pad), h = $('.gh', pad);
  if (!v) { v = document.createElement('i'); v.className = 'gv'; h = document.createElement('i'); h.className = 'gh'; pad.append(v, h); }
  v.hidden = gx == null; h.hidden = gy == null;
  if (gx != null) v.style.left = gx + '%';
  if (gy != null) h.style.top = gy + '%';
}
const snapLink = () => `<button class="link snapt">${snapOn ? 'Snapping on' : 'Snapping off'}</button>`;
function bindSnapLinks(el) { $$('.snapt', el).forEach(b => b.onclick = () => { snapOn = !snapOn; try { localStorage.setItem('lm-snap', snapOn ? 'on' : 'off'); } catch {} renderPanel(); }); }
// drag: move(totalDx, totalDy, areaW, areaH, event) — totals from where the drag started
function drag(handle, area, start, move, done) {
  handle.onpointerdown = e => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); start();
    const x0 = e.clientX, y0 = e.clientY, R = area.getBoundingClientRect();
    area.classList.add('dragging');
    handle.onpointermove = ev => move(ev.clientX - x0, ev.clientY - y0, R.width, R.height, ev);
    handle.onpointerup = () => { handle.onpointermove = handle.onpointerup = null; area.classList.remove('dragging'); guides(area, null, null); done(); };
  };
}
function bindSlide(el, p) {
  if (!p.images.length) return;
  const sel = [...new Set([V.k, ...multi])], im = p.images[V.k];
  $$('[data-m]', el).forEach(b => b.onclick = () => { if (b.disabled) return; edit(() => sel.forEach(k => setLayout(p.images[k], b.dataset.m))); });
  $$('[data-ub]', el).forEach(b => b.onclick = () => { pickOpen = false; const u = bgMedia().find(x => x.f === b.dataset.ub); if (!u) return; edit(() => { const g = tgt(im); const { label, ...ub } = u; g.ub = ub; delete g.u; }); });
  const up = $('.upbg', el); if (up) up.onclick = () => { bgFor = im; $('.bgpick').click(); };
  const pk = $('.pickbg', el); if (pk) pk.onclick = () => { pickOpen = !pickOpen; renderPanel(); };
  const sw = $('.sw', el); if (sw) sw.onclick = () => edit(() => { tgt(im).n = !view(im).n; });
  const same = $('.same', el); if (same) same.onclick = () => edit(() => { delete im.ph; });
  if (sel.length === 1) bindPad(el, p, im);
  bindSnapLinks(el);
  $('.del', el).onclick = () => {
    edit(() => { sel.sort((a, b) => b - a).forEach(k => p.images.splice(k, 1)); V.k = Math.max(0, Math.min(Math.min(...sel), p.images.length - 1)); multi.clear(); });
    toast(sel.length > 1 ? 'Slides deleted' : 'Slide deleted', true);
  };
}
function setLayout(im, m) {
  if (m === 'layer' && im.v) return;
  const g = tgt(im);
  g.m = m;
  delete g.s; delete g.x; delete g.y; delete g.fp;          // a new layout starts from its own defaults (the name keeps its place)
  if (m === 'small' && device === 'desk') g.x = 64;
  if (m === 'layer') { if (!view(im).ub) { const u = ubOf(view(im)); if (u) g.ub = u; } } else { delete g.u; delete g.ub; delete g.bs; delete g.bx; delete g.by; delete g.bfp; }
  if (device === 'phone' && im.ph && Object.keys(im.ph).length === 1 && im.ph.m === im.m) delete im.ph;   // same as desktop again
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
    <div class="sec"><span class="lab">Extra lines <em class="help" style="font-style:normal">(optional)</em></span>
      <textarea class="in" data-k="notes" rows="8" placeholder="e.g. Portraits by …&#10;Location, city">${esc(p.notes)}</textarea>
      <p class="help">Shown next to the credits, in the typewriter font when that style is on. Leave an empty line between groups.</p></div>
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
    <div class="ph"><b>Site</b></div>
    <div class="field"><span class="lab">Name in the top corner</span><input class="in sn" value="${esc(D.name)}" placeholder="Lorhaine Mendes"></div>
    <div class="field"><span class="lab">Name style</span>
      <div class="seg hfont">${[['sans', 'Simple', "'Inter Tight',sans-serif"], ['mono', 'Mono', "'IBM Plex Mono',monospace"], ['times', 'Times', "'Tinos',serif"], ['serif', 'Bodoni', "'Bodoni Moda',serif"]].map(([k, t, f]) => `<button data-hf="${k}" class="${(D.head?.font || 'sans') === k ? 'on' : ''}" style="font-family:${f};font-weight:${D.head?.bold ? 700 : 400}">${t}</button>`).join('')}</div>
      <button class="sw hbold ${D.head?.bold ? 'on' : ''}" style="margin-top:10px"><i></i>Bold</button>
      <div class="sizer"><span>Size</span><input class="hsize" type="range" min="13" max="44" step="1" value="${D.head?.size || 15}"><b>${D.head?.size || 15}px</b></div></div>
    <div class="field"><span class="lab">Big text behind pictures</span><input class="in bt" value="${esc(D.backText || '')}" placeholder="${esc(D.name || 'Lorhaine Mendes')}"><p class="help">Leave empty to use the name above.</p></div>
    <div class="ph" style="margin-top:22px"><b>Info page</b></div>
    <div class="field"><span class="lab">Bio</span><textarea class="in bio" rows="4">${esc(D.bio)}</textarea></div>
    <div class="field"><span class="lab">Email</span><input class="in em" type="email" value="${esc(D.email)}" placeholder="name@example.com"><p class="help">“Write something” on the Info page opens an email to this address.</p></div>
    <div class="field"><span class="lab">Instagram</span><input class="in ig" value="${esc(D.instagram)}" placeholder="username, without @"><p class="help">Leave empty to hide the Instagram link.</p></div>`;
  const b = $('.bio', el), i = $('.ig', el), em = $('.em', el), sn = $('.sn', el), bt = $('.bt', el);
  b.onfocus = i.onfocus = em.onfocus = sn.onfocus = bt.onfocus = () => snapshot();
  const head = () => (D.head ||= {});
  $$('[data-hf]', el).forEach(b => b.onclick = () => edit(() => { if (b.dataset.hf === 'sans') delete head().font; else head().font = b.dataset.hf; }));
  $('.hbold', el).onclick = () => edit(() => { head().bold = !D.head?.bold; if (!head().bold) delete head().bold; });
  const hs = $('.hsize', el); hs.oninput = () => { hs.nextElementSibling.textContent = hs.value + 'px'; };
  hs.onchange = () => edit(() => { if (+hs.value === 15) delete head().size; else head().size = +hs.value; });
  sn.oninput = () => { D.name = sn.value; bt.placeholder = sn.value || 'Lorhaine Mendes'; saved(); };
  bt.oninput = () => { if (bt.value.trim()) D.backText = bt.value; else delete D.backText; saved(); };
  em.oninput = () => { D.email = em.value.trim(); saved(); };
  b.oninput = () => { D.bio = b.value; saved(); };
  i.oninput = () => { D.instagram = i.value.replace(/^@/, '').trim(); saved(); };
}
function panelCreditsPage(el) {
  const cur = D.creditsLayout || 'strip';
  el.innerHTML = `
    <div class="ph"><b>Credits page</b></div>
    <div class="sec"><span class="lab">Layout for every project</span>
      <div class="lays" style="grid-template-columns:1fr">${Object.entries(CREDITS).map(([k, [t, d]]) => `<button class="lay ${k === cur ? 'on' : ''}" data-cl="${k}">${art(k)}<b>${t}</b><span class="d">${d}</span></button>`).join('')}</div>
    </div>
    <div class="sec"><span class="lab">Text style</span>
      <div class="lays">
        <button class="lay ${D.creditsType === 'dual' ? '' : 'on'}" data-ct="simple"><div class="tstyle s1"><i>Styling</i><b>Lorhaine Mendes</b></div><b>Simple</b><span class="d">The site’s own font</span></button>
        <button class="lay ${D.creditsType === 'dual' ? 'on' : ''}" data-ct="dual"><div class="tstyle s2"><i>STYLING</i><b>Lorhaine Mendes</b><u>NOTES</u></div><b>Bold + typewriter</b><span class="d">Bold table, typewriter notes</span></button>
      </div></div>`;
  $$('[data-cl]', el).forEach(b => b.onclick = () => edit(() => { D.creditsLayout = b.dataset.cl; }));
  $$('[data-ct]', el).forEach(b => b.onclick = () => {
    const dual = b.dataset.ct === 'dual';
    let filled = 0;
    edit(() => {
      if (!dual) return delete D.creditsType;
      D.creditsType = 'dual';
      // projects whose credits aren't written yet get the reference copy, ready to edit
      D.projects.forEach(p => {
        const unwritten = !String(p.notes || '').trim() && (p.credits || []).every(c => !c.name || /^tbc$/i.test(c.name.trim()) || c.name.trim() === (D.name || '').trim());
        if (unwritten) { p.credits = SAMPLE.rows.map(r => ({ ...r })); p.notes = SAMPLE.notes; filled++; }
      });
    });
    if (filled) toast(`Sample credits added to ${filled} project${filled > 1 ? 's' : ''}. Edit them under Project & credits.`, true);
  });
}
$$('.pg').forEach(b => b.onclick = () => { V.page = b.dataset.page; multi.clear(); render(); go(); });

/* ---------- new project ---------- */
$('.addp').onclick = () => {
  let slug = 'project', n = 1; while (D.projects.some(p => p.slug === slug)) slug = 'project-' + ++n;
  edit(() => { D.projects.push({ slug, title: 'New project', client: '', year: '', credits: [{ role: 'Styling', name: D.name || '' }, { role: 'Photography', name: '' }], images: [] }); V = { pi: D.projects.length - 1, k: 0, page: null }; tab = 'project'; });
  setTimeout(() => $('.panel [data-k="title"]')?.select(), 30);
};

/* ---------- adding photos and videos: + button, or drop anywhere ---------- */
let bgFor = null, bgUp = false, pickOpen = false;
$('.bgpick').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; const im = bgFor; if (!file || !im) return;
  bgUp = true; renderPanel();
  try {
    const f = nextName('bg');
    let ub;
    if (file.type.startsWith('video/')) {
      if (file.size > 90 * 1024 * 1024) throw new Error(`${file.name} is over 90 MB. Export a smaller version and try again.`);
      const { w, h, poster } = await videoInfo(file);
      pending[f] = { mp4: URL.createObjectURL(file), poster: URL.createObjectURL(poster), files: { [`media/video/${f}.mp4`]: file, [`media/video/${f}.jpg`]: poster } };
      ub = { f, w, h, v: true, slug: 'bg' };
    } else if (file.type.startsWith('image/')) {
      const bmp = await createImageBitmap(file).catch(() => { throw new Error(`${file.name} can’t be opened here. Export it as a JPG.`); });
      const web = await resize(bmp, 2400, .86), md = await resize(bmp, 1400, .84);
      pending[f] = { web: URL.createObjectURL(web.blob), md: URL.createObjectURL(md.blob), files: { [`media/web/bg/${f}.webp`]: web.blob, [`media/md/bg/${f}.webp`]: md.blob } };
      ub = { f, w: web.w, h: web.h, slug: 'bg' };
    } else throw new Error(`${file.name} isn’t a photo or video.`);
    bgUp = false;
    edit(() => { const g = tgt(im); g.ub = ub; delete g.u; delete g.bs; delete g.bx; delete g.by; delete g.bfp; });
  } catch (err) { bgUp = false; renderPanel(); toast(err.message || 'That file couldn’t be added'); }
};
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
function nextName(slug) { const used = new Set([...allItems().map(x => x.im.f), ...bgMedia().map(u => u.f)]); let n = 1, f; do f = `${slug}-${String(n++).padStart(2, '0')}`; while (used.has(f) || pending[f]); return f; }
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
/* ---------- password lock ----------
   The publishing key is stored in data/publish.json, encrypted with a password you share.
   Typing the password unlocks it in the browser (remembered on that computer). Set up once. */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64d = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
async function passKey(pw, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function lockKey(token, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passKey(pw, salt), enc.encode(token));
  return { v: 1, salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) };
}
async function unlockKey(lock, pw) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(lock.iv) }, await passKey(pw, b64d(lock.salt)), b64d(lock.ct));
  return dec.decode(pt);
}
const getLock = () => fetch('../data/publish.json?' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
let lockFile = null;                      // set during first-time setup, published with the next Publish
function ask(dlg, err = '') { dlg.querySelectorAll('input').forEach(i => i.value = ''); dlg.querySelector('.err').textContent = err; dlg.showModal(); return new Promise(r => dlg.onclose = () => r(dlg.returnValue === 'ok')); }
async function unlock(force = false) {
  if (!force && localStorage.getItem('lm-gh-token')) return true;
  const lock = await getLock();
  if (!lock) return setup();
  const dlg = $('.unlockdlg');
  let err = '';
  for (;;) {
    if (!(await ask(dlg, err))) return false;
    try { localStorage.setItem('lm-gh-token', await unlockKey(lock, $('.pw', dlg).value)); toast('Unlocked on this computer'); return true; }
    catch { err = 'That password isn’t right.'; }
  }
}
async function setup() {
  const dlg = $('.setupdlg');
  if (!(await ask(dlg))) return false;
  const key = $('.k', dlg).value.trim(), pw = $('.p1', dlg).value, pw2 = $('.p2', dlg).value;
  if (!key || pw.length < 4 || pw !== pw2) { toast(!key ? 'Paste the publishing key' : pw !== pw2 ? 'The two passwords don’t match' : 'Use at least 4 characters'); return setup(); }
  localStorage.setItem('lm-gh-token', key);
  lockFile = await lockKey(key, pw);
  toast('Password set. It goes live with your next Publish.');
  return true;
}
async function publish() {
  if (!(await unlock())) return;
  const btn = $('.top .pub'); btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const out = clean(D);
    const files = { 'data/projects.json': new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }) };
    for (const b of Object.values(pending)) if (b.files) Object.assign(files, b.files);
    if (lockFile) files['data/publish.json'] = new Blob([JSON.stringify(lockFile)], { type: 'application/json' });
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
    lockFile = null;
    localStorage.removeItem('lm-studio');
    toast('Published. The site updates within a minute.');
  } catch (err) {
    if ([401, 403, 404].includes(err.status)) { localStorage.removeItem('lm-gh-token'); toast(lockFile ? 'That publishing key didn’t work. Check it and try again.' : 'Publishing needs to be unlocked again. Press Publish and enter the password.'); lockFile = null; }
    else toast('Couldn’t publish. Check your connection and try again.');
  }
  btn.textContent = 'Publish'; status();
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
(async () => {                 // the editor is behind the shared password once it has been set
  if (localStorage.getItem('lm-gh-token')) return;
  const lock = await getLock(); if (!lock) return;
  document.body.classList.add('locked');
  if (await unlock(true)) document.body.classList.remove('locked');
  else { document.body.classList.add('locked'); $('.lockwall').hidden = false; }
})();
