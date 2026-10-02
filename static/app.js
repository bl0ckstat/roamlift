/* RoamLift frontend — no framework, one state object, views rendered into #view. */
"use strict";

const S = {
  profile: JSON.parse(localStorage.getItem("profile") || "null"),
  meta: null,
  gyms: [],
  templates: [],
  session: null,        // {id, mode}
  suggestion: null,
  se: null,             // active logging: {id, exercise, target_sets, target_reps, sets, suggested}
};

const view = document.getElementById("view");
const headerRight = document.getElementById("header-right");
let demoTimer = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function api(path, opts = {}) {
  if (opts.body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(opts.body);
    opts.method = opts.method || "POST";
  }
  const r = await fetch("/api" + path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

function setHeader(html) { headerRight.innerHTML = html || ""; }

function render(html) {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  view.innerHTML = html;
}

function startDemo(images) {
  const img = document.getElementById("demo-img");
  if (!img || images.length < 2) return;
  let i = 0;
  demoTimer = setInterval(() => { i = 1 - i; img.src = images[i]; }, 900);
}

/* ------------------------------------------------ navigation */

async function go(where, arg) {
  setHeader(S.profile ? `<span onclick="go('profile')">${esc(S.profile.name)}</span>` : "");
  if (!S.meta) S.meta = await api("/meta");
  if (!S.profile && where !== "profile") where = "profile";
  if (where === "profile") return renderProfilePicker();
  if (where === "home") return renderHome();
  if (where === "gyms") return renderGyms();
  if (where === "gym-edit") return renderGymEditor(arg);
  if (where === "templates") return renderTemplates();
  if (where === "template-edit") return renderTemplateEditor(arg);
  if (where === "free-setup") return renderFreeSetup();
  if (where === "template-setup") return renderTemplateSetup();
  if (where === "session") return renderSession();
  if (where === "history") return renderHistory();
}

/* ------------------------------------------------ profiles */

async function renderProfilePicker() {
  const profiles = await api("/profiles");
  render(`
    <h2>Who's training?</h2>
    ${profiles.map(p => `<button onclick="pickProfile(${p.id}, '${esc(p.name)}')">${esc(p.name)}</button>`).join("")}
    <div class="card">
      <input type="text" id="new-profile" placeholder="New profile name">
      <button class="primary" onclick="createProfile()">Add profile</button>
    </div>`);
}

function pickProfile(id, name) {
  S.profile = { id, name };
  localStorage.setItem("profile", JSON.stringify(S.profile));
  go("home");
}

async function createProfile() {
  const name = document.getElementById("new-profile").value.trim();
  if (!name) return;
  const p = await api("/profiles", { body: { name } });
  pickProfile(p.id, name);
}

/* ------------------------------------------------ home */

async function renderHome() {
  S.session = null; S.se = null; S.suggestion = null;
  const resumeId = localStorage.getItem("activeSession");
  let resumeHtml = "";
  if (resumeId) {
    try {
      const sess = await api(`/sessions/${resumeId}`);
      if (!sess.finished_at) {
        resumeHtml = `<button class="warn" onclick="resumeSession(${resumeId})">▶ Resume session in progress</button>`;
      } else localStorage.removeItem("activeSession");
    } catch { localStorage.removeItem("activeSession"); }
  }
  render(`
    ${resumeHtml}
    <button class="primary" onclick="go('free-setup')">🏋️ Free session</button>
    <button class="primary" onclick="go('template-setup')">📋 Workout from template</button>
    <h2>Manage</h2>
    <button onclick="go('templates')">My workouts</button>
    <button onclick="go('gyms')">Gyms &amp; equipment</button>
    <button onclick="go('history')">History</button>`);
}

/* ------------------------------------------------ gyms */

async function renderGyms() {
  S.gyms = await api("/gyms");
  render(`
    <h2>Gyms</h2>
    <p class="dim topnote">A gym profile records what equipment is available, so suggestions always fit. Create one per hotel gym you visit.</p>
    ${S.gyms.map(g => `
      <div class="list-item">
        <div class="spread" onclick="go('gym-edit', ${g.id})">
          <strong>${esc(g.name)}</strong>
          <span class="dim">${g.equipment.length} equipment ›</span>
        </div>
      </div>`).join("")}
    <button class="primary" onclick="go('gym-edit')">+ New gym</button>
    <button class="ghost" onclick="go('home')">Back</button>`);
}

async function renderGymEditor(gymId) {
  const gym = gymId ? S.gyms.find(g => g.id === gymId) : { name: "", equipment: ["dumbbell", "machine", "cable"] };
  render(`
    <h2>${gymId ? "Edit gym" : "New gym"}</h2>
    <input type="text" id="gym-name" placeholder="Gym name (e.g. Hilton KL)" value="${esc(gym.name)}">
    <div class="card">
      ${S.meta.equipment.map(eq => `
        <label class="check">
          <input type="checkbox" value="${eq}" ${gym.equipment.includes(eq) ? "checked" : ""}> ${esc(eq)}
        </label>`).join("")}
      <p class="dim">Bodyweight exercises are always available.</p>
    </div>
    <button class="primary" onclick="saveGym(${gymId || "null"})">Save</button>
    ${gymId ? `<button class="danger-ghost" onclick="deleteGym(${gymId})">Delete gym</button>` : ""}
    <button class="ghost" onclick="go('gyms')">Cancel</button>`);
}

async function saveGym(gymId) {
  const name = document.getElementById("gym-name").value.trim();
  if (!name) return;
  const equipment = [...view.querySelectorAll("input[type=checkbox]:checked")].map(c => c.value);
  if (gymId) await api(`/gyms/${gymId}`, { method: "PUT", body: { name, equipment } });
  else await api("/gyms", { body: { name, equipment } });
  go("gyms");
}

async function deleteGym(gymId) {
  if (!confirm("Delete this gym?")) return;
  await api(`/gyms/${gymId}`, { method: "DELETE" });
  go("gyms");
}

/* ------------------------------------------------ templates */

async function renderTemplates() {
  S.templates = await api(`/templates?profile_id=${S.profile.id}`);
  render(`
    <h2>My workouts</h2>
    ${S.templates.map(t => `
      <div class="list-item">
        <div class="spread" onclick="go('template-edit', ${t.id})">
          <strong>${esc(t.name)}</strong>
          <span class="dim">${t.items.length} exercises ›</span>
        </div>
      </div>`).join("")}
    <button class="primary" onclick="go('template-edit')">+ New workout</button>
    <button class="ghost" onclick="go('home')">Back</button>`);
}

let editorItems = [];
let editorPartFilter = "";

async function renderTemplateEditor(templateId) {
  const t = templateId ? S.templates.find(x => x.id === templateId) : { name: "", items: [] };
  editorItems = t.items.map(i => ({ ...i }));
  render(`
    <h2>${templateId ? "Edit workout" : "New workout"}</h2>
    <input type="text" id="tpl-name" placeholder="Workout name (e.g. Push day)" value="${esc(t.name)}">
    <div id="tpl-items"></div>
    <h2>Add exercises</h2>
    <input type="search" id="ex-search" placeholder="Search exercises…" oninput="searchExercises()">
    <div id="part-filters">
      ${["", ...S.meta.bodyParts].map(p => `
        <button class="chip ${p === editorPartFilter ? "sel" : ""}"
          onclick="editorPartFilter='${p}'; renderPartChips(); searchExercises()">${p || "All"}</button>`).join("")}
    </div>
    <div id="ex-results"></div>
    <button class="primary" onclick="saveTemplate(${templateId || "null"})">Save workout</button>
    ${templateId ? `<button class="danger-ghost" onclick="deleteTemplate(${templateId})">Delete workout</button>` : ""}
    <button class="ghost" onclick="go('templates')">Cancel</button>`);
  renderEditorItems();
  searchExercises();
}

function renderPartChips() {
  document.querySelectorAll("#part-filters .chip").forEach(b => {
    b.classList.toggle("sel", (b.textContent === "All" ? "" : b.textContent) === editorPartFilter);
  });
}

function renderEditorItems() {
  const el = document.getElementById("tpl-items");
  if (!el) return;
  el.innerHTML = editorItems.length === 0 ? `<p class="dim">No exercises yet — add some below.</p>` :
    editorItems.map((it, i) => `
      <div class="list-item">
        <div class="spread">
          <strong>${esc(it.name)}</strong>
          <span>
            <button class="small ghost" onclick="moveItem(${i},-1)">↑</button>
            <button class="small ghost" onclick="moveItem(${i},1)">↓</button>
            <button class="small danger-ghost" onclick="editorItems.splice(${i},1);renderEditorItems()">✕</button>
          </span>
        </div>
        <div class="row" style="margin-top:8px">
          <span class="dim">Sets</span>
          <input type="number" min="1" value="${it.target_sets}" onchange="editorItems[${i}].target_sets=+this.value">
          <span class="dim">Reps</span>
          <input type="number" min="1" value="${it.target_reps}" onchange="editorItems[${i}].target_reps=+this.value">
        </div>
      </div>`).join("");
}

let searchTimer = null;
function searchExercises() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = document.getElementById("ex-search")?.value || "";
    const res = await api(`/exercises?q=${encodeURIComponent(q)}&body_part=${encodeURIComponent(editorPartFilter)}&limit=25`);
    const el = document.getElementById("ex-results");
    if (!el) return;
    el.innerHTML = res.map(ex => `
      <div class="list-item">
        <div class="spread">
          <span>
            <strong>${esc(ex.name)}</strong><br>
            <span class="badge part">${esc(ex.bodyPart || "?")}</span>
            <span class="badge eq">${esc(ex.equipment || "body only")}</span>
          </span>
          <button class="small primary" onclick='addEditorItem(${JSON.stringify(ex.id)}, ${JSON.stringify(ex.name)})'>+</button>
        </div>
      </div>`).join("") || `<p class="dim">No matches.</p>`;
  }, 250);
}

function addEditorItem(id, name) {
  editorItems.push({ exercise_id: id, name, target_sets: 3, target_reps: 8 });
  renderEditorItems();
}

async function saveTemplate(templateId) {
  const name = document.getElementById("tpl-name").value.trim();
  if (!name || editorItems.length === 0) { alert("Name and at least one exercise required"); return; }
  const body = {
    profile_id: S.profile.id, name,
    items: editorItems.map(i => ({ exercise_id: i.exercise_id, target_sets: i.target_sets, target_reps: i.target_reps })),
  };
  if (templateId) await api(`/templates/${templateId}`, { method: "PUT", body });
  else await api("/templates", { body });
  go("templates");
}

async function deleteTemplate(templateId) {
  if (!confirm("Delete this workout?")) return;
  await api(`/templates/${templateId}`, { method: "DELETE" });
  go("templates");
}

/* ------------------------------------------------ session setup */

let setupGym = null, setupFocus = "full body", setupTemplate = null;

function gymChips() {
  return `
    <h2>Where are you training?</h2>
    <div>
      <button class="chip ${setupGym === null ? "sel" : ""}" onclick="setupGym=null;refreshChips()">Anywhere (all equipment)</button>
      ${S.gyms.map(g => `
        <button class="chip ${setupGym === g.id ? "sel" : ""}" data-gym="${g.id}"
          onclick="setupGym=${g.id};refreshChips()">${esc(g.name)}</button>`).join("")}
    </div>
    <p class="dim">Set up gyms under “Gyms &amp; equipment”.</p>`;
}

function refreshChips() {
  document.querySelectorAll("[data-gym]").forEach(b =>
    b.classList.toggle("sel", +b.dataset.gym === setupGym));
  document.querySelectorAll("[data-focus]").forEach(b =>
    b.classList.toggle("sel", b.dataset.focus === setupFocus));
  document.querySelectorAll("[data-tpl]").forEach(b =>
    b.classList.toggle("sel", +b.dataset.tpl === setupTemplate));
  const anyGym = document.querySelector("#view .chip");
  if (anyGym && anyGym.textContent.startsWith("Anywhere")) anyGym.classList.toggle("sel", setupGym === null);
}

async function renderFreeSetup() {
  S.gyms = await api("/gyms");
  setupGym = null; setupFocus = "full body";
  render(`
    <h2>Focus</h2>
    <div>
      ${["full body", ...S.meta.bodyParts].map(p => `
        <button class="chip ${p === setupFocus ? "sel" : ""}" data-focus="${p}"
          onclick="setupFocus='${p}';refreshChips()">${p === "full body" ? "Full body" : p}</button>`).join("")}
    </div>
    ${gymChips()}
    <button class="primary" onclick="startFreeSession()">Start session</button>
    <button class="ghost" onclick="go('home')">Back</button>`);
}

async function renderTemplateSetup() {
  [S.gyms, S.templates] = await Promise.all([api("/gyms"), api(`/templates?profile_id=${S.profile.id}`)]);
  if (S.templates.length === 0) {
    render(`<p class="dim topnote">No saved workouts yet.</p>
      <button class="primary" onclick="go('template-edit')">Create one</button>
      <button class="ghost" onclick="go('home')">Back</button>`);
    return;
  }
  setupGym = null; setupTemplate = S.templates[0].id;
  render(`
    <h2>Workout</h2>
    <div>
      ${S.templates.map(t => `
        <button class="chip ${t.id === setupTemplate ? "sel" : ""}" data-tpl="${t.id}"
          onclick="setupTemplate=${t.id};refreshChips()">${esc(t.name)}</button>`).join("")}
    </div>
    ${gymChips()}
    <button class="primary" onclick="startTemplateSession()">Start workout</button>
    <button class="ghost" onclick="go('home')">Back</button>`);
}

async function startFreeSession() {
  const r = await api("/sessions", { body: { profile_id: S.profile.id, gym_id: setupGym, mode: "free", focus: setupFocus } });
  S.session = { id: r.id, mode: "free" };
  S.suggestion = r.suggestion;
  localStorage.setItem("activeSession", r.id);
  go("session");
}

async function startTemplateSession() {
  const r = await api("/sessions", { body: { profile_id: S.profile.id, gym_id: setupGym, mode: "template", template_id: setupTemplate } });
  S.session = { id: r.id, mode: "template" };
  S.suggestion = r.suggestion;
  localStorage.setItem("activeSession", r.id);
  go("session");
}

async function resumeSession(id) {
  const sess = await api(`/sessions/${id}`);
  S.session = { id: sess.id, mode: sess.mode };
  const active = sess.exercises.find(e => e.status === "active");
  if (active) {
    const ex = await api(`/exercises/${active.exercise_id}`);
    S.se = {
      id: active.id, exercise: ex,
      target_sets: active.target_sets, target_reps: active.target_reps,
      sets: active.sets, suggested: null,
    };
    S.suggestion = null;
  } else {
    S.suggestion = sess.suggestion;
    S.se = null;
  }
  go("session");
}

/* ------------------------------------------------ session */

function sessionHeader() {
  setHeader(`<button class="small ghost" onclick="finishSession()">End session</button>`);
}

async function renderSession() {
  sessionHeader();
  if (S.se) return renderLogging();
  const sg = S.suggestion;
  if (!sg || sg.done) {
    render(`
      <div class="card" style="text-align:center">
        <p style="font-size:40px;margin:6px">🎉</p>
        <p><strong>${sg && sg.reason ? esc(sg.reason) : "Workout complete!"}</strong></p>
      </div>
      <button class="primary" onclick="finishSession()">Finish &amp; save session</button>`);
    return;
  }
  const ex = sg.exercise;
  const lastHtml = sg.last ? `
    <p class="dim">Last time (${sg.last.date}): ${sg.last.sets.map(s => `${s.weight_kg}×${s.reps}`).join(", ")}</p>` : "";
  render(`
    ${sg.retry ? `<div class="hint">↩ Back to this one — equipment free now?</div>` : ""}
    ${sg.substitute ? `<div class="hint">Substitute for the same body part</div>` : ""}
    <div class="card">
      <span class="badge part">${esc(sg.body_part || ex.bodyPart || "")}</span>
      <span class="badge eq">Needs: ${esc(ex.equipment || "body only")}</span>
      <div class="exname spread">${esc(ex.name)}
        <span class="star" onclick="toggleFavorite()">${sg.favorite ? "★" : "☆"}</span>
      </div>
      ${ex.images.length ? `<div class="demo"><img id="demo-img" src="${ex.images[0]}" alt="demo"></div>` : ""}
      <details><summary>How to do it</summary>
        <ol>${ex.instructions.map(i => `<li>${esc(i)}</li>`).join("")}</ol>
      </details>
      ${lastHtml}
      <p class="dim">Target: ${sg.target_sets} × ${sg.target_reps}</p>
    </div>
    <button class="primary" onclick="acceptSuggestion()">✓ Do this</button>
    <button onclick="skip('same')">⏭ Skip — same body part</button>
    <button onclick="skip('different')">⏭ ${S.session.mode === "template" ? "Skip this exercise" : "Skip — different body part"}</button>
    <button class="warn" onclick="skip('later')">⏳ Equipment busy — try again later</button>`);
  startDemo(ex.images);
}

async function toggleFavorite() {
  const target = S.se || S.suggestion;
  const exId = S.se ? S.se.exercise.id : S.suggestion.exercise.id;
  const r = await api("/favorites/toggle", { body: { profile_id: S.profile.id, exercise_id: exId } });
  target.favorite = r.favorite;
  renderSession();
}

async function skip(reason) {
  const sg = S.suggestion;
  const r = await api(`/sessions/${S.session.id}/skip`, {
    body: {
      exercise_id: sg.exercise.id, reason,
      template_item_id: sg.template_item_id || null,
      retry_se_id: sg.retry_se_id || null,
    },
  });
  S.suggestion = r.suggestion;
  renderSession();
}

async function acceptSuggestion() {
  const sg = S.suggestion;
  const r = await api(`/sessions/${S.session.id}/accept`, {
    body: {
      exercise_id: sg.exercise.id,
      template_item_id: sg.template_item_id || null,
      retry_se_id: sg.retry_se_id || null,
      target_sets: sg.target_sets, target_reps: sg.target_reps,
    },
  });
  S.se = {
    id: r.session_exercise_id, exercise: sg.exercise,
    target_sets: sg.target_sets, target_reps: sg.target_reps,
    sets: [], suggested: sg.suggested_weight,
    bodyweight: sg.bodyweight, last: sg.last, favorite: sg.favorite,
  };
  S.suggestion = null;
  renderSession();
}

function renderLogging() {
  const se = S.se, ex = se.exercise;
  const suggestedNote = se.bodyweight
    ? `<div class="hint">Bodyweight exercise — log added weight (0 if none).</div>`
    : se.suggested != null
      ? `<div class="hint">Suggested: <strong>${se.suggested} kg</strong>${se.last && se.last.progressed ? " (progressed — you hit all your targets last time 💪)" : se.last ? " (same as last time)" : ""}</div>`
      : `<div class="hint">First time on this exercise — pick a comfortable weight; next time it's remembered.</div>`;
  render(`
    <div class="card">
      <div class="exname spread">${esc(ex.name)}
        <span class="star" onclick="toggleFavorite()">${se.favorite ? "★" : "☆"}</span>
      </div>
      <span class="badge eq">${esc(ex.equipment || "body only")}</span>
      <span class="dim">Target ${se.target_sets} × ${se.target_reps}</span>
      ${ex.images.length ? `<details style="margin-top:8px"><summary>Show demo</summary>
        <div class="demo"><img id="demo-img" src="${ex.images[0]}" alt="demo"></div></details>` : ""}
    </div>
    ${suggestedNote}
    <div class="card">
      <div id="sets-done">${se.sets.map((s, i) => `<div class="setrow"><span>Set ${i + 1}</span><span>${s.weight_kg} kg × ${s.reps}</span></div>`).join("")}</div>
      <div class="row" style="margin-top:10px">
        <span class="dim">kg</span><input type="number" id="w" step="0.5" value="${se.sets.length ? se.sets[se.sets.length - 1].weight_kg : (se.suggested ?? (se.bodyweight ? 0 : ""))}">
        <span class="dim">reps</span><input type="number" id="r" value="${se.target_reps}">
        <button class="small primary grow" onclick="logSet()">Log set</button>
      </div>
    </div>
    <button class="primary" onclick="finishExercise()">Done — next exercise</button>`);
  startDemo(ex.images);
}

async function logSet() {
  const w = parseFloat(document.getElementById("w").value);
  const reps = parseInt(document.getElementById("r").value, 10);
  if (isNaN(w) || isNaN(reps) || reps <= 0) return;
  await api(`/session_exercises/${S.se.id}/sets`, { body: { weight_kg: w, reps } });
  S.se.sets.push({ weight_kg: w, reps });
  renderLogging();
}

async function finishExercise() {
  if (S.se.sets.length === 0 && !confirm("No sets logged — mark as skipped?")) return;
  const r = await api(`/session_exercises/${S.se.id}/finish`, { method: "POST" });
  S.se = null;
  S.suggestion = r.suggestion;
  renderSession();
}

async function finishSession() {
  if (S.se && S.se.sets.length > 0) await api(`/session_exercises/${S.se.id}/finish`, { method: "POST" });
  await api(`/sessions/${S.session.id}/finish`, { method: "POST" });
  localStorage.removeItem("activeSession");
  S.session = null; S.se = null; S.suggestion = null;
  go("history");
}

/* ------------------------------------------------ history */

async function renderHistory() {
  const sessions = await api(`/sessions?profile_id=${S.profile.id}`);
  render(`
    <h2>History</h2>
    ${sessions.length === 0 ? `<p class="dim">No sessions yet.</p>` : ""}
    ${sessions.map(s => {
      const done = s.exercises.filter(e => e.status === "done");
      const label = s.mode === "template" ? "Workout" : (s.focus === "full body" ? "Full body" : s.focus);
      return `
      <div class="list-item">
        <div class="spread" onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden">
          <span><strong>${s.started_at.slice(0, 10)}</strong> · ${esc(label || "")}${s.gym ? ` · ${esc(s.gym)}` : ""}</span>
          <span class="dim">${done.length} exercises ›</span>
        </div>
        <div hidden>
          ${s.exercises.map(e => e.status === "done"
            ? `<div class="setrow"><span>${esc(e.name)}</span><span>${e.sets.map(x => `${x.weight_kg}×${x.reps}`).join(", ")}</span></div>`
            : `<div class="setrow"><span class="muted-strike">${esc(e.name)}</span><span class="dim">skipped</span></div>`).join("")}
        </div>
      </div>`;
    }).join("")}
    <button class="ghost" onclick="go('home')">Back</button>`);
}

/* ------------------------------------------------ boot */

go(S.profile ? "home" : "profile");
