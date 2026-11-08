// Klasse 6 learning app: subject browser from the verified syllabus + interactive 3D explanations (maths first).
import { Scene } from './engine3d.js';
import { SCENES } from './scenes.js';

const $ = id => document.getElementById(id);
const THEME = { bgTop: '#0d1229', bgBottom: '#170d38', accent: '#5c9eff', accent2: '#6bedb8', text: '#ffffff', muted: 'rgba(255,255,255,0.7)', dark: true };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let data, subject, topic, scene = null, params = {}, time = 0, playing = true, last = 0, raf = 0;
let orbit = { az: 0, el: 0 }, drag = null;

async function main() {
  data = await (await fetch('data/klasse6-bayern.json')).json();
  $('checkBadge').textContent = `Lehrplan geprüft am ${new Date(data.meta.checkedOn).toLocaleDateString('de-DE')}`;
  renderPlan();
  renderSubjects();
  const want = location.hash.replace('#', '');
  const found = want && data.subjects.flatMap(s => s.lernbereiche.flatMap(lb => lb.topics.map(tp => ({ s, tp })))).find(x => x.tp.id === want);
  selectSubject(found ? found.s : data.subjects[0], found ? found.tp : null);
  $('showPlan').onclick = () => { $('planCard').hidden = !$('planCard').hidden; };
  $('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pause' : 'Abspielen'; };
  $('restart').onclick = () => { time = 0; playing = true; $('play').textContent = 'Pause'; };
  $('scrub').oninput = e => { if (scene) { time = (e.target.value / 1000) * scene.duration; playing = false; $('play').textContent = 'Abspielen'; } };
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; orbit.az = drag.az + (e.clientX - drag.x) * 0.006; orbit.el = Math.max(-0.3, Math.min(0.5, drag.el + (e.clientY - drag.y) * 0.004)); });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointercancel', () => { drag = null; });
  stage.addEventListener('dblclick', () => { orbit = { az: 0, el: 0 }; });
  requestAnimationFrame(loop);
}

function renderPlan() {
  const st = data.stundentafel;
  $('planTable').innerHTML = `<tr><th>Fach</th><th>Std./Woche</th></tr>` + st.weeklyHours.map(r => `<tr><td>${esc(r.subject)}${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td><td>${r.hours || '–'}</td></tr>`).join('') + `<tr><td><b>Summe</b></td><td><b>${esc(st.total)}</b></td></tr>`;
  $('planNote').textContent = `Quelle: ${st.source}. ${data.meta.notes[1]}`;
}

function renderSubjects() {
  const box = $('subjects'); box.innerHTML = '';
  for (const s of data.subjects) {
    const b = document.createElement('button');
    b.innerHTML = `<i style="background:${s.color}"></i><span>${esc(s.name)}</span><span class="h">${s.weeklyHours} Std.</span>`;
    b.onclick = () => selectSubject(s, null);
    b.dataset.id = s.id; box.appendChild(b);
  }
}

function selectSubject(s, tp) {
  subject = s;
  for (const b of $('subjects').children) b.classList.toggle('active', b.dataset.id === s.id);
  $('subjectTitle').textContent = s.name;
  $('subjectHours').textContent = `${s.weeklyHours} Wochenstunden${s.totalHours ? ` · ca. ${s.totalHours} Std. im Jahr` : ''}`;
  $('subjectLink').href = s.url;
  const box = $('topics'); box.innerHTML = '';
  for (const lb of s.lernbereiche) {
    const head = document.createElement('div'); head.className = 'lb'; head.textContent = `${lb.id.replace('-', ' ')} · ${lb.title}${lb.hours ? ` · ca. ${lb.hours} Std.` : ''}`; box.appendChild(head);
    const list = document.createElement('div'); list.className = 'topics';
    for (const t of lb.topics) {
      const d = document.createElement('div'); d.className = 'topic'; d.dataset.id = t.id;
      const has3d = t.scene && SCENES[t.scene];
      d.innerHTML = `<div class="t">${esc(t.title)}${has3d ? '<span class="pill">3D</span>' : t.scene ? '<span class="pill plan">3D geplant</span>' : ''}</div><div class="c">${t.hours ? `ca. ${t.hours} Std. · ` : ''}${esc((t.inhalte || []).slice(0, 3).join(' · '))}</div>`;
      d.onclick = () => selectTopic(t);
      list.appendChild(d);
    }
    box.appendChild(list);
  }
  const first = tp || s.lernbereiche.flatMap(lb => lb.topics).find(t => t.scene && SCENES[t.scene]) || s.lernbereiche[0].topics[0];
  selectTopic(first, !tp);
}

function selectTopic(t, quiet = false) {
  topic = t;
  for (const d of document.querySelectorAll('.topic')) d.classList.toggle('active', d.dataset.id === t.id);
  history.replaceState(null, '', '#' + t.id);
  $('lesson').hidden = false;
  $('lessonTitle').textContent = `${t.id.replace('-', ' ')} · ${t.title}`;
  $('lessonHours').textContent = t.hours ? `ca. ${t.hours} Std.` : '';
  $('kid').textContent = t.kidExplanation || 'Für dieses Thema wird die kindgerechte Erklärung noch geschrieben. Die Inhalte unten kommen direkt aus dem Lehrplan.';
  $('kompetenzen').innerHTML = (t.kompetenzen || []).map(k => `<li>${esc(k)}</li>`).join('') || '<li class="note">Kompetenzerwartungen siehe Fachlehrplan (Link unten).</li>';
  $('inhalte').innerHTML = (t.inhalte || []).map(k => `<li>${esc(k)}</li>`).join('');
  $('lessonSource').innerHTML = `Quelle: <a href="${esc(subject.url)}" target="_blank" rel="noopener">LehrplanPLUS Gymnasium Jahrgangsstufe 6, ${esc(subject.name)}</a>${t.note ? ` · ${esc(t.note)}` : ''}`;
  const sc = t.scene && SCENES[t.scene];
  $('sceneBlock').hidden = !sc; $('noScene').hidden = !!sc;
  if (!sc) { $('noScene').textContent = t.scene ? `Die 3D-Erklärung „${t.scene}“ ist geplant (siehe klasse6/PIPELINE.md). Mathematik ist zuerst dran.` : 'Für diesen Lernbereich ist keine 3D-Szene vorgesehen; hier helfen Texte, Übungen und Gespräche mehr.'; scene = null; return; }
  if (scene !== sc) { scene = sc; params = {}; for (const p of sc.params) params[p.id] = p.value; time = 0; playing = true; $('play').textContent = 'Pause'; orbit = { az: 0, el: 0 }; renderParams(); }
  if (!quiet) $('lesson').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderParams() {
  const box = $('params'); box.innerHTML = '';
  for (const p of scene.params) {
    const wrap = document.createElement('label');
    if (p.options) {
      wrap.innerHTML = `${esc(p.label)}<select></select>`;
      const sel = wrap.querySelector('select');
      for (const o of p.options) { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); }
      sel.value = params[p.id];
      sel.onchange = () => { params[p.id] = sel.value; time = 0; renderSteps(); };
    } else {
      wrap.innerHTML = `${esc(p.label)}: <b data-v>${fmt(params[p.id])}</b><input type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
      const inp = wrap.querySelector('input'); inp.value = params[p.id];
      inp.oninput = () => { params[p.id] = parseFloat(inp.value); clampParams(); wrap.querySelector('[data-v]').textContent = fmt(params[p.id]); renderSteps(); syncParamLabels(); };
    }
    box.appendChild(wrap);
  }
  renderSteps();
}
function clampParams() { for (const p of scene.params) if (p.maxFrom && params[p.id] > params[p.maxFrom]) params[p.id] = params[p.maxFrom]; }
function syncParamLabels() { const labels = $('params').querySelectorAll('label'); scene.params.forEach((p, i) => { const v = labels[i].querySelector('[data-v]'); const inp = labels[i].querySelector('input'); if (v) v.textContent = fmt(params[p.id]); if (inp) inp.value = params[p.id]; }); }
const fmt = v => String(v).replace('.', ',');

let stepsCache = [];
function renderSteps() {
  stepsCache = scene.steps(params);
  const box = $('steps'); box.innerHTML = '';
  stepsCache.forEach((s, i) => { const d = document.createElement('div'); d.textContent = s.text; d.onclick = () => { time = s.t + 0.01; playing = true; $('play').textContent = 'Pause'; }; box.appendChild(d); });
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (!scene || $('lesson').hidden) return;
  if (playing) { time += dt; if (time > scene.duration) time = 0; }
  const canvas = $('stage'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  const cam = scene.camera || {};
  const S = new Scene(ctx, w, h, THEME, { ...cam, azimuth: (cam.azimuth ?? -0.6) + orbit.az, elevation: Math.max(0.12, Math.min(1.35, (cam.elevation ?? 0.42) + orbit.el)) });
  S.background();
  scene.draw(S, time, params);
  S.flush();
  $('scrub').value = Math.round((time / scene.duration) * 1000);
  $('time').textContent = `${time.toFixed(1).replace('.', ',')} s / ${scene.duration} s`;
  let active = -1; stepsCache.forEach((s, i) => { if (time >= s.t) active = i; });
  const kids = $('steps').children; for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === active);
}

main().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p style="color:#ff6b6b;padding:12px">Fehler beim Laden: ${esc(e.message)}</p>`); console.error(e); });
