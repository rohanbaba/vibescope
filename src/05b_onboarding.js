/* ===== Getting started: company brand, first screen, guide, example project ===== */

/* ---------- Brand ----------
   Company name and logo at the top left. Saved in the project (so a shared project file carries it) and in this browser as the default
   for new projects. A site edition can ship its own default (SITE.brand). */
function brandOf() {
  if (P?.brand) { if (P.brand.cleared) return null; if (P.brand.name || P.brand.logo) return P.brand; }
  try { const b = JSON.parse(localStorage.getItem('vs-brand') || 'null'); if (b && (b.name || b.logo)) return b; } catch (e) { }
  return SITE.brand || null;
}
function renderBrand() {
  const el = $('#company'); if (!el) return; const b = brandOf(); const logo = b ? (currentThemeIsDark() && b.logoDark ? b.logoDark : b.logo) : null;
  el.innerHTML = b ? `${logo ? `<img src="${logo}" alt="">` : ''}${b.name ? `<span class="cname">${esc(b.name)}</span>` : ''}` : '<span class="cadd">+ Your company</span>';
  el.title = b ? 'Company name and logo (click to change)' : 'Add your company name and logo';
  el.classList.toggle('empty', !b);
}
function shrinkImage(file, max = 160) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Not an image')); }; img.src = url;
  });
}
function brandDialog() {
  const b = brandOf() || {}; let logo = b.logo || '', logoDark = b.logoDark || '';
  modal('Company name and logo', `<p class="small muted" style="margin:0">Shown at the top left and saved with the project, so whoever opens your project file sees it too.</p>
    <div class="field"><label>Company or team name</label><input class="input" id="b-name" value="${esc(b.name || '')}" placeholder="For example: Acme Space Systems"></div>
    <div class="row" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="field"><label>Logo, light theme</label><div class="logo-prev light" id="b-prev1">${logo ? `<img src="${logo}" alt="">` : '<span class="small muted">none</span>'}</div><input type="file" accept="image/*" id="b-file1" class="small"></div>
      <div class="field"><label>Logo, dark theme (optional)</label><div class="logo-prev dark" id="b-prev2">${logoDark ? `<img src="${logoDark}" alt="">` : '<span class="small muted">uses the light one</span>'}</div><input type="file" accept="image/*" id="b-file2" class="small"></div>
    </div>
    <p class="small muted" style="margin:0">A square logo on a transparent background works best. It is scaled to 160 px and stored inside the project. For the dark theme, use a copy with the dark parts in white.</p>`,
    [{ label: 'Remove', danger: true, onClick: () => { P.brand = { cleared: true }; try { localStorage.removeItem('vs-brand'); } catch (e) { } persist(); renderBrand(); } },
     { label: 'Cancel' },
     { label: 'Save', primary: true, onClick: () => { P.brand = { name: $('#b-name').value.trim(), logo, logoDark }; try { localStorage.setItem('vs-brand', JSON.stringify(P.brand)); } catch (e) { } persist(); renderBrand(); toast('Saved'); } }],
    body => {
      const hook = (inp, prev, set) => { body.querySelector(inp).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const u = await shrinkImage(f); set(u); body.querySelector(prev).innerHTML = `<img src="${u}" alt="">`; } catch (err) { toast(err.message, true); } }; };
      hook('#b-file1', '#b-prev1', u => logo = u); hook('#b-file2', '#b-prev2', u => logoDark = u);
    });
}

/* ---------- First screen ---------- */
function welcomeHtml() {
  const b = brandOf(); const logo = b ? (currentThemeIsDark() && b.logoDark ? b.logoDark : b.logo) : null;
  return `<div class="welcome">
    <div class="wl-hero">
      ${logo ? `<img class="wl-logo" src="${logo}" alt="">` : ''}
      <div><h1>${esc(APP.name)}</h1><p class="lead">Vibration and shock test data, from the shaker to the report.</p></div>
    </div>
    <p class="wl-intro">Bring the exports from your vibration controller or data acquisition system: CSV, TXT or Excel, with frequency or time in the first column and one column per channel. ${esc(APP.name)} plots every channel, compares runs, checks the signature sweeps before and after each run, and checks shock pulses against the SRS you specify. Your data stays in this browser; nothing is uploaded anywhere.</p>
    <div class="row" style="gap:10px;margin:4px 0 22px"><button class="btn primary" id="wl-guide">How to use ${esc(APP.name)}: the 5 minute guide</button><button class="btn" id="wl-example2">Explore the example first</button></div>
    <div class="wl-cards">
      <div class="wl-card"><div class="wl-n">1</div><h3>Import your data</h3><p>Drop your files anywhere on the page. A short review shows how each file was read (data type, axis, run, which column is the control) and lets you correct it before anything is imported.</p><div class="dropzone" id="dz"><strong>Drop files here</strong><br>or <button class="btn small" id="wl-import">choose files</button><div class="small muted" style="margin-top:6px">csv, txt, tsv, xlsx · reports: pdf, doc, docx</div></div></div>
      <div class="wl-card"><div class="wl-n">2</div><h3>Try the example</h3><p>A made-up electronics box on an interface plate, tested in X and Z: signature sweeps, a random run and a two-pulse shock. One bracket loosens during the X random, and the signature check catches it.</p><button class="btn" id="wl-example">Load the example project</button></div>
      <div class="wl-card"><div class="wl-n">3</div><h3>Open a saved project</h3><p>A project file (.json.gz) holds the sessions, tests, sensor maps and all the data. Save one to share your work; a colleague opens it here with Load project.</p><button class="btn" id="wl-load">Load project…</button></div>
    </div>
    <div class="wl-foot small"><a href="#" id="wl-brand">${b ? 'Change the company name and logo' : 'Add your company name and logo'}</a><span class="muted"> · </span><a href="#" id="wl-ref">Reference</a></div>
  </div>`;
}
function bindWelcome(v) {
  bindDropzone(v);
  const on = (id, fn) => { const el = v.querySelector('#' + id); if (el) el.onclick = e => { e.preventDefault(); fn(); }; };
  on('wl-guide', () => guideDialog(0)); on('wl-import', () => $('#file-input').click()); on('wl-example', loadExampleProject); on('wl-example2', loadExampleProject);
  on('wl-load', () => $('#proj-input').click()); on('wl-brand', brandDialog); on('wl-ref', () => guideDialog(GUIDE_STEPS.length - 1));
}

/* ---------- Guide ---------- */
const GUIDE_STEPS = [
  { t: 'Bring your data', img: 'welcome', h: `<p>Anything that is a table works: <strong>frequency or time in the first column, one column per channel</strong>. CSV, TXT (comma, tab or semicolon) and Excel files are read, with any metadata lines above the header skipped. A units row under the header is used if there is one.</p>
    <ul><li><strong>Sine sweeps</strong>: response in g against frequency.</li><li><strong>Random</strong>: PSD in g²/Hz against frequency (recognised from the units), and optionally the RMS history against time.</li><li><strong>Shock</strong>: the time history of each pulse (g against time; ms is fine) or an SRS spectrum. Time histories are turned into SRS for you.</li><li><strong>Reports</strong> (pdf, doc, docx) attach to the test with the same run number.</li></ul>
    <p>Drop files anywhere on the page or use <em>Import files</em>. Exports from Econ vibration controllers and file names such as <span class="mono">05_X_Random_0dB.xlsx</span> are recognised without any questions.</p>` },
  { t: 'Check the import', img: 'review', h: `<p>When a file is not recognised from its name and layout, the <strong>import review</strong> opens. One row per file:</p>
    <ul><li><strong>Data</strong>: sine, random PSD, SRS, shock time history or RMS history.</li><li><strong>Axis</strong> and <strong>run number</strong>.</li><li><strong>Test type</strong> and where it goes: automatically by run and type, a new test, or an existing one.</li><li><strong>Columns</strong>: which column is the control (the accelerometer the shaker was controlled on; every response is divided by it), the input number of each column, and columns to leave out.</li></ul>
    <p>Pick the session at the top, or start a new one. All of this can be changed later: the <em>Files</em> tab has a <em>Columns</em> button per file and lets you move files between tests.</p>` },
  { t: 'Look at a test', img: 'test', h: `<p>The left panel lists the sessions (test days) and their tests by axis, in run order. Click a test to open it.</p>
    <ul><li>The <strong>chips</strong> show each sensor's channels with the gRMS or peak. Click a chip to show or hide it, double-click to show only that one. The ringed chip is the channel that carries the shaker motion.</li><li>Hover the plot for exact values. With many channels the values appear in a <strong>list beside the plot</strong>, highest first, and the list scrolls.</li><li><em>Mark peaks</em> labels the highest point of each channel; labels that would overlap are left out (the marker stays).</li><li>Below the plots: transmissibility, one plot per sensor, the RMS history and the channel table.</li></ul>` },
  { t: 'Map the sensors', img: 'sensors', h: `<p>In <strong>Sensors and 3D</strong>, give each accelerometer a name, where it sits (payload, fixture, table) and which input numbers carry its X, Y and Z. Save a sensor set as a template to reuse it.</p>
    <p>The <strong>channel check</strong> uses the first few hertz of each run, where everything moves with the table, to find which channel of each sensor points along the shaker, and flags channels that cannot be motion (noise, a loose cable). The 3D view shows where the sensors are and which ones look wrong.</p>` },
  { t: 'Signatures before and after', img: 'signatures', h: `<p>A low level sine sweep before and after each qualification run should show the same resonances. In <strong>Signatures</strong> the peaks of two sweeps are matched channel by channel and every frequency shift is checked against the limit (5 % by default, editable).</p>
    <ul><li>The pairing is automatic: the sweep right before a run is its <em>before</em>, the first sweep after it is its <em>after</em>. Pick a run in <em>Before / after a run</em>, or press <em>Compare before vs after</em> on any test page.</li><li>You can still pick any reference and any sweeps to compare with by hand.</li></ul>
    <p>In the example, the bracket mode drops by about 6 % after the X random: that is what a loosened fastener looks like.</p>` },
  { t: 'Shock and the SRS', img: 'shock', h: `<p>For a shock test the SRS of every channel is computed from the time history (Q = 10). <strong>Shock checks</strong> then shows:</p>
    <ul><li>how well the control met the profile, for the maximax, positive and negative SRS, with the share of points inside the tolerance and at or above nominal;</li><li>the control pulse: peaks, effective duration, velocity and displacement over the frame;</li><li><strong>SRS amplification</strong>: each location's SRS divided by the input;</li><li><strong>pseudo velocity</strong>, a better measure of damage potential than g.</li></ul>
    <p>A shock run that was split into several pulses keeps them together: the pulse buttons switch between them and the checks compare them.</p>` },
  { t: 'Campaigns and Compare', img: 'campaign', h: `<p>A test day often has check runs, repeats and false starts. A <strong>campaign</strong> collects only the runs that count, from any number of days. Switch the left panel to <em>Campaigns</em>; right-click tests in the <em>By date</em> view to add them. The campaign overview lists the runs by axis and date with their headline numbers, and Compare and Signatures then offer only the campaign's runs.</p>
    <p><strong>Compare</strong> overlays the same channel across runs, levels or axes, with a level and linearity table.</p>` },
  { t: 'Save, share, brand', img: null, h: `<p>Everything is kept in this browser automatically. <strong>Save project</strong> writes one file with all sessions, tests, sensor maps and data; a colleague opens the same page and uses <strong>Load project</strong>. Keep the HTML file and the project file side by side on a shared drive.</p>
    <p>Click the company area at the top left to add your <strong>company name and logo</strong> (with a separate logo for the dark theme). It is saved in the project.</p>
    <p><strong>Profiles and settings</strong> holds the random and SRS profiles your tests are compared with, the tolerances and the signature limits.</p>` },
  { t: 'Reference', img: null, h: null },
];
function guideDialog(step = 0) {
  let i = Math.max(0, Math.min(step, GUIDE_STEPS.length - 1)); const box = $('#modal .box');
  const draw = () => {
    const s = GUIDE_STEPS[i]; const img = s.img && typeof GUIDE_IMAGES !== 'undefined' ? GUIDE_IMAGES[s.img] : null;
    $('#modal-title').textContent = `${APP.name} guide · ${i + 1} of ${GUIDE_STEPS.length}`;
    $('#modal-body').innerHTML = `<div class="guide"><nav>${GUIDE_STEPS.map((q, k) => `<button data-gs="${k}" class="${k === i ? 'active' : ''}"><span class="gn">${k + 1}</span>${esc(q.t)}</button>`).join('')}</nav>
      <div class="gc"><h2>${esc(s.t)}</h2>${s.h || referenceHtml()}${img ? `<img class="gimg" src="${img}" alt="${esc(s.t)}">` : ''}</div></div>`;
    $$('[data-gs]').forEach(b => b.onclick = () => { i = +b.dataset.gs; draw(); });
    const f = $('#modal-foot'); const bs = f.querySelectorAll('button'); if (bs.length === 3) { bs[0].disabled = i === 0; bs[2].textContent = i === GUIDE_STEPS.length - 1 ? 'Close' : 'Next'; }
  };
  box.classList.add('wide');
  modal('', '', [{ label: 'Back', onClick: () => { if (i > 0) { i--; draw(); } return false; } }, { label: P?.sessions?.length ? 'Close' : 'Load the example', onClick: () => { box.classList.remove('wide'); if (!P?.sessions?.length) loadExampleProject(); } }, { label: 'Next', primary: true, onClick: () => { if (i < GUIDE_STEPS.length - 1) { i++; draw(); return false; } box.classList.remove('wide'); } }]);
  const x = $('#modal-x'); const prev = x.onclick; x.onclick = () => { box.classList.remove('wide'); closeModal(); x.onclick = prev; };
  draw();
}

/* ---------- Example project ----------
   Generated here, so it costs nothing to ship: an electronics box on an interface plate with four triax accelerometers, tested in X and Z. The data go
   through the same table reader as any CSV export. In X the bracket loosens during the random run (its mode drops by about 6 %). */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const EX_RANDOM = [[20, 0.01], [80, 0.04], [500, 0.04], [2000, 0.01]];
const EX_SRS = [[100, 500 * Math.pow(0.1, 1.5)], [1000, 500], [5000, 500]];
function sdofAbs(dt, a, fn, Q) { // absolute acceleration of a base-driven single degree of freedom (same filter as the SRS)
  const zeta = 1 / (2 * Q), wn = 2 * Math.PI * fn, wd = wn * Math.sqrt(1 - zeta * zeta), E = Math.exp(-zeta * wn * dt), K = wd * dt, C = E * Math.cos(K), S = E * Math.sin(K), Sp = S / K;
  const b0 = 1 - Sp, b1 = 2 * (Sp - C), b2 = E * E - Sp, a1 = -2 * C, a2 = E * E; const y = new Array(a.length); let y1 = 0, y2 = 0, x1 = 0, x2 = 0;
  for (let i = 0; i < a.length; i++) { const x0 = a[i]; const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; y[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0; }
  return y;
}
function exampleData() {
  const rnd = mulberry32(20261113); const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const top = FIX.ringTop; // sensor heights follow the fixture or plate drawn in 3D
  const S = [{ name: 'Box lid', ch: [2, 3, 4], p3: { r: 70, angle: 40, z: top + 168 } }, { name: 'Bracket', ch: [5, 6, 7], p3: { r: 125, angle: 200, z: top + 70 } }, { name: 'PCB centre', ch: [8, 9, 10], p3: { r: 15, angle: 110, z: top + 105 } }, { name: 'Interface plate', ch: [11, 12, 13], p3: { r: Math.min(176, FIX.plateX / 2 - 40), angle: 90, z: top }, part: 'fixture' }];
  const MODES = { X: [{ s: 1, fn: 185, Q: 14, w: 1.1 }, { s: 0, fn: 420, Q: 18, w: 0.8 }, { s: 2, fn: 610, Q: 24, w: 1.3 }, { s: -1, fn: 1480, Q: 30, w: 0.35 }], Z: [{ s: 2, fn: 330, Q: 20, w: 1.4 }, { s: 0, fn: 515, Q: 16, w: 0.9 }, { s: 1, fn: 760, Q: 12, w: 0.6 }, { s: -1, fn: 1720, Q: 30, w: 0.35 }] };
  const loose = m => m.map(q => q.s === 1 && q.fn < 300 ? { ...q, fn: q.fn * 0.935, Q: 11 } : q);
  const drift = (m, k) => m.map(q => ({ ...q, fn: q.fn * k }));
  const AX = ['X', 'Y', 'Z'];
  const coupling = (m, s, d, a) => (s === 3 ? (m.s === -1 ? 0.6 : 0.03) : m.s === -1 ? 0.3 : m.s === s ? 1 : 0.22) * m.w * (d === a ? 1 : 0.28);
  const T = (f, s, d, a, modes) => { let re = d === a ? 1 : 0.04, im = 0; for (const m of modes) { const c = coupling(m, s, d, a); if (!c) continue; const r = f / m.fn, dr = 1 - r * r, di = r / m.Q, den = dr * dr + di * di; re += c * r * r * dr / den; im += -c * r * r * di / den; } return Math.hypot(re, im); };
  const labels = ['Control (g)']; for (const s of S) for (const d of AX) labels.push(`${s.name} ${d} (g)`);
  const sine = (a, modes) => { const rows = [['Frequency (Hz)', ...labels]]; const n = 520; for (let i = 0; i < n; i++) { const f = 5 * Math.pow(400, i / (n - 1)); const c = 0.25 * (1 + 0.004 * gauss()); const row = [+f.toFixed(3), +c.toFixed(5)]; S.forEach((s, si) => AX.forEach(d => row.push(+(c * T(f, si, d, a, modes) * (1 + 0.01 * gauss())).toPrecision(5)))); rows.push(row); } return rows; };
  const psd = (a, modes) => { const rows = [['Frequency (Hz)', ...labels.map(l => l.replace('(g)', '(g²/Hz)'))]]; for (let f = 20; f <= 2000.01; f += 2.5) { const p = logInterp(EX_RANDOM, f); const c = p * Math.exp(0.12 * gauss()); const row = [f, +c.toPrecision(5)]; S.forEach((s, si) => AX.forEach(d => { const t = T(f, si, d, a, modes); row.push(+(c * t * t * Math.exp(0.1 * gauss())).toPrecision(5)); })); rows.push(row); } return rows; };
  const fs = 20480, n = 2048, dt = 1 / fs; const tt = Array.from({ length: n }, (_, i) => i * dt);
  const fr = octaveFreqs(100, 5000, 6); const target = fr.map(f => logInterp(EX_SRS, f));
  const synth = (seed) => { const r = mulberry32(seed); const w = fr.map((f, k) => ({ f, A: target[k] / 5, t0: 0.004 + 0.012 * r(), ph: r() * 6.283, z: 0.03 + 0.03 * r() })); let x;
    for (let it = 0; it < 5; it++) { x = tt.map(t => { let v = 0; for (const q of w) { const u = t - q.t0; if (u > 0) v += q.A * Math.exp(-q.z * 2 * Math.PI * q.f * u) * Math.sin(2 * Math.PI * q.f * u + q.ph); } return v; }); const s = computeSRS(tt, x, fr); w.forEach((q, k) => q.A *= Math.pow(target[k] / s[k], 0.8)); }
    return x; };
  const shock = (a, modes, seed) => { const x = synth(seed); const rows = [['Time (s)', ...labels]]; const cols = [x]; S.forEach((s, si) => AX.forEach(d => { const base = d === a ? 1 : 0.04; const y = x.map(v => base * v); for (const m of modes) { const c = coupling(m, si, d, a); if (!c) continue; const r = sdofAbs(dt, x, m.fn, m.Q); for (let i = 0; i < n; i++) y[i] += c * (r[i] - x[i]); } cols.push(y); })); for (let i = 0; i < n; i++) rows.push([+tt[i].toPrecision(6), ...cols.map(c => +c[i].toPrecision(5))]); return rows; };
  const files = [];
  for (const [a, r0] of [['X', 1], ['Z', 6]]) {
    const m0 = MODES[a], m1 = a === 'X' ? loose(m0) : drift(m0, 0.996);
    files.push({ run: r0, kind: 'sig', axis: a, name: `box_${a}_sweep_before_random.csv`, rows: sine(a, m0) });
    files.push({ run: r0 + 1, kind: 'rand0', axis: a, name: `box_${a}_random_PSD.csv`, rows: psd(a, m0), profile: 'demo-random' });
    files.push({ run: r0 + 2, kind: 'sig', axis: a, name: `box_${a}_sweep_after_random.csv`, rows: sine(a, m1) });
    files.push({ run: r0 + 3, kind: 'srs', axis: a, name: `box_${a}_shock_pulse1.csv`, rows: shock(a, m1, r0 * 11 + 1), profile: 'demo-srs' });
    files.push({ run: r0 + 3, kind: 'srs', axis: a, name: `box_${a}_shock_pulse2.csv`, rows: shock(a, m1, r0 * 11 + 2), profile: 'demo-srs' });
    files.push({ run: r0 + 4, kind: 'sig', axis: a, name: `box_${a}_sweep_after_shock.csv`, rows: sine(a, drift(m1, 0.997)) });
  }
  return { S, files };
}
function ensureExampleProfiles() {
  const lib = P.profiles.library = P.profiles.library || [];
  if (!lib.some(p => p.id === 'demo-random')) lib.push({ id: 'demo-random', name: 'Example random, 20 to 2000 Hz (example project)', short: 'example', type: 'random', axis: '', notes: 'Profile of the example project.', bp: EX_RANDOM.map(b => [...b]), limits: [] });
  if (!lib.some(p => p.id === 'demo-srs')) lib.push({ id: 'demo-srs', name: 'Example SRS 500 g, knee 1000 Hz (example project)', short: '500 g', type: 'srs', axis: '', pulses: 2, notes: 'Profile of the example project. Q = 10.', bp: EX_SRS.map(b => [...b]), limits: [] });
}
async function loadExampleProject() {
  closeModal(); setStatus('Building the example…'); await new Promise(r => setTimeout(r, 30));
  const { S, files } = exampleData(); ensureExampleProfiles();
  const today = new Date().toISOString().slice(0, 10);
  const sensors = S.map((s, i) => newSensor(i + 1, { name: s.name, part: s.part || 'payload', brand: 'Example', ch: { X: s.ch[0], Y: s.ch[1], Z: s.ch[2] }, p3: s.p3, note: 'Example sensor' }));
  const sess = newSession('Example · Electronics box on an interface plate', today, 'Electronics box (example)', { model3d: 'fixture+box', sensors });
  sess.geom = { w: 220, d: 180, h: 170 }; sess.notes = 'Example project, made-up data. An electronics box on an interface plate with four triax accelerometers (lid, bracket, PCB centre, plate), tested in X and Z: signature sweep, random at the example profile, signature, shock (two pulses at the example SRS), signature. In X the bracket loosens during the random run: its mode drops from 185 to about 173 Hz, which the Signatures tab flags. Delete this session whenever you like.';
  P.sessions.push(sess); const tests = new Map();
  for (const ef of files) {
    const f = parseTable(ef.rows, ef.name); f.sessionId = sess.id; f.detected = { ...f.detected, axis: ef.axis, run: ef.run, kindId: ef.kind, confidence: 1 };
    const key = ef.axis + ef.run; let t = tests.get(key);
    if (!t) { t = newTest(sess.id, ef.axis, ef.kind, ef.run, ef.kind === 'sig' ? `Signature sweep (run ${ef.run})` : null); if (ef.profile) t.profile = ef.profile; P.tests.push(t); tests.set(key, t); }
    P.files.push(f); assignFileToTest(f.id, t.id);
  }
  const tx = [...tests.values()].find(t => t.axis === 'X' && t.run === 3); if (tx) tx.notes = 'After the X random: the bracket mode moved from 185 to about 173 Hz (about -6 %). Open Signatures (or press "Compare before vs after") to see it flagged.';
  campaignsOf().push({ id: uid(), name: 'Example qualification', notes: 'Example campaign: the runs that count for the example box.', testIds: [...tests.values()].map(t => t.id), created: Date.now() });
  UI.sessionId = sess.id; for (const s of P.sessions) s.collapsed = s.id !== sess.id; UI.treeMode = 'date'; UI.tab = 'overview';
  persist(); render(); setStatus(`${P.files.length} files · ${P.tests.length} tests`); toast('Example project loaded. Open a test on the left, or follow the guide.');
}
