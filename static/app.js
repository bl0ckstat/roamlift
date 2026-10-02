/* RoamLift frontend — no framework, one state object, views rendered into #view. */
"use strict";

const S = {
  profile: JSON.parse(localStorage.getItem("profile") || "null"),
  meta: null,
  gyms: [],
  templates: [],
  session: null,        // {id, mode, done: n}
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

/* ------------------------------------------------ icons */

const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const EQ_ICONS = {
  "dumbbell": svg(`<rect x="2" y="9.4" width="2.2" height="5.2" rx="1" fill="currentColor" stroke="none"/><rect x="5" y="7.6" width="2.6" height="8.8" rx="1.1" fill="currentColor" stroke="none"/><rect x="16.4" y="7.6" width="2.6" height="8.8" rx="1.1" fill="currentColor" stroke="none"/><rect x="19.8" y="9.4" width="2.2" height="5.2" rx="1" fill="currentColor" stroke="none"/><line x1="7.8" y1="12" x2="16.2" y2="12"/>`),
  "barbell": svg(`<line x1="1.5" y1="12" x2="22.5" y2="12"/><rect x="4.2" y="6.8" width="2.1" height="10.4" rx=".9" fill="currentColor" stroke="none"/><rect x="7" y="8.6" width="1.7" height="6.8" rx=".8" fill="currentColor" stroke="none"/><rect x="17.7" y="6.8" width="2.1" height="10.4" rx=".9" fill="currentColor" stroke="none"/><rect x="15.3" y="8.6" width="1.7" height="6.8" rx=".8" fill="currentColor" stroke="none"/>`),
  "kettlebells": svg(`<path d="M8.6 9.8V7.2a3.4 3.4 0 0 1 6.8 0v2.6"/><circle cx="12" cy="14.3" r="5.6" fill="currentColor" stroke="none"/>`),
  "machine": svg(`<line x1="12" y1="2.5" x2="12" y2="16"/><rect x="6.8" y="5" width="10.4" height="3.4" rx="1.2" fill="currentColor" stroke="none"/><rect x="6.8" y="10" width="10.4" height="3.4" rx="1.2" fill="currentColor" stroke="none"/><rect x="6.8" y="15" width="10.4" height="3.4" rx="1.2" fill="currentColor" stroke="none"/><line x1="8.5" y1="21" x2="15.5" y2="21"/>`),
  "cable": svg(`<circle cx="12" cy="4.6" r="2.4"/><line x1="12" y1="7" x2="12" y2="14.6"/><rect x="7.6" y="14.6" width="8.8" height="3.6" rx="1.8" fill="currentColor" stroke="none"/><line x1="9" y1="21" x2="15" y2="21"/>`),
  "e-z curl bar": svg(`<path d="M2.8 12h3.4l2.6 2.4 3.2-4.8 3.2 4.8 2.6-2.4h3.4"/><rect x="1.4" y="9" width="1.9" height="6" rx=".9" fill="currentColor" stroke="none"/><rect x="20.7" y="9" width="1.9" height="6" rx=".9" fill="currentColor" stroke="none"/>`),
  "bands": svg(`<ellipse cx="12" cy="12" rx="8.6" ry="4.2" transform="rotate(-28 12 12)"/><ellipse cx="12" cy="12" rx="5.4" ry="2.3" transform="rotate(-28 12 12)"/>`),
  "exercise ball": svg(`<circle cx="12" cy="12" r="8.4"/><path d="M4.4 9.6c4.4-2.2 10.8-2.2 15.2 0M4.4 14.4c4.4 2.2 10.8 2.2 15.2 0"/>`),
  "medicine ball": svg(`<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6c3.2 2.4 3.2 14.4 0 16.8M12 3.6c-3.2 2.4-3.2 14.4 0 16.8M3.8 12h16.4"/>`),
  "body only": svg(`<circle cx="12" cy="4.6" r="2.3" fill="currentColor" stroke="none"/><path d="M12 7.6v6.2M12 9.6L7.4 12.4M12 9.6l4.6 2.8M12 13.8l-3.4 6.4M12 13.8l3.4 6.4"/>`),
  "other": svg(`<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 3l-1 .8v1.4"/><line x1="12" y1="17.4" x2="12" y2="17.5"/>`),
};
const ICONS = {
  flash: svg(`<path d="M13 2.5 4.5 13.5h6l-1 8L18 10.5h-6l1-8z" fill="currentColor" stroke="none"/>`),
  chart: svg(`<path d="M3.5 20.5h17"/><path d="M5 16.5l4.4-5 3.6 2.8 5.6-7"/><circle cx="5" cy="16.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="9.4" cy="11.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="13" cy="14.3" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.6" cy="7.3" r="1.4" fill="currentColor" stroke="none"/>`),
  link: svg(`<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.8 4.7a3.8 3.8 0 0 1 5.4 5.4L16.4 12"/><path d="M13 17.5l-1.8 1.8a3.8 3.8 0 0 1-5.4-5.4L7.6 12"/>`),
  list: svg(`<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.6" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.3" fill="currentColor" stroke="none"/>`),
  pin: svg(`<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>`),
  search: svg(`<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.3" y1="15.3" x2="21" y2="21"/>`),
  clock: svg(`<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>`),
};

function eqIcon(eq) {
  return `<span class="eqicon">${EQ_ICONS[eq || "body only"] || EQ_ICONS.other}</span>`;
}
function eqBadge(eq, prefix = "") {
  return `<span class="badge eq">${eqIcon(eq)}${prefix}${esc(eq || "body only")}</span>`;
}

const PART_COLORS = {
  Chest: "#ff8787", Back: "#74c0fc", Shoulders: "#ffc078",
  Arms: "#b197fc", Legs: "#69db7c", Core: "#66d9e8",
};
function partBadge(part) {
  if (!part) return "";
  const c = PART_COLORS[part] || "#c6d2dd";
  return `<span class="badge part" style="color:${c};border-color:${c}40;background:${c}14">${esc(part)}</span>`;
}

const AVATAR_HUES = [145, 20, 210, 275, 45, 330];
function avatar(name, cls = "") {
  const n = name || "?";
  const h = AVATAR_HUES[[...n].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % AVATAR_HUES.length];
  return `<span class="avatar ${cls}" style="background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${h + 40} 65% 45%))">${esc((name || "?").slice(0, 2).toUpperCase())}</span>`;
}

/* ------------------------------------------------ plumbing */

async function api(path, opts = {}) {
  if (opts.body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(opts.body);
    opts.method = opts.method || "POST";
  }
  let r;
  try {
    r = await fetch("/api" + path, opts);
  } catch (e) {
    e.network = true;  // offline / server unreachable
    throw e;
  }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/* ---- offline queue for logged sets (the one write that must not be lost) ---- */

function setQueue() { return JSON.parse(localStorage.getItem("setQueue") || "[]"); }
function saveSetQueue(q) { localStorage.setItem("setQueue", JSON.stringify(q)); }

async function flushSetQueue() {
  let q = setQueue();
  while (q.length) {
    try {
      await api(`/session_exercises/${q[0].seId}/sets`, { body: q[0].body });
      q.shift(); saveSetQueue(q);
    } catch { break; }
  }
  return q.length === 0;
}
window.addEventListener("online", flushSetQueue);

function setHeader(html) { headerRight.innerHTML = html || ""; }

function render(html) {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  view.innerHTML = html;
  view.style.animation = "none";
  void view.offsetWidth;            // retrigger entry animation
  view.style.animation = "";
}

function startDemo(images) {
  const img = document.getElementById("demo-img");
  if (!img || images.length < 2) return;
  let i = 0;
  demoTimer = setInterval(() => { i = 1 - i; img.src = images[i]; }, 900);
}

/* ------------------------------------------------ navigation */

async function go(where, arg) {
  setHeader(S.profile
    ? `<span class="me" onclick="go('profile')">${avatar(S.profile.name)}${esc(S.profile.name)}</span>` : "");
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
  if (where === "progress") return renderProgress();
  if (where === "exercise-detail") return renderExerciseDetail(arg);
}

/* ------------------------------------------------ profiles */

async function renderProfilePicker() {
  const profiles = await api("/profiles");
  render(`
    <h2>Who's training?</h2>
    <div class="pgrid">
      ${profiles.map(p => `
        <span class="pcircle" onclick="pickProfile(${p.id}, '${esc(p.name)}')">
          ${avatar(p.name)}${esc(p.name)}
        </span>`).join("")}
    </div>
    <div class="card">
      <input type="text" id="new-profile" placeholder="New profile name">
      <button class="primary" style="margin-bottom:0" onclick="createProfile()">Add profile</button>
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
  S.session = null; S.se = null; S.sup = null; S.suggestion = null;
  const resumeId = localStorage.getItem("activeSession");
  let resumeHtml = "";
  if (resumeId) {
    try {
      const sess = await api(`/sessions/${resumeId}`);
      if (!sess.finished_at) {
        resumeHtml = `<button class="action warn" onclick="resumeSession(${resumeId})">
          <span class="ic" style="background:rgba(255,178,36,.12);color:var(--warn)">${ICONS.clock}</span>
          <span>Resume session<span class="sub">You have a workout in progress</span></span>
          <span class="chev">›</span></button>`;
      } else localStorage.removeItem("activeSession");
    } catch { localStorage.removeItem("activeSession"); }
  }
  render(`
    ${resumeHtml}
    <h2>Train</h2>
    <button class="action hero" onclick="go('free-setup')">
      <span class="ic">${ICONS.flash}</span>
      <span>Free session<span class="sub">Suggestions that fit this gym</span></span>
      <span class="chev">›</span>
    </button>
    <button class="action" onclick="go('template-setup')">
      <span class="ic">${ICONS.list}</span>
      <span>From a workout<span class="sub">Follow one of your templates</span></span>
      <span class="chev">›</span>
    </button>
    <h2>Manage</h2>
    <button class="action" onclick="go('templates')">
      <span class="ic">${EQ_ICONS.barbell}</span><span>My workouts</span><span class="chev">›</span>
    </button>
    <button class="action" onclick="go('gyms')">
      <span class="ic">${ICONS.pin}</span><span>Gyms &amp; equipment</span><span class="chev">›</span>
    </button>
    <button class="action" onclick="go('progress')">
      <span class="ic">${ICONS.chart}</span><span>Progress</span><span class="chev">›</span>
    </button>
    <button class="action" onclick="go('history')">
      <span class="ic">${ICONS.clock}</span><span>History</span><span class="chev">›</span>
    </button>`);
}

/* ------------------------------------------------ gyms */

async function renderGyms() {
  S.gyms = await api("/gyms");
  render(`
    <p class="dim topnote">A gym profile records what's available, so suggestions always fit. Create one per hotel gym you visit.</p>
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
          <input type="checkbox" value="${eq}" ${gym.equipment.includes(eq) ? "checked" : ""}>
          ${eqIcon(eq)} ${esc(eq)}
        </label>`).join("")}
      <p class="dim">${eqIcon("body only")} Bodyweight exercises are always available.</p>
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
    ${S.templates.length === 0 ? `<p class="dim topnote">Workouts are reusable, ordered exercise lists with set × rep targets.</p>` : ""}
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
          <span class="row">
            <button class="icon-btn" onclick="moveItem(${i},-1)">↑</button>
            <button class="icon-btn" onclick="moveItem(${i},1)">↓</button>
            <button class="icon-btn danger-ghost" onclick="editorItems.splice(${i},1);renderEditorItems()">✕</button>
          </span>
        </div>
        <div class="row" style="margin-top:10px">
          <span class="dim">Sets</span>
          <input type="number" min="1" value="${it.target_sets}" onchange="editorItems[${i}].target_sets=+this.value">
          <span class="dim">Reps</span>
          <input type="number" min="1" value="${it.target_reps}" onchange="editorItems[${i}].target_reps=+this.value">
        </div>
        ${i < editorItems.length - 1 ? `
        <button class="chip mini ${it.superset_with_next ? "sel" : ""}" style="margin-top:10px"
          onclick="editorItems[${i}].superset_with_next=!editorItems[${i}].superset_with_next;renderEditorItems()">⛓ superset with next</button>` : ""}
      </div>`).join("");
}

function moveItem(i, d) {
  const j = i + d;
  if (j < 0 || j >= editorItems.length) return;
  [editorItems[i], editorItems[j]] = [editorItems[j], editorItems[i]];
  renderEditorItems();
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
            <span style="display:inline-block;margin-top:6px">${partBadge(ex.bodyPart)}${eqBadge(ex.equipment)}</span>
          </span>
          <button class="icon-btn primary" onclick='addEditorItem(${JSON.stringify(ex.id)}, ${JSON.stringify(ex.name)})'>+</button>
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
    items: editorItems.map((i, idx) => ({
      exercise_id: i.exercise_id, target_sets: i.target_sets, target_reps: i.target_reps,
      superset_with_next: idx < editorItems.length - 1 && !!i.superset_with_next,
    })),
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
      <button class="chip ${setupGym === null ? "sel" : ""}" data-gym="any" onclick="setupGym=null;refreshChips()">Anywhere · all equipment</button>
      ${S.gyms.map(g => `
        <button class="chip ${setupGym === g.id ? "sel" : ""}" data-gym="${g.id}"
          onclick="setupGym=${g.id};refreshChips()">${esc(g.name)}</button>`).join("")}
    </div>
    <p class="dim">Set up gyms under “Gyms &amp; equipment”.</p>`;
}

function refreshChips() {
  document.querySelectorAll("[data-gym]").forEach(b =>
    b.classList.toggle("sel", b.dataset.gym === "any" ? setupGym === null : +b.dataset.gym === setupGym));
  document.querySelectorAll("[data-focus]").forEach(b =>
    b.classList.toggle("sel", b.dataset.focus === setupFocus));
  document.querySelectorAll("[data-tpl]").forEach(b =>
    b.classList.toggle("sel", +b.dataset.tpl === setupTemplate));
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
  S.session = { id: r.id, mode: "free", done: 0 };
  S.suggestion = r.suggestion;
  localStorage.setItem("activeSession", r.id);
  go("session");
}

async function startTemplateSession() {
  const r = await api("/sessions", { body: { profile_id: S.profile.id, gym_id: setupGym, mode: "template", template_id: setupTemplate } });
  S.session = { id: r.id, mode: "template", done: 0 };
  S.suggestion = r.suggestion;
  localStorage.setItem("activeSession", r.id);
  go("session");
}

async function resumeSession(id) {
  const sess = await api(`/sessions/${id}`);
  S.session = { id: sess.id, mode: sess.mode, done: sess.exercises.filter(e => e.status === "done").length };
  const actives = sess.exercises.filter(e => e.status === "active");
  wuOn = false; tfOn = false;
  if (actives.length) {
    const items = await Promise.all(actives.slice(0, 2).map(async (a) => {
      const ex = await api(`/exercises/${a.exercise_id}`);
      return {
        id: a.id, exercise: ex,
        target_sets: a.target_sets, target_reps: a.target_reps,
        sets: a.sets, suggested: null, bodyweight: false,
        last: null, best: null, favorite: false,
        note: a.note || "", lastPr: null,
      };
    }));
    if (items.length >= 2) {
      S.sup = { items, turn: items[0].sets.length <= items[1].sets.length ? 0 : 1 };
      S.se = null;
    } else {
      S.se = items[0]; S.sup = null;
    }
    S.suggestion = null;
  } else {
    S.suggestion = sess.suggestion;
    S.se = null; S.sup = null;
  }
  go("session");
}

/* ------------------------------------------------ session */

function sessionHeader() {
  const n = S.session?.done || 0;
  setHeader(`
    ${n ? `<span class="dim">${n} done</span>` : ""}
    <button class="small ghost" style="border:1px solid var(--line)" onclick="finishSession()">End</button>`);
}

async function renderSession() {
  sessionHeader();
  if (S.sup) return renderSupersetLogging();
  if (S.se) return renderLogging();
  const sg = S.suggestion;
  if (!sg || sg.done) {
    render(`
      <div class="card done-hero">
        <p class="big">🎉</p>
        <p style="font-size:19px;font-weight:800">${sg && sg.reason ? esc(sg.reason) : "Workout complete!"}</p>
        <p class="dim">${S.session.done} exercise${S.session.done === 1 ? "" : "s"} done</p>
      </div>
      <input type="text" id="sess-note" placeholder="Session note (optional)">
      <button class="primary" onclick="finishSession()">Finish &amp; save session</button>
      <button class="ghost" onclick="renderSessionSearch()"><span class="eqicon" style="vertical-align:-3px;margin-right:6px">${ICONS.search}</span>Add one more — search exercises</button>`);
    return;
  }
  const ex = sg.exercise;
  const sup = sg.superset_next;
  render(`
    ${sg.retry ? `<div class="hint">↩ Back to this one — equipment free now?</div>` : ""}
    ${sg.substitute ? `<div class="hint">Substitute for the same body part</div>` : ""}
    <div class="card">
      <div>${partBadge(sg.body_part || ex.bodyPart)}${eqBadge(ex.equipment, "Needs: ")}</div>
      <div class="exname spread">${esc(ex.name)}
        <span class="star" onclick="toggleFavorite()">${sg.favorite ? "★" : "☆"}</span>
      </div>
      ${ex.images.length ? `<div class="demo"><img id="demo-img" src="${ex.images[0]}" alt="demo"><span class="tag">demo</span></div>` : ""}
      <details><summary>How to do it</summary>
        <ol>${ex.instructions.map(i => `<li>${esc(i)}</li>`).join("")}</ol>
      </details>
      ${lastLine(sg)}${bestLine(sg.best)}${noteLine(sg.last)}
      <p class="dim" style="margin:8px 0 0">Target: <strong style="color:var(--text)">${sg.target_sets} × ${sg.target_reps}</strong>${sg.suggested_weight != null ? ` · suggested <strong style="color:var(--accent)">${sg.suggested_weight} kg</strong>` : ""}</p>
    </div>
    ${sup ? `
    <div class="card" style="padding:12px 16px">
      <div class="sup-row"><span class="eqicon" style="color:var(--accent)">${ICONS.link}</span>
        <span>Superset with <strong>${esc(sup.exercise.name)}</strong></span></div>
      <div>${partBadge(sup.exercise.bodyPart)}${eqBadge(sup.exercise.equipment)}
        <span class="badge">${sup.target_sets} × ${sup.target_reps}${sup.suggested_weight != null ? ` · ${sup.suggested_weight} kg` : ""}</span></div>
    </div>` : ""}
    <button class="primary" onclick="acceptSuggestion()">✓ ${sup ? "Do superset" : "Do this"}</button>
    <div class="skiprow">
      <button onclick="skip('same')">Skip<span class="dim" style="display:block;font-size:12px;font-weight:500">same body part</span></button>
      <button onclick="skip('different')">Skip<span class="dim" style="display:block;font-size:12px;font-weight:500">${S.session.mode === "template" ? "this exercise" : "different body part"}</span></button>
    </div>
    <button class="warn" style="text-align:center" onclick="skip('later')"><span class="eqicon" style="vertical-align:-3px;margin-right:6px">${ICONS.clock}</span>Equipment busy — try again later</button>
    <button class="ghost" onclick="renderSessionSearch()"><span class="eqicon" style="vertical-align:-3px;margin-right:6px">${ICONS.search}</span>${S.session.mode === "template" ? "Swap in a different exercise" : "Search for an exercise instead"}</button>`);
  startDemo(ex.images);
}

function lastLine(src) {
  return src.last ? `<p class="dim" style="margin:10px 0 0">Last time (${src.last.date}): ${src.last.sets.map(s => `${s.weight_kg}×${s.reps}`).join(", ")}</p>` : "";
}
function bestLine(best) {
  if (!best) return "";
  const w = best.top_weight, r = best.top_reps;
  return `<p class="bestline">Best: <strong>${w.weight_kg} kg × ${w.reps}</strong> · Most reps: <strong>${r.reps} @ ${r.weight_kg} kg</strong></p>`;
}
function noteLine(last) {
  return last && last.note ? `<p class="noteline">📝 ${esc(last.note)}</p>` : "";
}

/* ---- in-session exercise search ---- */

let sessPartFilter = "";
let sessSearchTimer = null;

function renderSessionSearch() {
  sessionHeader();
  sessPartFilter = S.suggestion && !S.suggestion.done
    ? (S.suggestion.body_part || S.suggestion.exercise.bodyPart || "") : "";
  render(`
    <input type="search" id="sess-search" placeholder="Search exercises…" oninput="sessionSearchExercises()">
    <div id="sess-part-filters">
      ${["", ...S.meta.bodyParts].map(p => `
        <button class="chip ${p === sessPartFilter ? "sel" : ""}" data-sp="${p}"
          onclick="sessPartFilter='${p}';refreshSessChips();sessionSearchExercises()">${p || "All"}</button>`).join("")}
    </div>
    <div id="sess-results"></div>
    <button class="ghost" onclick="renderSession()">← Back to session</button>`);
  sessionSearchExercises();
  document.getElementById("sess-search").focus();
}

function refreshSessChips() {
  document.querySelectorAll("[data-sp]").forEach(b =>
    b.classList.toggle("sel", b.dataset.sp === sessPartFilter));
}

function sessionSearchExercises() {
  clearTimeout(sessSearchTimer);
  sessSearchTimer = setTimeout(async () => {
    const q = document.getElementById("sess-search")?.value || "";
    const res = await api(`/exercises?q=${encodeURIComponent(q)}&body_part=${encodeURIComponent(sessPartFilter)}&limit=25`);
    const el = document.getElementById("sess-results");
    if (!el) return;
    el.innerHTML = res.map(ex => `
      <div class="list-item">
        <div class="spread">
          <span>
            <strong>${esc(ex.name)}</strong><br>
            <span style="display:inline-block;margin-top:6px">${partBadge(ex.bodyPart)}${eqBadge(ex.equipment)}</span>
          </span>
          <button class="small primary" onclick='sessionPick(${JSON.stringify(ex.id)})'>Do this</button>
        </div>
      </div>`).join("") || `<p class="dim">No matches.</p>`;
  }, 250);
}

async function sessionPick(exerciseId) {
  const sg = S.suggestion;
  // A searched pick claims the current template item (a user-chosen swap),
  // unless the on-screen suggestion was a deferred retry — that one stays owed.
  const itemId = sg && !sg.done && !sg.retry ? (sg.template_item_id || null) : null;
  const targetSets = sg && !sg.done ? sg.target_sets : 3;
  const targetReps = sg && !sg.done ? sg.target_reps : 8;
  const [r, ex] = await Promise.all([
    api(`/sessions/${S.session.id}/accept`, {
      body: { exercise_id: exerciseId, template_item_id: itemId, retry_se_id: null,
              target_sets: targetSets, target_reps: targetReps },
    }),
    api(`/exercises/${exerciseId}`),
  ]);
  wuOn = false; tfOn = false;
  S.se = makeSe({
    exercise: ex, target_sets: targetSets, target_reps: targetReps,
    suggested_weight: r.suggested_weight, bodyweight: r.bodyweight,
    last: r.last, best: r.best, favorite: r.favorite,
  }, r.session_exercise_id);
  S.sup = null;
  S.suggestion = null;
  renderSession();
}

async function toggleFavorite() {
  const target = S.sup ? S.sup.items[S.sup.turn] : (S.se || S.suggestion);
  const r = await api("/favorites/toggle", { body: { profile_id: S.profile.id, exercise_id: target.exercise.id } });
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

function makeSe(src, seId) {
  return {
    id: seId, exercise: src.exercise,
    target_sets: src.target_sets, target_reps: src.target_reps,
    sets: [], suggested: src.suggested_weight,
    bodyweight: src.bodyweight, last: src.last, best: src.best,
    favorite: src.favorite, note: (src.last && src.last.note) || "",
    lastPr: null,
  };
}

let wuOn = false, tfOn = false;  // warm-up / to-failure toggles for the next set

async function acceptOne(src) {
  const r = await api(`/sessions/${S.session.id}/accept`, {
    body: {
      exercise_id: src.exercise.id,
      template_item_id: src.template_item_id || null,
      retry_se_id: src.retry_se_id || null,
      target_sets: src.target_sets, target_reps: src.target_reps,
    },
  });
  return makeSe(src, r.session_exercise_id);
}

async function acceptSuggestion() {
  const sg = S.suggestion;
  wuOn = false; tfOn = false;
  if (sg.superset_next) {
    const a = await acceptOne(sg);
    const b = await acceptOne(sg.superset_next);
    S.sup = { items: [a, b], turn: 0 };
    S.se = null;
  } else {
    S.se = await acceptOne(sg);
    S.sup = null;
  }
  S.suggestion = null;
  renderSession();
}

function weightStep() {
  const eq = S.se?.exercise?.equipment;
  return (eq === "dumbbell" || eq === "kettlebells") ? 2 : 2.5;
}
function bump(id, d) {
  const el = document.getElementById(id);
  el.value = Math.max(0, Math.round((parseFloat(el.value || 0) + d) * 10) / 10);
}

function setRowHtml(s, i, ab) {
  return `<div class="setrow">
    <span class="row"><span class="n">${i + 1}</span>${ab ? `<span class="ab ${ab}">${ab.toUpperCase()}</span>` : ""}</span>
    <span><strong>${s.weight_kg} kg × ${s.reps}</strong>${s.is_warmup ? '<span class="mark w">W</span>' : ""}${s.to_failure ? '<span class="mark f">F</span>' : ""}${s.pr ? '<span class="mark pr">🏆</span>' : ""}${s.queued ? '<span class="mark q">⏳</span>' : ""}</span>
  </div>`;
}

function prBanner(se) {
  if (se.lastPr === "weight") return `<div class="pr-banner">🏆 New weight PR!</div>`;
  if (se.lastPr === "reps") return `<div class="pr-banner">🏆 New rep PR at this weight!</div>`;
  return "";
}

function hintFor(se) {
  return se.bodyweight
    ? `<div class="hint">${eqIcon("body only")} Bodyweight exercise — log added weight (0 if none).${bestLine(se.best)}</div>`
    : se.suggested != null
      ? `<div class="hint">Suggested: <strong>${se.suggested} kg</strong>${se.last && se.last.progressed ? " — you hit all your targets last time, moving up 💪" : se.last ? " (same as last time)" : ""}${bestLine(se.best)}</div>`
      : `<div class="hint">First time on this exercise — pick a comfortable weight; next time it's remembered.</div>`;
}

let keepW = null, keepR = null;
function toggleFlag(which) {
  keepW = document.getElementById("w")?.value ?? null;
  keepR = document.getElementById("r")?.value ?? null;
  if (which === "wu") wuOn = !wuOn; else tfOn = !tfOn;
  renderSession();
}

function flagChips() {
  return `<div style="margin-bottom:10px">
    <button class="chip mini ${wuOn ? "sel" : ""}" onclick="toggleFlag('wu')">Warm-up</button>
    <button class="chip mini ${tfOn ? "sel" : ""}" onclick="toggleFlag('tf')">To failure</button>
  </div>`;
}

function loggerControls(se, logFn) {
  let prefill = se.sets.length ? se.sets[se.sets.length - 1].weight_kg : (se.suggested ?? (se.bodyweight ? 0 : ""));
  let reps = se.target_reps;
  if (keepW !== null) { prefill = keepW; keepW = null; }
  if (keepR !== null) { reps = keepR; keepR = null; }
  return `
      ${flagChips()}
      <div class="logbar">
        <div>
          <div class="stepper">
            <button onclick="bump('w', -weightStep())">−</button>
            <input type="number" id="w" step="0.5" value="${prefill}">
            <button onclick="bump('w', weightStep())">+</button>
          </div>
          <div class="steplabel">kg</div>
        </div>
        <div>
          <div class="stepper">
            <button onclick="bump('r', -1)">−</button>
            <input type="number" id="r" value="${reps}">
            <button onclick="bump('r', 1)">+</button>
          </div>
          <div class="steplabel">reps</div>
        </div>
      </div>
      <button class="primary" style="margin:14px 0 0" onclick="${logFn}()">Log set ${se.sets.length + 1}${wuOn ? " (warm-up)" : ""}</button>`;
}

function renderLogging() {
  const se = S.se, ex = se.exercise;
  render(`
    ${prBanner(se)}
    <div class="card">
      <div class="exname spread" style="font-size:21px;margin-top:0">${esc(ex.name)}
        <span class="star" onclick="toggleFavorite()">${se.favorite ? "★" : "☆"}</span>
      </div>
      <div>${eqBadge(ex.equipment)}<span class="badge">Target ${se.target_sets} × ${se.target_reps}</span></div>
      ${ex.images.length ? `<details><summary>Show demo</summary>
        <div class="demo" style="margin-top:8px"><img id="demo-img" src="${ex.images[0]}" alt="demo"></div></details>` : ""}
    </div>
    ${hintFor(se)}
    <div class="card">
      <div id="sets-done">${se.sets.map((s, i) => setRowHtml(s, i)).join("")}</div>
      ${loggerControls(se, "logSet")}
    </div>
    <input type="text" id="exnote" placeholder="Note for next time (e.g. seat position 4)"
      value="${esc(se.note)}" oninput="S.se.note=this.value">
    <button onclick="finishExercise()" style="text-align:center">Done — next exercise →</button>`);
  startDemo(ex.images);
}

/* log one set to a given exercise; queues locally when offline */
async function logSetTo(se) {
  const w = parseFloat(document.getElementById("w").value);
  const reps = parseInt(document.getElementById("r").value, 10);
  if (isNaN(w) || isNaN(reps) || reps <= 0) return false;
  const body = { weight_kg: w, reps, is_warmup: wuOn, to_failure: tfOn };
  const entry = { ...body };
  se.lastPr = null;
  try {
    const r = await api(`/session_exercises/${se.id}/sets`, { body });
    entry.pr = r.pr_weight || r.pr_reps;
    se.lastPr = r.pr_weight ? "weight" : (r.pr_reps ? "reps" : null);
  } catch (e) {
    if (!e.network) throw e;
    const q = setQueue(); q.push({ seId: se.id, body }); saveSetQueue(q);
    entry.queued = true;
  }
  se.sets.push(entry);
  tfOn = false;
  return true;
}

async function logSet() { if (await logSetTo(S.se)) renderLogging(); }

async function saveExerciseNote(se) {
  const note = (se.note || "").trim();
  if (!note) return;
  try { await api(`/session_exercises/${se.id}/note`, { method: "PUT", body: { note } }); } catch {}
}

async function finishExercise() {
  if (S.se.sets.length === 0 && !confirm("No sets logged — mark as skipped?")) return;
  if (setQueue().length && !(await flushSetQueue())) {
    alert("You're offline — sets are queued locally. Reconnect to move on.");
    return;
  }
  await saveExerciseNote(S.se);
  if (S.se.sets.some(s => !s.is_warmup)) S.session.done++;
  const r = await api(`/session_exercises/${S.se.id}/finish`, { method: "POST" });
  S.se = null;
  S.suggestion = r.suggestion;
  renderSession();
}

/* ---- superset logging ---- */

function renderSupersetLogging() {
  const sup = S.sup;
  const cur = sup.items[sup.turn];
  const ex = cur.exercise;
  render(`
    ${prBanner(sup.items[1 - sup.turn]) || prBanner(cur)}
    <div class="card">
      <div class="sup-row"><span class="eqicon" style="color:var(--accent)">${ICONS.link}</span><strong>Superset</strong></div>
      ${sup.items.map((it, i) => `
        <div class="sup-row ${i === sup.turn ? "" : "off"}">
          <span class="ab ${i === 0 ? "a" : "b"}">${i === 0 ? "A" : "B"}</span>
          <span class="grow">${esc(it.exercise.name)}</span>
          ${i === sup.turn ? `<span class="star" onclick="toggleFavorite()">${it.favorite ? "★" : "☆"}</span>` : ""}
        </div>`).join("")}
      <div style="margin-top:6px">${eqBadge(ex.equipment)}<span class="badge">Target ${cur.target_sets} × ${cur.target_reps}</span></div>
      ${ex.images.length ? `<details><summary>Show demo (${esc(ex.name)})</summary>
        <div class="demo" style="margin-top:8px"><img id="demo-img" src="${ex.images[0]}" alt="demo"></div></details>` : ""}
    </div>
    ${hintFor(cur)}
    <div class="card">
      ${sup.items.map((it, i) =>
        it.sets.map((s, j) => setRowHtml(s, j, i === 0 ? "a" : "b")).join("")).join("")}
      ${loggerControls(cur, "logSupersetSet")}
    </div>
    <button onclick="finishSuperset()" style="text-align:center">Done with both — next →</button>`);
  startDemo(ex.images);
}

async function logSupersetSet() {
  if (await logSetTo(S.sup.items[S.sup.turn])) {
    S.sup.items[1 - S.sup.turn].lastPr = null;
    S.sup.turn = 1 - S.sup.turn;
    renderSupersetLogging();
  }
}

async function finishSuperset() {
  const total = S.sup.items[0].sets.length + S.sup.items[1].sets.length;
  if (total === 0 && !confirm("No sets logged — mark both as skipped?")) return;
  if (setQueue().length && !(await flushSetQueue())) {
    alert("You're offline — sets are queued locally. Reconnect to move on.");
    return;
  }
  let last = null;
  for (const it of S.sup.items) {
    await saveExerciseNote(it);
    if (it.sets.some(s => !s.is_warmup)) S.session.done++;
    last = await api(`/session_exercises/${it.id}/finish`, { method: "POST" });
  }
  S.sup = null;
  S.suggestion = last.suggestion;
  renderSession();
}

async function finishSession() {
  await flushSetQueue().catch(() => {});
  const open = S.sup ? S.sup.items : (S.se ? [S.se] : []);
  for (const it of open) {
    if (it.sets.length > 0) {
      await saveExerciseNote(it);
      await api(`/session_exercises/${it.id}/finish`, { method: "POST" });
      if (it.sets.some(s => !s.is_warmup)) S.session.done++;
    }
  }
  const noteEl = document.getElementById("sess-note");
  if (noteEl && noteEl.value.trim()) {
    try { await api(`/sessions/${S.session.id}/note`, { method: "PUT", body: { note: noteEl.value } }); } catch {}
  }
  await api(`/sessions/${S.session.id}/finish`, { method: "POST" });
  localStorage.removeItem("activeSession");
  S.session = null; S.se = null; S.sup = null; S.suggestion = null;
  go("history");
}

/* ------------------------------------------------ history */

async function renderHistory() {
  const sessions = await api(`/sessions?profile_id=${S.profile.id}`);
  render(`
    ${sessions.length === 0 ? `<p class="dim topnote">No sessions yet.</p>` : ""}
    ${sessions.map(s => {
      const done = s.exercises.filter(e => e.status === "done");
      const label = s.mode === "template" ? "Workout" : (s.focus === "full body" ? "Full body" : s.focus);
      return `
      <div class="list-item">
        <div class="spread" onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden">
          <span><strong>${s.started_at.slice(0, 10)}</strong> <span class="dim">· ${esc(label || "")}${s.gym ? ` · ${esc(s.gym)}` : ""}</span></span>
          <span class="dim">${done.length} exercises ›</span>
        </div>
        <div hidden style="margin-top:8px">
          ${s.note ? `<p class="noteline" style="margin:0 0 8px">📝 ${esc(s.note)}</p>` : ""}
          ${s.exercises.map(e => e.status === "done"
            ? `<div class="setrow" style="cursor:pointer" onclick="go('exercise-detail','${e.exercise_id}')">
                 <span>${esc(e.name)}${e.note ? ` <span class="dim">📝</span>` : ""}</span>
                 <strong>${e.sets.map(x => `${x.is_warmup ? "w·" : ""}${x.weight_kg}×${x.reps}`).join(", ")}</strong></div>`
            : `<div class="setrow"><span class="muted-strike">${esc(e.name)}</span><span class="dim">skipped</span></div>`).join("")}
          <div class="row" style="margin-top:12px">
            ${done.length ? `<button class="small" onclick="saveAsWorkout(${s.id})">Save as workout</button>` : ""}
            <button class="danger-ghost small" onclick="deleteSession(${s.id})">Delete</button>
          </div>
        </div>
      </div>`;
    }).join("")}
    <button class="ghost" onclick="go('home')">Back</button>`);
}

async function saveAsWorkout(sessionId) {
  const name = prompt("Name for this workout:");
  if (!name || !name.trim()) return;
  await api(`/sessions/${sessionId}/save_template`, { body: { name: name.trim() } });
  alert(`Saved — “${name.trim()}” is now under My workouts.`);
}

/* ------------------------------------------------ progress */

async function renderProgress() {
  const items = await api(`/progress?profile_id=${S.profile.id}`);
  render(`
    ${items.length === 0 ? `<p class="dim topnote">Log some sessions and your per-exercise progress shows up here.</p>` : `<p class="dim topnote">Tap an exercise for its chart and bests.</p>`}
    ${items.map(it => `
      <div class="list-item">
        <div class="spread" onclick="go('exercise-detail','${it.exercise_id}')">
          <span>
            <strong>${esc(it.name)}</strong><br>
            <span style="display:inline-block;margin-top:6px">${partBadge(it.bodyPart)}${eqBadge(it.equipment)}</span>
          </span>
          <span class="dim" style="text-align:right;flex:none">${it.top_weight} kg top<br>${it.sessions} session${it.sessions === 1 ? "" : "s"} ›</span>
        </div>
      </div>`).join("")}
    <button class="ghost" onclick="go('home')">Back</button>`);
}

function chartSVG(points) {
  // points: chronological [{label, y}]
  if (points.length < 2) return `<p class="dim">Two or more sessions needed for a chart.</p>`;
  const W = 340, H = 150, L = 34, R = 10, T = 14, B = 24;
  const ys = points.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 2.5; hi += 2.5; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const px = (i) => L + (i / (points.length - 1)) * (W - L - R);
  const py = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = points.map((p, i) => `${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}">
    <line x1="${L}" y1="${py(hi - pad)}" x2="${W - R}" y2="${py(hi - pad)}" stroke="#243040" stroke-dasharray="3 4"/>
    <line x1="${L}" y1="${py(lo + pad)}" x2="${W - R}" y2="${py(lo + pad)}" stroke="#243040" stroke-dasharray="3 4"/>
    <text x="2" y="${py(hi - pad) + 4}" fill="#8fa1b3" font-size="10">${Math.round((hi - pad) * 10) / 10}</text>
    <text x="2" y="${py(lo + pad) + 4}" fill="#8fa1b3" font-size="10">${Math.round((lo + pad) * 10) / 10}</text>
    <polyline points="${pts}" fill="none" stroke="#3ddc84" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.y)}" r="3.2" fill="#0b0f14" stroke="#3ddc84" stroke-width="2"/>`).join("")}
    <text x="${L}" y="${H - 6}" fill="#8fa1b3" font-size="10">${points[0].label}</text>
    <text x="${W - R}" y="${H - 6}" fill="#8fa1b3" font-size="10" text-anchor="end">${points[points.length - 1].label}</text>
  </svg></div>`;
}

async function renderExerciseDetail(exerciseId) {
  const [ex, hist] = await Promise.all([
    api(`/exercises/${exerciseId}`),
    api(`/history/${exerciseId}?profile_id=${S.profile.id}`),
  ]);
  const entries = hist.slice().reverse()  // chronological
    .map(h => ({ ...h, work: h.sets.filter(s => !s.is_warmup) }))
    .filter(h => h.work.length);
  const points = entries.map(h => ({ label: h.date.slice(5), y: Math.max(...h.work.map(s => s.weight_kg)) }));
  const all = entries.flatMap(h => h.work);
  let best = "";
  if (all.length) {
    const tw = all.reduce((a, b) => (b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps)) ? b : a);
    const tr = all.reduce((a, b) => (b.reps > a.reps || (b.reps === a.reps && b.weight_kg > a.weight_kg)) ? b : a);
    best = bestLine({ top_weight: { weight_kg: tw.weight_kg, reps: tw.reps }, top_reps: { reps: tr.reps, weight_kg: tr.weight_kg } });
  }
  render(`
    <div class="card">
      <div>${partBadge(ex.bodyPart)}${eqBadge(ex.equipment)}</div>
      <div class="exname" style="font-size:21px">${esc(ex.name)}</div>
      ${chartSVG(points)}
      ${best}
    </div>
    ${hist.map(h => `
      <div class="setrow"><span class="dim">${h.date}</span>
        <strong>${h.sets.map(x => `${x.is_warmup ? "w·" : ""}${x.weight_kg}×${x.reps}`).join(", ")}</strong></div>`).join("")}
    <button class="ghost" style="margin-top:14px" onclick="go('progress')">Back</button>`);
}

async function deleteSession(id) {
  if (!confirm("Delete this session and all its logged sets?")) return;
  await api(`/sessions/${id}`, { method: "DELETE" });
  renderHistory();
}

/* ------------------------------------------------ boot */

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
flushSetQueue().catch(() => {});
go(S.profile ? "home" : "profile");
