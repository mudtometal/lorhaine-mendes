/* Lorhaine Mendes — Studio
   Edits data/projects.json and adds media. Every change shows straight away in the previews
   (desktop + phone, the real site reading the unsaved draft). Publish sends it live.            */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REPO = { owner: 'mudtometal', repo: 'lorhaine-mendes', branch: 'main' };

const STYLES = { cover: 'Full screen', full: 'Large', small: 'Small', layer: 'Layered' };
const CLAYOUTS = { strip: 'Strip', stack: 'Stack', grid: 'Grid' };
const modeOf = im => im.m === 'frame' ? 'full' : STYLES[im.m] ? im.m : 'full';

/* ---------- state ---------- */
let published = await fetch('../data/projects.json', { cache: 'no-cache' }).then(r => r.json());
let D = structuredClone(published);
try { const saved = JSON.parse(localStorage.getItem('lm-studio') || 'null'); if (saved && saved.base === JSON.stringify(published)) D = saved.data; } catch {}
const pending = {};      // f -> { md, web, poster, mp4 } object URLs  +  files: { path: Blob }
let sel = null;          // { pi, k }

const src = (slug, im, size = 'md') => im.v ? (pending[im.f]?.poster || `../media/video/${im.f}.jpg`) : (pending[im.f]?.[size] || `../media/${size}/${slug}/${im.f}.webp`);
const allItems = () => D.projects.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, im })));
const dirty = () => JSON.stringify(clean(D)) !== JSON.stringify(published) || Object.values(pending).some(b => b.files);

/* ---------- save the draft + refresh previews ---------- */
let pvT = null;
function changed(rerender = true) {
  try { localStorage.setItem('lm-studio', JSON.stringify({ base: JSON.stringify(published), data: D })); } catch {}
  writeDraft();
  if (rerender) render();
  status();
  clearTimeout(pvT); pvT = setTimeout(reloadPreviews, 350);
}
function writeDraft() {
  const blobs = Object.fromEntries(Object.entries(pending).map(([f, b]) => [f, { md: b.md, web: b.web, poster: b.poster, mp4: b.mp4 }]));
  try { localStorage.setItem('lm-draft', JSON.stringify({ ...D, _blobs: blobs })); } catch {}
}
function status() {
  const d = dirty();
  $('.state').textContent = d ? 'Changes not published yet' : 'Everything is live';
  $('.state').classList.toggle('dirty', d);
  $('.publish').disabled = !d;
  $('.discard').hidden = !d;
}

/* ---------- previews: the real site, reading the draft ---------- */
let pvMode = 'both';
const frames = { desk: $('.fr.desk iframe'), phone: $('.fr.phone iframe') };
function hashOfSel() {
  if (!sel) return '#/';
  const p = D.projects[sel.pi];
  return sel.credits ? '#/credits' : `#/${p.slug}/${sel.k + 1}`;
}
function reloadPreviews() {
  // credits need the shoot's slide first, so open the slide, then the credits
  for (const [k, f] of Object.entries(frames)) {
    if (k === 'desk' && pvMode === 'phone') continue;
    if (k === 'phone' && pvMode === 'desk') continue;
    if (sel?.credits) {
      const p = D.projects[sel.pi];
      f.src = `../?draft&credits=${D.creditsLayout || 'strip'}&t=${Date.now()}#/${p.slug}/1`;
      f.onload = () => { f.onload = null; setTimeout(() => { try { f.contentWindow.location.hash = '#/credits'; } catch {} }, 250); };
    } else {
      f.onload = null;
      f.src = `../?draft&t=${Date.now()}${hashOfSel()}`;
    }
  }
}
function sizeFrames() {
  const box = $('.frames'), W = box.clientWidth;
  const showD = pvMode !== 'phone', showP = pvMode !== 'desk';
  $('.fr.desk').hidden = !showD; $('.fr.phone').hidden = !showP;
  // desktop 1440×900 and phone 390×844 scaled to fit side by side
  const gap = showD && showP ? 12 : 0;
  let sD = 0, sP = 0;
  if (showD && showP) { const h = (W - gap) / (1440 / 900 + 390 / 844); sD = h / 900; sP = h / 844; }
  else if (showD) sD = W / 1440;
  else sP = Math.min(W / 390, 520 / 844);
  if (showD) { const s = $('.fr.desk'); s.style.width = 1440 * sD + 'px'; s.style.height = 900 * sD + 'px'; $('.scale', s).style.transform = `scale(${sD})`; }
  if (showP) { const s = $('.fr.phone'); s.style.width = 390 * sP + 'px'; s.style.height = 844 * sP + 'px'; $('.scale', s).style.transform = `scale(${sP})`; }
}
$$('.pvbar [data-pv]').forEach(b => b.onclick = () => { pvMode = b.dataset.pv; $$('.pvbar [data-pv]').forEach(x => x.classList.toggle('on', x === b)); sizeFrames(); reloadPreviews(); });
$('.pvopen').onclick = () => open(`../?draft${hashOfSel()}`, '_blank');
addEventListener('resize', sizeFrames);
if (innerWidth <= 900) { pvMode = 'phone'; $$('.pvbar [data-pv]').forEach(x => x.classList.toggle('on', x.dataset.pv === 'phone')); }

/* ---------- render ---------- */
function cardPic(kind) {
  const n = { strip: 3, grid: 4 }[kind] || 1;
  return `<div class="pic ${kind}">${'<i></i>'.repeat(n)}${kind === 'stack' || kind === 'grid' ? '<b></b>' : ''}</div>`;
}
function render() {
  renderSeq(); renderShoots(); renderSite(); renderInspector();
}
function renderSeq() {
  const items = allItems();
  let html = '', last = null, run = 0, worst = 0, worstStyle = '';
  items.forEach(({ p, pi, k, im }, i) => {
    if (i && items[i - 1].pi !== pi) html += '<span class="gap"></span>';
    const m = modeOf(im);
    run = m === last ? run + 1 : 1; last = m;
    if (run > worst) { worst = run; worstStyle = m; }
    const on = sel && !sel.credits && sel.pi === pi && sel.k === k;
    html += `<button class="s ${on ? 'sel' : ''}" data-pi="${pi}" data-k="${k}"><img src="${src(p.slug, im)}" alt=""><i>${STYLES[m]}</i></button>`;
  });
  $('.seq').innerHTML = html;
  const hint = $('.flow .hint');
  hint.textContent = worst >= 3 ? `${worst} × ${STYLES[worstStyle]} in a row — mix it up a little` : `${items.length} pictures and videos, in the order they show`;
  hint.classList.toggle('warn', worst >= 3);
  $$('.seq .s').forEach(b => b.onclick = () => select(+b.dataset.pi, +b.dataset.k));
}
function renderShoots() {
  $('.shoots').innerHTML = D.projects.map((p, pi) => `
    <div class="shoot block" data-pi="${pi}">
      <div class="shead">
        <input class="title" value="${esc(p.title)}" aria-label="Shoot name">
        <button class="ccred">${p._open ? 'Hide credits' : 'Credits'}</button>
        <button class="up" ${pi ? '' : 'hidden'}>Move up</button>
        <button class="down" ${pi < D.projects.length - 1 ? '' : 'hidden'}>Move down</button>
        <button class="rm">Remove shoot</button>
      </div>
      ${p._open ? `<div class="credits-ed">
        ${(p.credits || []).map((c, ci) => `<input data-ci="${ci}" data-f="role" value="${esc(c.role)}" placeholder="Role"><input data-ci="${ci}" data-f="name" value="${esc(c.name)}" placeholder="Name"><button class="x" data-ci="${ci}" aria-label="Remove line">×</button>`).join('')}
        <button class="add">+ Add a line</button>
        <div class="cy"><input data-f="client" value="${esc(p.client)}" placeholder="Client (optional)"><input data-f="year" value="${esc(p.year)}" placeholder="Year (optional)"></div>
      </div>` : ''}
      <div class="media">
        ${p.images.map((im, k) => {
          const on = sel && !sel.credits && sel.pi === pi && sel.k === k, m = modeOf(im);
          return `<div class="tile ${on ? 'sel' : ''}" draggable="true" data-k="${k}">
            <div class="img"><img src="${src(p.slug, im)}" alt="" draggable="false"></div>${im.v ? '<span class="vid">Video</span>' : ''}
            <div class="lab"><b>${STYLES[m]}</b>${im.n && (m === 'full' || m === 'small') ? '<span>· name</span>' : ''}</div></div>`;
        }).join('')}
        ${(p._up || []).map(t => `<div class="tile up"><div class="img">${esc(t)}</div><div class="lab">Adding…</div></div>`).join('')}
        <button class="addtile">+ Add</button>
      </div>
    </div>`).join('');

  $$('.shoot').forEach(el => {
    const pi = +el.dataset.pi, p = D.projects[pi];
    $('.title', el).oninput = e => { p.title = e.target.value; changed(false); renderSeq(); };
    $('.ccred', el).onclick = () => { p._open = !p._open; renderShoots(); select(pi, null, true); };
    $('.up', el).onclick = () => { [D.projects[pi - 1], D.projects[pi]] = [D.projects[pi], D.projects[pi - 1]]; sel = null; changed(); };
    $('.down', el).onclick = () => { [D.projects[pi + 1], D.projects[pi]] = [D.projects[pi], D.projects[pi + 1]]; sel = null; changed(); };
    $('.rm', el).onclick = () => { if (confirm(`Remove the shoot “${p.title}” from the site?`)) { D.projects.splice(pi, 1); sel = null; changed(); } };
    $('.addtile', el).onclick = () => { pickFor = pi; $('.filepick').click(); };
    $$('.credits-ed input[data-ci]', el).forEach(i => i.oninput = () => { p.credits[+i.dataset.ci][i.dataset.f] = i.value; changed(false); });
    $$('.credits-ed .cy input', el).forEach(i => i.oninput = () => { p[i.dataset.f] = i.value; changed(false); });
    $$('.credits-ed .x', el).forEach(b => b.onclick = () => { p.credits.splice(+b.dataset.ci, 1); changed(); });
    const add = $('.credits-ed .add', el); if (add) add.onclick = () => { (p.credits ||= []).push({ role: '', name: '' }); changed(); };
    // tiles: click to select, drag to reorder (also into another shoot)
    $$('.tile:not(.up)', el).forEach(t => {
      const k = +t.dataset.k;
      t.onclick = () => select(pi, k);
      t.ondragstart = e => { drag = { pi, k }; t.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; };
      t.ondragend = () => { t.classList.remove('drag'); $$('.tile.over').forEach(x => x.classList.remove('over')); };
      t.ondragover = e => { e.preventDefault(); t.classList.add('over'); };
      t.ondragleave = () => t.classList.remove('over');
      t.ondrop = e => { e.preventDefault(); moveItem(drag, pi, k); };
    });
    const media = $('.media', el);
    media.ondragover = e => e.preventDefault();
    media.ondrop = e => { if (e.target === media || e.target.classList.contains('addtile')) { e.preventDefault(); moveItem(drag, pi, D.projects[pi].images.length); } };
  });
}
let drag = null, pickFor = null;
function moveItem(from, pi, k) {
  if (!from) return;
  const [im] = D.projects[from.pi].images.splice(from.k, 1);
  if (from.pi === pi && from.k < k) k--;
  D.projects[pi].images.splice(k, 0, im);
  drag = null; sel = { pi, k }; changed();
}
function renderSite() {
  const bio = $('.site .bio'), ig = $('.site .ig');
  if (document.activeElement !== bio) bio.value = D.bio || '';
  if (document.activeElement !== ig) ig.value = D.instagram || '';
  bio.oninput = () => { D.bio = bio.value; changed(false); };
  ig.oninput = () => { D.instagram = ig.value.replace(/^@/, '').trim(); changed(false); };
  const cur = D.creditsLayout || 'strip';
  $('.clayouts').innerHTML = Object.entries(CLAYOUTS).map(([k, v]) => `<button class="card ${k === cur ? 'on' : ''}" data-l="${k}">${cardPic(k)}<span>${v}</span></button>`).join('');
  $$('.clayouts .card').forEach(b => b.onclick = () => { D.creditsLayout = b.dataset.l; sel = { pi: Math.max(sel?.pi ?? 0, 0), credits: true }; changed(); });
}

/* ---------- inspector: how the selected picture shows ---------- */
function select(pi, k, credits = false) {
  sel = credits ? { pi, credits: true } : { pi, k };
  render(); reloadPreviews();
}
function renderInspector() {
  const box = $('.insp');
  if (!sel || sel.credits) { box.innerHTML = `<p class="empty">${sel?.credits ? 'Showing the credits page for this shoot.' : 'Click any picture to choose how it shows.'}</p>`; return; }
  const p = D.projects[sel.pi], im = p?.images[sel.k];
  if (!im) { sel = null; return renderInspector(); }
  const m = modeOf(im), styles = im.v ? ['cover', 'full', 'small'] : ['cover', 'full', 'small', 'layer'];
  const unders = allItems().filter(x => x.im !== im && (x.im.v || modeOf(x.im) !== 'layer'));
  const nameOk = m === 'full' || m === 'small';
  box.innerHTML = `
    <div class="ihead"><img src="${src(p.slug, im)}" alt=""><span class="nm">${esc(p.title)} · ${sel.k + 1} of ${p.images.length}${im.v ? ' · video' : ''}</span><button class="del">Remove</button></div>
    <div class="grp"><p>How it shows</p><div class="cards">${styles.map(s => `<button class="card ${s === m ? 'on' : ''}" data-m="${s}">${cardPic(s)}<span>${STYLES[s]}</span></button>`).join('')}</div></div>
    ${m === 'small' ? `<div class="grp"><p>Position</p><div class="seg">${[['Left', 42], ['Centre', 50], ['Right', 58]].map(([t, x]) => `<button data-x="${x}" class="${(im.x ?? 50) === x ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}
    ${m === 'cover' && !im.v ? `<div class="grp"><p>Keep in view</p><div class="seg">${[['Top', '50% 15%'], ['Middle', ''], ['Bottom', '50% 85%']].map(([t, v]) => `<button data-fp="${v}" class="${(im.fp || '') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>` : ''}
    ${m === 'layer' ? `<div class="grp"><p>Behind it</p><div class="unders">${unders.map(x => `<button data-u="${x.im.f}" class="${(im.u || allItems().find(y => y.im.v)?.im.f) === x.im.f ? 'on' : ''}"><img src="${src(x.p.slug, x.im)}" alt=""></button>`).join('')}</div></div>` : ''}
    <div class="grp"><button class="toggle ${im.n && nameOk ? 'on' : ''}" ${nameOk ? '' : 'disabled'}><i></i>Her name behind it</button>${nameOk ? '' : '<p class="note" style="margin-top:6px">Only with Large or Small — the picture would cover it.</p>'}</div>`;
  $$('.card[data-m]', box).forEach(b => b.onclick = () => {
    im.m = b.dataset.m;
    if (im.m === 'small') { im.s = .9; im.x ??= 58; } else { delete im.s; delete im.x; }
    if (im.m === 'layer') im.u ||= allItems().find(y => y.im.v)?.im.f; else delete im.u;
    if (im.m !== 'cover') delete im.fp;
    changed();
  });
  $$('[data-x]', box).forEach(b => b.onclick = () => { im.x = +b.dataset.x; changed(); });
  $$('[data-fp]', box).forEach(b => b.onclick = () => { if (b.dataset.fp) im.fp = b.dataset.fp; else delete im.fp; changed(); });
  $$('[data-u]', box).forEach(b => b.onclick = () => { im.u = b.dataset.u; changed(); });
  const t = $('.toggle', box); if (t) t.onclick = () => { im.n = !im.n; changed(); };
  $('.del', box).onclick = () => {
    if (!confirm('Remove this from the site?')) return;
    p.images.splice(sel.k, 1); sel = p.images.length ? { pi: sel.pi, k: Math.min(sel.k, p.images.length - 1) } : null; changed();
  };
}

/* ---------- mix: give each picture a layout so nothing repeats too much ---------- */
$('.mix').onclick = () => {
  let prev = null, sinceCover = 9;
  for (const { im } of allItems()) {
    if (modeOf(im) === 'layer') { prev = 'layer'; continue; }      // keep layered ones as they are
    const r = im.w / im.h;
    const pref = im.v ? ['cover', 'full'] : r > 1.15 ? ['cover', 'full', 'small'] : r < .87 ? ['full', 'small', 'cover'] : ['full', 'cover', 'small'];
    let m = pref.find(s => s !== prev && !(s === 'cover' && sinceCover < 2)) || pref[0];
    im.m = m; sinceCover = m === 'cover' ? 0 : sinceCover + 1; prev = m;
    if (m === 'small') { im.s = .9; im.x = im.x === 42 ? 58 : 42; } else { delete im.s; delete im.x; }
    if (m !== 'cover') delete im.fp;
  }
  changed(); toast('Layouts mixed — change any you don’t like');
};

/* ---------- new shoot ---------- */
$('.newshoot').onclick = () => {
  let slug = 'shoot', n = 1; while (D.projects.some(p => p.slug === slug)) slug = 'shoot-' + ++n;
  D.projects.push({ slug, title: 'New shoot', client: '', year: '', credits: [{ role: 'Styling', name: D.name || '' }, { role: 'Photography', name: '' }], images: [], _open: true });
  changed(); $$('.shoot .title').at(-1)?.select();
};

/* ---------- adding pictures and videos ---------- */
$('.filepick').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  const pi = pickFor, p = D.projects[pi]; if (!p) return;
  p._up = files.map(f => f.name.length > 14 ? f.name.slice(0, 12) + '…' : f.name); renderShoots();
  for (const file of files) {
    try {
      const f = nextName(p.slug);
      if (file.type.startsWith('video/')) {
        if (file.size > 90 * 1024 * 1024) throw new Error(`${file.name} is too big (over 90 MB). Export it smaller and try again.`);
        const { w, h, poster } = await videoInfo(file);
        pending[f] = { mp4: URL.createObjectURL(file), poster: URL.createObjectURL(poster), files: { [`media/video/${f}.mp4`]: file, [`media/video/${f}.jpg`]: poster } };
        p.images.push({ f, w, h, m: 'cover', v: true, n: false });
      } else {
        const bmp = await createImageBitmap(file).catch(() => { throw new Error(`${file.name} can’t be read here — please export it as JPG.`); });
        const web = await resize(bmp, 2400, .86), md = await resize(bmp, 1400, .84);
        pending[f] = { web: URL.createObjectURL(web.blob), md: URL.createObjectURL(md.blob), files: { [`media/web/${p.slug}/${f}.webp`]: web.blob, [`media/md/${p.slug}/${f}.webp`]: md.blob } };
        p.images.push({ f, w: web.w, h: web.h, m: 'full', n: false });
      }
    } catch (err) { toast(err.message || 'That file could not be added'); }
    p._up.shift();
  }
  delete p._up;
  sel = { pi, k: p.images.length - 1 }; changed();
};
function nextName(slug) {
  const used = new Set(allItems().map(x => x.im.f));
  let n = 1, f; do f = `${slug}-${String(n++).padStart(2, '0')}`; while (used.has(f) || pending[f]); return f;
}
async function resize(bmp, max, q) {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = new OffscreenCanvas(w, h); c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return { blob: await c.convertToBlob({ type: 'image/webp', quality: q }), w, h };
}
function videoInfo(file) {
  return new Promise((ok, no) => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
    v.onloadeddata = () => { v.currentTime = Math.min(.2, (v.duration || 1) / 4); };
    v.onseeked = () => {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      c.toBlob(b => ok({ w: v.videoWidth, h: v.videoHeight, poster: b }), 'image/jpeg', .85);
    };
    v.onerror = () => no(new Error(`${file.name} can’t play in the browser — please export it as MP4 (H.264).`));
  });
}

/* ---------- publish: one commit with the data file and any new media ---------- */
const gh = async (path, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, { ...opt, headers: { Authorization: `Bearer ${localStorage.getItem('lm-gh-token')}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
  return r.json();
};
const b64 = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
function clean(d) { return JSON.parse(JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v)); }
async function publish() {
  if (!localStorage.getItem('lm-gh-token')) { if (!(await connect())) return; }
  const btn = $('.publish'); btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const out = clean(D);
    const files = { 'data/projects.json': new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }) };
    for (const b of Object.values(pending)) Object.assign(files, b.files);
    const tree = [];
    for (const [path, blob] of Object.entries(files)) {
      const { sha } = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(blob), encoding: 'base64' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha });
    }
    const ref = await gh(`/git/ref/heads/${REPO.branch}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Studio update', tree: t.sha, parents: [ref.object.sha] }) });
    await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    published = structuredClone(out);
    for (const b of Object.values(pending)) delete b.files;     // keep the preview links until the site has caught up
    D = Object.assign(structuredClone(out), { projects: D.projects });
    localStorage.removeItem('lm-studio');
    toast('Published — live on the site in about a minute');
  } catch (err) {
    if (err.status === 401 || err.status === 403 || err.status === 404) { localStorage.removeItem('lm-gh-token'); toast('The publishing key didn’t work — connect again'); }
    else toast('Couldn’t publish — check the connection and try again');
  }
  btn.textContent = 'Publish'; status();
}
function connect() {
  const dlg = $('.connect'); $('.token', dlg).value = '';
  dlg.showModal();
  return new Promise(r => dlg.onclose = () => {
    const v = $('.token', dlg).value.trim();
    if (dlg.returnValue === 'ok' && v) { localStorage.setItem('lm-gh-token', v); r(true); } else r(false);
  });
}
$('.publish').onclick = publish;
$('.discard').onclick = () => {
  if (!confirm('Throw away the changes that aren’t published?')) return;
  D = structuredClone(published); Object.keys(pending).forEach(k => delete pending[k]); localStorage.removeItem('lm-studio'); sel = null; changed();
};
addEventListener('beforeunload', e => { if (Object.values(pending).some(b => b.files)) { e.preventDefault(); e.returnValue = ''; } });

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- go ---------- */
writeDraft(); render(); status(); sizeFrames(); reloadPreviews();
