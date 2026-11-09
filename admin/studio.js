/* Lorhaine Mendes — Website editor
   Edits data/projects.json and adds media. Changes show in the preview straight away (the real
   site, reading the unsaved draft). "Publish changes" sends everything live in one go.        */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REPO = { owner: 'mudtometal', repo: 'lorhaine-mendes', branch: 'main' };

const LAYOUTS = {
  cover: ['Full screen', 'Fills the whole screen'],
  full: ['Large', 'Whole picture, big, white around it'],
  small: ['Small', 'Whole picture, smaller, off-centre'],
  layer: ['Layered', 'Picture on top of a video playing behind'],
};
const CREDITS = {
  strip: ['Strip', 'One row of tall pictures that scrolls sideways, credits underneath.'],
  stack: ['Stack', 'Credits stay on the left, pictures run down the right.'],
  grid: ['Grid', 'Credits on top, pictures in two big columns.'],
};
const modeOf = im => im.m === 'frame' ? 'full' : LAYOUTS[im.m] ? im.m : 'full';
const nameAllowed = m => m === 'full' || m === 'small';

/* ---------- state ---------- */
let published = await fetch('../data/projects.json', { cache: 'no-cache' }).then(r => r.json());
let D = structuredClone(published);
try { const saved = JSON.parse(localStorage.getItem('lm-studio') || 'null'); if (saved && saved.base === JSON.stringify(published)) D = saved.data; } catch {}
const pending = {};            // f -> object URLs for preview + files to upload
let selected = null;           // index of the selected picture on the project page
let uploading = 0;

function clean(d) { return JSON.parse(JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v)); }
const thumb = (p, im, size = 'md') => im.v ? (pending[im.f]?.poster || `../media/video/${im.f}.jpg`) : (pending[im.f]?.[size] || `../media/${size}/${p.slug}/${im.f}.webp`);
const allItems = () => D.projects.flatMap((p, pi) => p.images.map((im, k) => ({ p, pi, k, im })));
const dirty = () => JSON.stringify(clean(D)) !== JSON.stringify(published) || Object.values(pending).some(b => b.files);
const count = p => { const v = p.images.filter(i => i.v).length, ph = p.images.length - v; return [ph && `${ph} photo${ph > 1 ? 's' : ''}`, v && `${v} video${v > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Empty'; };

/* ---------- saving the draft ---------- */
let pvT = null;
function changed(rerender = true) {
  try { localStorage.setItem('lm-studio', JSON.stringify({ base: JSON.stringify(published), data: D })); } catch {}
  writeDraft();
  if (rerender) render();
  status();
  clearTimeout(pvT); pvT = setTimeout(reloadPreview, 500);
}
function writeDraft() {
  const blobs = Object.fromEntries(Object.entries(pending).map(([f, b]) => [f, { md: b.md, web: b.web, poster: b.poster, mp4: b.mp4 }]));
  try { localStorage.setItem('lm-draft', JSON.stringify({ ...D, _blobs: blobs })); } catch {}
}
function status() {
  const d = dirty(), chip = $('.chip');
  chip.textContent = d ? 'Unpublished changes' : 'Website is up to date';
  chip.classList.toggle('dirty', d);
  $('.publish').disabled = !d;
  $('.discard').hidden = !d;
}

/* ---------- preview: the real site reading the draft ---------- */
let pvDevice = 'desk', pvTarget = { hash: '#/' };
const frame = $('.pframe iframe');
function setPreview(t) { pvTarget = t; reloadPreview(); }
function reloadPreview() {
  const cl = D.creditsLayout || 'strip';
  if (pvTarget.credits) {
    frame.src = `../?draft&credits=${cl}&t=${Date.now()}#/${pvTarget.credits}/1`;
    frame.onload = () => { frame.onload = null; setTimeout(() => { try { frame.contentWindow.location.hash = '#/credits'; } catch {} }, 250); };
  } else { frame.onload = null; frame.src = `../?draft&t=${Date.now()}${pvTarget.hash}`; }
}
function sizePreview() {
  const W = $('.pcard').clientWidth - 28, [fw, fh] = pvDevice === 'desk' ? [1440, 900] : [390, 844];
  const s = pvDevice === 'desk' ? W / fw : Math.min(W / fw, 600 / fh);
  Object.assign(frame.style, { width: fw + 'px', height: fh + 'px' });
  $('.pscale').style.transform = `scale(${s})`;
  Object.assign($('.pframe').style, { width: fw * s + 'px', height: fh * s + 'px' });
}
$$('.tabs [data-pv]').forEach(b => b.onclick = () => { pvDevice = b.dataset.pv; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); sizePreview(); });
addEventListener('resize', sizePreview);

/* ---------- views ---------- */
const view = $('.view');
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  $$('.nav [data-nav]').forEach(n => n.classList.toggle('on', n.dataset.nav === (a === 'p' ? 'projects' : a || 'projects')));
  selected = null;
  if (a === 'p' && D.projects[+b]) { const p = D.projects[+b]; setPreview(p.images.length ? { hash: `#/${p.slug}/1` } : { hash: '#/' }); }
  else if (a === 'settings') setPreview({ credits: D.projects[0]?.slug });
  else setPreview({ hash: '#/' });
  render();
  scrollTo(0, 0);
}
function render() {
  const h = location.hash.replace(/^#\/?/, ''), [a, b] = h.split('/');
  if (a === 'p' && D.projects[+b]) return renderProject(+b);
  if (a === 'about') return renderAbout();
  if (a === 'settings') return renderSettings();
  renderProjects();
}
addEventListener('hashchange', route);

/* projects list */
function renderProjects() {
  view.innerHTML = `
    <div class="pagehead"><h1>Projects</h1><span class="sp"></span><button class="btn primary newp">+ New project</button></div>
    <div class="card">
      <div class="chead"><p class="help">The order here is the order on the website. Click a project to edit its photos, videos and credits.</p></div>
      <div class="plist">${D.projects.map((p, i) => `
        <div class="prow">
          <a href="#/p/${i}" class="cover" style="background-image:url('${p.images[0] ? thumb(p, p.images.find(x => !x.v) || p.images[0]) : ''}')" aria-label="Edit ${esc(p.title)}"></a>
          <a href="#/p/${i}" class="t" style="text-decoration:none"><b>${esc(p.title) || 'Untitled'}</b><span>${count(p)}</span></a>
          <div class="ra">
            <button class="iconbtn" data-up="${i}" ${i ? '' : 'disabled'} title="Move up" aria-label="Move up">↑</button>
            <button class="iconbtn" data-down="${i}" ${i < D.projects.length - 1 ? '' : 'disabled'} title="Move down" aria-label="Move down">↓</button>
            <a class="btn small" href="#/p/${i}">Edit</a>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  $('.newp').onclick = newProject;
  $$('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [D.projects[i - 1], D.projects[i]] = [D.projects[i], D.projects[i - 1]]; changed(); });
  $$('[data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [D.projects[i + 1], D.projects[i]] = [D.projects[i], D.projects[i + 1]]; changed(); });
}
function newProject() {
  let slug = 'project', n = 1; while (D.projects.some(p => p.slug === slug)) slug = 'project-' + ++n;
  D.projects.push({ slug, title: 'New project', client: '', year: '', credits: [{ role: 'Styling', name: D.name || '' }, { role: 'Photography', name: '' }], images: [] });
  changed(false); location.hash = `#/p/${D.projects.length - 1}`;
}

/* one project */
function renderProject(pi) {
  const p = D.projects[pi], items = p.images.map(modeOf);
  let run = 1, rep = '';
  for (let i = 1; i < items.length; i++) { run = items[i] === items[i - 1] ? run + 1 : 1; if (run >= 3) rep = LAYOUTS[items[i]][0]; }
  const videos = allItems().filter(x => x.im.v);
  view.innerHTML = `
    <div class="pagehead"><a class="back" href="#/">← All projects</a></div>
    <div class="pagehead"><h1>${esc(p.title) || 'Untitled'}</h1><span class="sp"></span><button class="btn small danger delp">Delete project</button></div>

    <div class="card">
      <div class="chead"><h2>Details</h2></div>
      <div class="grid3">
        <label class="f"><span>Project name</span><input class="input" data-k="title" value="${esc(p.title)}"></label>
        <label class="f"><span>Client <em class="help">(optional)</em></span><input class="input" data-k="client" value="${esc(p.client)}"></label>
        <label class="f"><span>Year <em class="help">(optional)</em></span><input class="input" data-k="year" value="${esc(p.year)}"></label>
      </div>
    </div>

    <div class="card">
      <div class="chead"><h2>Credits</h2><span class="help">Shown on the credits page for this project.</span><span class="sp"></span><button class="btn small showcred">Preview credits page</button></div>
      <div class="ctable">
        ${(p.credits || []).length ? '<div class="chdr"><span>Role</span><span>Name</span><span></span></div>' : ''}
        ${(p.credits || []).map((c, ci) => `<div class="crow"><input class="input" data-ci="${ci}" data-f="role" value="${esc(c.role)}" placeholder="e.g. Photography"><input class="input" data-ci="${ci}" data-f="name" value="${esc(c.name)}" placeholder="Name"><button class="btn small" data-rmc="${ci}">Remove</button></div>`).join('')}
        <div><button class="btn small addc">+ Add credit</button></div>
      </div>
    </div>

    <div class="card">
      <div class="chead"><h2>Photos &amp; videos</h2><span class="sp"></span><button class="btn small mix">Suggest layouts</button></div>
      <p class="help" style="margin:-8px 0 16px">They appear on the website in this order. For each one, choose a layout:</p>
      <div class="legend">${Object.entries(LAYOUTS).map(([k, [t, d]]) => `<div class="lg"><span class="mini ${k}"><i></i></span><div><b>${t}</b><span>${d}</span></div></div>`).join('')}</div>
      ${rep ? `<div class="notice">Three or more in a row use “${rep}”. Mixing layouts keeps the site from feeling repetitive.</div>` : ''}
      <div class="mgrid">
        ${p.images.map((im, k) => {
          const m = modeOf(im), u = im.u || videos[0]?.im.f;
          return `<div class="mcard ${selected === k ? 'sel' : ''}" data-k="${k}">
            <div class="thumb" data-pv="${k}" title="Show in preview"><img src="${thumb(p, im)}" alt=""><span class="badge n">${k + 1}</span>${im.v ? '<span class="badge v">Video</span>' : ''}</div>
            <div class="body">
              <label class="f"><span>Layout</span><select class="input" data-m="${k}">${Object.entries(LAYOUTS).filter(([s]) => !(im.v && s === 'layer')).map(([s, [t]]) => `<option value="${s}" ${s === m ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              ${m === 'small' ? `<label class="f"><span>Position</span><select class="input" data-x="${k}">${[['Left', 42], ['Centre', 50], ['Right', 58]].map(([t, x]) => `<option value="${x}" ${(im.x ?? 50) === x ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
              ${m === 'cover' && !im.v ? `<label class="f"><span>Keep in view</span><select class="input" data-fp="${k}">${[['Middle', ''], ['Top', '50% 15%'], ['Bottom', '50% 85%']].map(([t, v]) => `<option value="${v}" ${(im.fp || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
              ${m === 'layer' ? `<label class="f"><span>Video behind it</span><select class="input" data-u="${k}">${videos.length ? videos.map((x, vi) => `<option value="${x.im.f}" ${u === x.im.f ? 'selected' : ''}>${esc(x.p.title)} — video ${vi + 1}</option>`).join('') : '<option>No videos yet — add one first</option>'}</select></label>` : ''}
              <label class="check ${nameAllowed(m) ? '' : 'off'}"><input type="checkbox" data-n="${k}" ${im.n && nameAllowed(m) ? 'checked' : ''} ${nameAllowed(m) ? '' : 'disabled'}>Show her name behind${nameAllowed(m) ? '' : ' (Large or Small only)'}</label>
              <div class="row">
                <button class="iconbtn" data-l="${k}" ${k ? '' : 'disabled'} title="Move earlier" aria-label="Move earlier">←</button>
                <button class="iconbtn" data-r="${k}" ${k < p.images.length - 1 ? '' : 'disabled'} title="Move later" aria-label="Move later">→</button>
                <span class="sp"></span>
                <button class="btn small danger" data-del="${k}">Delete</button>
              </div>
            </div>
          </div>`;
        }).join('')}
        ${uploading ? `<div class="uploading">Adding ${uploading} file${uploading > 1 ? 's' : ''}…</div>` : ''}
        <button class="drop"><b>+ Add photos or videos</b><span>Click, or drag files here.<br>JPG or PNG photos, MP4 videos.</span></button>
      </div>
    </div>`;

  $$('[data-k]', view).forEach(i => { if (i.tagName === 'INPUT') i.oninput = () => { p[i.dataset.k] = i.value; if (i.dataset.k === 'title') $('h1', view.children[1]).textContent = i.value || 'Untitled'; changed(false); }; });
  $('.delp').onclick = () => { if (confirm(`Delete the project “${p.title}” from the website?`)) { D.projects.splice(pi, 1); changed(false); location.hash = '#/'; } };
  $$('[data-ci]').forEach(i => i.oninput = () => { p.credits[+i.dataset.ci][i.dataset.f] = i.value; changed(false); });
  $$('[data-rmc]').forEach(b => b.onclick = () => { p.credits.splice(+b.dataset.rmc, 1); changed(); });
  $('.addc').onclick = () => { (p.credits ||= []).push({ role: '', name: '' }); changed(); $$('.crow input[data-f="role"]').at(-1)?.focus(); };
  $('.showcred').onclick = () => p.images.length && setPreview({ credits: p.slug });
  const pick = k => { selected = k; $$('.mcard').forEach(c => c.classList.toggle('sel', +c.dataset.k === k)); setPreview({ hash: `#/${p.slug}/${k + 1}` }); };
  $$('[data-pv]', view).forEach(t => t.onclick = () => pick(+t.dataset.pv));
  const after = k => { selected = k; changed(); pvTarget = { hash: `#/${p.slug}/${k + 1}` }; };
  $$('[data-m]').forEach(s => s.onchange = () => {
    const im = p.images[+s.dataset.m]; im.m = s.value;
    if (im.m === 'small') { im.s = .9; im.x ??= 58; } else { delete im.s; delete im.x; }
    if (im.m === 'layer') im.u ||= videos[0]?.im.f; else delete im.u;
    if (im.m !== 'cover') delete im.fp;
    after(+s.dataset.m);
  });
  $$('[data-x]').forEach(s => s.onchange = () => { p.images[+s.dataset.x].x = +s.value; after(+s.dataset.x); });
  $$('[data-fp]').forEach(s => s.onchange = () => { const im = p.images[+s.dataset.fp]; if (s.value) im.fp = s.value; else delete im.fp; after(+s.dataset.fp); });
  $$('[data-u]').forEach(s => s.onchange = () => { p.images[+s.dataset.u].u = s.value; after(+s.dataset.u); });
  $$('[data-n]').forEach(c => c.onchange = () => { p.images[+c.dataset.n].n = c.checked; after(+c.dataset.n); });
  $$('[data-l]').forEach(b => b.onclick = () => { const k = +b.dataset.l; [p.images[k - 1], p.images[k]] = [p.images[k], p.images[k - 1]]; after(k - 1); });
  $$('[data-r]').forEach(b => b.onclick = () => { const k = +b.dataset.r; [p.images[k + 1], p.images[k]] = [p.images[k], p.images[k + 1]]; after(k + 1); });
  $$('[data-del]').forEach(b => b.onclick = () => { if (confirm('Delete this from the project?')) { p.images.splice(+b.dataset.del, 1); selected = null; changed(); } });
  $('.mix').onclick = () => { suggest(p); changed(); toast('Layouts suggested — change any you don’t like'); };
  const drop = $('.drop');
  drop.onclick = () => { $('.filepick').dataset.pi = pi; $('.filepick').click(); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles(pi, [...e.dataTransfer.files]); };
}

/* about */
function renderAbout() {
  view.innerHTML = `
    <div class="pagehead"><h1>About</h1></div>
    <div class="card" style="display:flex;flex-direction:column;gap:16px">
      <label class="f"><span>Short bio</span><textarea class="input bio" rows="3">${esc(D.bio)}</textarea><em class="help">Shown on the Info page.</em></label>
      <label class="f"><span>Instagram</span><input class="input ig" value="${esc(D.instagram)}" placeholder="username, without @"></label>
    </div>`;
  $('.bio').oninput = e => { D.bio = e.target.value; changed(false); };
  $('.ig').oninput = e => { D.instagram = e.target.value.replace(/^@/, '').trim(); changed(false); };
  setPreview({ hash: '#/info' });
}

/* credits page layout */
function renderSettings() {
  const cur = D.creditsLayout || 'strip';
  view.innerHTML = `
    <div class="pagehead"><h1>Credits page</h1></div>
    <div class="card">
      <div class="chead"><h2>Layout</h2><span class="help">How every project’s credits page looks.</span></div>
      <div class="opts">${Object.entries(CREDITS).map(([k, [t, d]]) => `<button class="opt ${k === cur ? 'on' : ''}" data-cl="${k}"><div class="big ${k}">${'<i></i>'.repeat(k === 'strip' ? 3 : k === 'grid' ? 4 : 1)}<u></u></div><b>${t}</b><span>${d}</span></button>`).join('')}</div>
    </div>`;
  $$('[data-cl]').forEach(b => b.onclick = () => { D.creditsLayout = b.dataset.cl; changed(); setPreview({ credits: D.projects[0]?.slug }); });
}

/* ---------- suggest layouts: a mix that doesn't repeat ---------- */
function suggest(p) {
  let prev = null, sinceCover = 9;
  for (const im of p.images) {
    if (modeOf(im) === 'layer') { prev = 'layer'; continue; }
    const r = im.w / im.h;
    const pref = im.v ? ['cover', 'full'] : r > 1.15 ? ['cover', 'full', 'small'] : r < .87 ? ['full', 'small', 'cover'] : ['full', 'cover', 'small'];
    const m = pref.find(s => s !== prev && !(s === 'cover' && sinceCover < 2)) || pref[0];
    im.m = m; sinceCover = m === 'cover' ? 0 : sinceCover + 1; prev = m;
    if (m === 'small') { im.s = .9; im.x = im.x === 42 ? 58 : 42; } else { delete im.s; delete im.x; }
    if (m !== 'cover') delete im.fp;
    if (!nameAllowed(m)) im.n = false;
  }
}

/* ---------- adding photos and videos ---------- */
$('.filepick').onchange = e => { const files = [...e.target.files]; e.target.value = ''; addFiles(+e.target.dataset.pi, files); };
async function addFiles(pi, files) {
  const p = D.projects[pi]; if (!p || !files.length) return;
  uploading = files.length; render();
  for (const file of files) {
    try {
      const f = nextName(p.slug);
      if (file.type.startsWith('video/')) {
        if (file.size > 90 * 1024 * 1024) throw new Error(`${file.name} is over 90 MB — please export it smaller.`);
        const { w, h, poster } = await videoInfo(file);
        pending[f] = { mp4: URL.createObjectURL(file), poster: URL.createObjectURL(poster), files: { [`media/video/${f}.mp4`]: file, [`media/video/${f}.jpg`]: poster } };
        p.images.push({ f, w, h, m: 'cover', v: true, n: false });
      } else if (file.type.startsWith('image/')) {
        const bmp = await createImageBitmap(file).catch(() => { throw new Error(`${file.name} can’t be opened here — please export it as JPG.`); });
        const web = await resize(bmp, 2400, .86), md = await resize(bmp, 1400, .84);
        pending[f] = { web: URL.createObjectURL(web.blob), md: URL.createObjectURL(md.blob), files: { [`media/web/${p.slug}/${f}.webp`]: web.blob, [`media/md/${p.slug}/${f}.webp`]: md.blob } };
        p.images.push({ f, w: web.w, h: web.h, m: 'full', n: false });
      } else throw new Error(`${file.name} isn’t a photo or video.`);
    } catch (err) { toast(err.message || 'That file could not be added'); }
    uploading--;
  }
  selected = p.images.length - 1; changed(); setPreview({ hash: `#/${p.slug}/${p.images.length}` });
}
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
    v.onerror = () => no(new Error(`${file.name} can’t play in the browser — please export it as MP4.`));
  });
}

/* ---------- publish: one commit with the data file and any new media ---------- */
const gh = async (path, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, { ...opt, headers: { Authorization: `Bearer ${localStorage.getItem('lm-gh-token')}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
  return r.json();
};
const b64 = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
async function publish() {
  if (!localStorage.getItem('lm-gh-token') && !(await connect())) return;
  const btn = $('.publish'); btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const out = clean(D);
    const files = { 'data/projects.json': new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }) };
    for (const b of Object.values(pending)) if (b.files) Object.assign(files, b.files);
    const tree = [];
    for (const [path, blob] of Object.entries(files)) {
      const { sha } = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(blob), encoding: 'base64' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha });
    }
    const ref = await gh(`/git/ref/heads/${REPO.branch}`);
    const head = await gh(`/git/commits/${ref.object.sha}`);
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Website editor update', tree: t.sha, parents: [ref.object.sha] }) });
    await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    published = structuredClone(out);
    for (const b of Object.values(pending)) delete b.files;      // keep preview links until the site catches up
    localStorage.removeItem('lm-studio');
    toast('Published — the website updates in about a minute');
  } catch (err) {
    if ([401, 403, 404].includes(err.status)) { localStorage.removeItem('lm-gh-token'); toast('The publishing key didn’t work — please connect again'); }
    else toast('Couldn’t publish — check your internet and try again');
  }
  btn.textContent = 'Publish changes'; status();
}
function connect() {
  const dlg = $('.connect'); $('.token', dlg).value = ''; dlg.showModal();
  return new Promise(r => dlg.onclose = () => {
    const v = $('.token', dlg).value.trim();
    if (dlg.returnValue === 'ok' && v) { localStorage.setItem('lm-gh-token', v); r(true); } else r(false);
  });
}
$('.publish').onclick = publish;
$('.discard').onclick = () => {
  if (!confirm('Throw away all changes that aren’t published?')) return;
  D = structuredClone(published); Object.keys(pending).forEach(k => delete pending[k]); localStorage.removeItem('lm-studio'); changed(); route();
};
addEventListener('beforeunload', e => { if (Object.values(pending).some(b => b.files)) { e.preventDefault(); e.returnValue = ''; } });
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); }

/* ---------- go ---------- */
writeDraft(); status(); sizePreview(); route();
