 // TODO: set this to your real deployed backend URL
const API = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "http://127.0.0.1:8000"
  : "https://nexusproj-1.onrender.com";
 const SECTIONS = ["Possible Bias", "Potential Contradiction", "Hidden Assumption", "Alternative Perspective", "Reflection Prompt", "Blind Spot", "Reframe"];

const state = {
  token: localStorage.getItem("nexus-token"),
  user: null,
  depth: localStorage.getItem("nexus-depth") || "balanced",
  theme: localStorage.getItem("nexus-theme") || "light",
  authMode: "login",
  lastReflection: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function showToast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------------------------------------------------------
   API HELPER
--------------------------------------------------------- */
function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(API + path, { ...options, headers });
  } catch (err) {
    throw new Error("Can't reach the NEXUS server. Is the backend running on port 8000?");
  }
  let data = {};
  try { data = await res.json(); } catch { }
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/register") {
      throw new Error("Your session has expired. Please log in again.");
}
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return data;
}

/* ---------------------------------------------------------
   MODALS
--------------------------------------------------------- */
function openModal(id) { $("#" + id).classList.add("open"); }
function closeModal(id) { $("#" + id).classList.remove("open"); }
$$("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
$$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); }));

/* ---------------------------------------------------------
   THEME (applies to the reflection app only)
--------------------------------------------------------- */
function applyTheme(theme) {
  state.theme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem("nexus-theme", theme);
  $("#themeBtn").textContent = theme === "dark" ? "☾" : "◐";
}
applyTheme(state.theme);

/* ---------------------------------------------------------
   DEPTH
--------------------------------------------------------- */
function applyDepth(depth) {
  state.depth = depth;
  localStorage.setItem("nexus-depth", depth);
  $$(".depth-switch button").forEach(b => b.classList.toggle("active", b.dataset.depth === depth));
  $$("#settingsDepth button").forEach(b => b.classList.toggle("active", b.dataset.depth === depth));
}
applyDepth(state.depth);
$$(".depth-switch button").forEach(b => b.addEventListener("click", () => applyDepth(b.dataset.depth)));
$$("#settingsDepth button").forEach(b => b.addEventListener("click", () => applyDepth(b.dataset.depth)));

/* ---------------------------------------------------------
   NAVIGATION: landing <-> app, and app sub-views
--------------------------------------------------------- */
function enterApp() {
  if (!state.token) { openAuth("login"); return; }
  $("#landingPage").classList.add("hidden");
  $("#reflectionApp").classList.remove("hidden");
  showAppView("reflect");
  const dateInput = $("#reflectionDate"), timeInput = $("#reflectionTime");
  if (dateInput && !dateInput.value) {
    const now = new Date();
    dateInput.value = now.toISOString().slice(0, 10);
    timeInput.value = now.toTimeString().slice(0, 5);
  }
}
function goHome() {
  $("#reflectionApp").classList.add("hidden");
  $("#landingPage").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showAppView(view) {
  $$(".app-view").forEach(v => v.classList.toggle("active", v.id === `${view}View`));
  $$(".app-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "history") loadHistory();
  if (view === "insights") loadInsights();
}

$("#landingStartBtn")?.addEventListener("click", enterApp);
$("#parallaxStartBtn")?.addEventListener("click", enterApp);
$("#finalStartBtn")?.addEventListener("click", enterApp);
$("#enterNexusBtn")?.addEventListener("click", enterApp);
$("#landingLoginBtn")?.addEventListener("click", () => openAuth("login"));
$("#appHomeBtn")?.addEventListener("click", goHome);
$$(".app-nav-btn").forEach(b => b.addEventListener("click", () => showAppView(b.dataset.view)));
$$("[data-scroll-to]").forEach(b => b.addEventListener("click", () => {
  document.querySelector(b.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth" });
}));
$("#screenCta0")?.addEventListener("click", enterApp);

/* ---------------------------------------------------------
   AUTH
--------------------------------------------------------- */
function updateAuthUI() {
  $("#authBtn").textContent = state.token ? (state.user?.name || "Account") : "Log in";
}
$("#authBtn").addEventListener("click", () => {
  if (!state.token) openAuth("login");
  else openModal("settingsModal");
});

function openAuth(mode) {
  state.authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "Welcome back." : "Create your account";
  $("#authSubtitle").textContent = mode === "login" ? "Continue your reflection journey." : "Save reflections and discover your patterns over time.";
  $("#nameField").classList.toggle("hidden", mode === "login");
  $("#authSubmitText").textContent = mode === "login" ? "Log in" : "Create account";
  $("#authModeToggle").textContent = mode === "login" ? "Create an account" : "I already have an account";
  $("#authError").textContent = "";
  $("#authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  openModal("authModal");
}
$("#authModeToggle").addEventListener("click", () => openAuth(state.authMode === "login" ? "register" : "login"));

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#authError").textContent = "";
  const mode = state.authMode;
  const body = { email: $("#authEmail").value.trim(), password: $("#authPassword").value };
  if (mode === "register") body.name = $("#authName").value.trim();
  try {
    const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("nexus-token", state.token);
    applyDepth(state.user.default_depth || "balanced");
    closeModal("authModal");
    updateAuthUI();
    showToast(mode === "login" ? "Welcome back." : "Your NEXUS account is ready.");
    enterApp();
    $("#authForm").reset();
  } catch (err) {
    $("#authError").textContent = err.message;
  }
});

async function restoreSession() {
  if (!state.token) { updateAuthUI(); return; }
  try {
    const data = await api("/auth/me");
    state.user = data.user;
    applyDepth(state.user.default_depth || state.depth);
    enterApp();
  } catch {
    state.token = null;
    localStorage.removeItem("nexus-token");
  }
  updateAuthUI();
}
restoreSession();

function logout(show = true) {
  state.token = null; state.user = null;
  state.lastReflection = null;
  localStorage.removeItem("nexus-token");
  $("#reflectionInput").value = "";
  $("#characterCount").textContent = "0 / 10000";
  $("#responseArea").innerHTML = "";
  updateAuthUI();
  closeModal("settingsModal");
  goHome();
  if (show) showToast("Logged out.");
}
$("#logoutBtn").addEventListener("click", () => logout(true));

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */
$("#settingsBtn").addEventListener("click", async () => {
  if (!state.token) { openAuth("login"); return; }
  try {
    const s = await api("/settings");
    applyDepth(s.default_depth);
  } catch { }
  openModal("settingsModal");
});
$("#themeBtn").addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));

$("#saveSettings").addEventListener("click", async () => {
  if (!state.token) return;
  try {
    await api("/settings", { method: "PUT", body: JSON.stringify({ default_depth: state.depth, theme: state.theme }) });
    closeModal("settingsModal");
    showToast("Preferences saved.");
  } catch (err) { showToast(err.message); }
});

/* ---------------------------------------------------------
   REFLECT
--------------------------------------------------------- */
$("#reflectionInput").addEventListener("input", () => {
  $("#characterCount").textContent = `${$("#reflectionInput").value.length} / 10000`;
});

function renderCards(result) {
  return `<div class="reflection-grid">${SECTIONS.map((key, i) => result[key] ? `
    <article class="reflection-card" style="animation-delay:${i * 90}ms">
      <div class="card-index">0${i + 1}</div>
      <div class="card-title">${escapeHtml(key)}</div>
      <div class="card-content">${escapeHtml(result[key])}</div>
    </article>` : "").join("")}</div>`;
}
function extractJSON(text) {
  let cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch { }
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { } }
  return null;
}

async function streamReflection(prompt) {
  if (!state.token) { openAuth("login"); return; }
  const area = $("#responseArea");
  const btn = $("#reflectBtn");
  btn.disabled = true;
  btn.innerHTML = "<span>Reflecting...</span><span>…</span>";
  area.innerHTML = `<div class="response-container"><div class="loading">Examining the thought <span class="dots"><i></i><i></i><i></i></span></div></div>`;
  let text = "";
  try {
    const res = await fetch(API + "/reflect", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt, depth: state.depth })
    });
    if (!res.ok) {
      let d = {}; try { d = await res.json(); } catch { }
      throw new Error(d.detail || `Reflection failed (${res.status})`);
    }
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        if (data.startsWith("[ERROR]")) throw new Error(data.slice(8));
        text += data.replace(/\\n/g, "\n");
        const partial = extractJSON(text);
        if (partial) area.innerHTML = `<div class="response-container">${renderCards(partial)}</div>`;
      }
    }
    const result = extractJSON(text);
    if (!result) throw new Error("The AI response wasn't valid reflection JSON. Please try again.");

    const date = $("#reflectionDate").value, time = $("#reflectionTime").value;
    const thoughtAt = (date && time) ? `${date}T${time}` : null;
    state.lastReflection = { prompt, depth: state.depth, result, thought_at: thoughtAt };

    area.innerHTML = `<div class="response-container">${renderCards(result)}
      <div class="reflection-actions">
        <button class="secondary-btn" id="copyBtn">Copy reflection</button>
        <button class="primary-btn" id="saveReflectionBtn"><span>Save reflection</span><span>→</span></button>
      </div></div>`;
    $("#copyBtn").addEventListener("click", async () => {
      const txt = SECTIONS.map(k => `${k}\n${result[k] || ""}`).join("\n\n");
      await navigator.clipboard.writeText(txt);
      showToast("Reflection copied.");
    });
    $("#saveReflectionBtn").addEventListener("click", saveCurrentReflection);
  } catch (err) {
    area.innerHTML = `<div class="response-container"><div class="empty">${escapeHtml(err.message)}</div></div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = "<span>Reflect</span><span>↗</span>";
  }
}
$("#reflectBtn").addEventListener("click", () => {
  const prompt = $("#reflectionInput").value.trim();
  if (prompt) streamReflection(prompt);
  else showToast("Write something first.");
});
$("#reflectionInput").addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("#reflectBtn").click(); });

async function saveCurrentReflection() {
  if (!state.lastReflection) return;

  const saveBtn = $("#saveReflectionBtn");
  if (!saveBtn || saveBtn.disabled) return;

  saveBtn.disabled = true;
  saveBtn.innerHTML = "<span>Saving...</span><span>…</span>";

  try {
    await api("/reflections", {
      method: "POST",
      body: JSON.stringify(state.lastReflection)
    });

    saveBtn.innerHTML = "<span>Saved</span><span>✓</span>";
    showToast("Reflection saved to your history.");
  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = "<span>Save reflection</span><span>→</span>";
    showToast(err.message);
  }
}

/* ---------------------------------------------------------
   HISTORY
--------------------------------------------------------- */
async function loadHistory() {
  const area = $("#historyList");
  area.innerHTML = '<div class="empty">Loading your reflections…</div>';
  try {
    const rows = await api("/reflections");
    if (!rows.length) {
  area.innerHTML = `
    <div class="history-empty">
      <div class="history-empty-icon" aria-hidden="true">✎</div>
      <h3>Your reflections will live here</h3>
      <p>You haven't saved a reflection yet. Start one and it'll show up in My Reflections.</p>
      <button class="primary-btn" id="historyEmptyCta"><span>Start reflecting</span><span>→</span></button>
    </div>
  `;
  $("#historyEmptyCta")?.addEventListener("click", () => showAppView("reflect"));
  return;
}
    area.innerHTML = rows.map(r => `
      <article class="history-card" data-id="${r.id}">
        <div class="history-date">${r.thought_at ? new Date(r.thought_at).toLocaleString() : new Date(r.created_at).toLocaleString()}</div>
        <div class="history-title">${escapeHtml(r.prompt.slice(0, 150))}${r.prompt.length > 150 ? "…" : ""}</div>
        <div class="history-meta"><span>${escapeHtml(r.depth)}</span><span>View →</span></div>
        <button class="history-delete" data-delete="${r.id}">Delete</button>
      </article>`).join("");
    $$(".history-card").forEach(card => card.addEventListener("click", e => {
      if (e.target.matches("[data-delete]")) return;
      openSavedReflection(card.dataset.id);
    }));
    $$("[data-delete]").forEach(b => b.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Delete this reflection?")) return;
      try { await api(`/reflections/${b.dataset.delete}`, { method: "DELETE" }); loadHistory(); showToast("Reflection deleted."); }
      catch (err) { showToast(err.message); }
    }));
  } catch (err) { area.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`; }
}

async function openSavedReflection(id) {
  try {
    const r = await api(`/reflections/${id}`);
    $("#savedReflectionMeta").textContent = `${r.depth.toUpperCase()} · ${r.thought_at ? new Date(r.thought_at).toLocaleString() : new Date(r.created_at).toLocaleString()}`;
    $("#savedReflectionTitle").textContent = r.prompt.slice(0, 90) + (r.prompt.length > 90 ? "…" : "");
    $("#savedReflectionContent").innerHTML = renderCards(r.result);
    openModal("reflectionModal");
  } catch (err) { showToast(err.message); }
}

/* ---------------------------------------------------------
   INSIGHTS
--------------------------------------------------------- */
 async function loadInsights() {
  const area = $("#insightsArea");

  area.innerHTML = `
    <div class="insights-loading">
      <div class="empty">Reading your patterns…</div>
    </div>
  `;

  try {
    const d = await api("/insights");

    const total = d.total_reflections || 0;
    const depths = d.depth_counts || {};
    const dimensionsData = d.dimension_counts || {};
    const activity = Object.fromEntries((d.timeline || []).map(e => [e.date, e.count]));

    const dimensions = Object.entries(dimensionsData)
      .sort((a, b) => b[1] - a[1]);

    const maxDimension = Math.max(
      1,
      ...dimensions.map(([, value]) => value)
    );

    const totalExplorations = dimensions.reduce(
      (sum, [, value]) => sum + value,
      0
    );

    const topDimension =
      dimensions[0]?.[0] || "None yet";

    const topDimensionCount =
      dimensions[0]?.[1] || 0;

    const secondDimension =
      dimensions[1]?.[0] || "—";

    const deep = depths.deep || 0;
    const balanced = depths.balanced || 0;
    const gentle = depths.gentle || 0;

    /*
     * Reflection style
     */
    let reflectionStyle = "Just beginning";

    if (total > 0) {
      const highestDepth = Math.max(
        gentle,
        balanced,
        deep
      );

      if (highestDepth === deep) {
        reflectionStyle = "Deep";
      } else if (highestDepth === balanced) {
        reflectionStyle = "Balanced";
      } else {
        reflectionStyle = "Gentle";
      }
    }

    /*
     * Last 14 days
     */
    const days = [];

    for (let i = 13; i >= 0; i--) {
      const date = new Date();

      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const key =
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0");

      days.push({
        key,
        shortDay: date.toLocaleDateString(undefined, {
          weekday: "short"
        }).slice(0, 2),
        dateLabel: date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        }),
        count: activity[key] || 0
      });
    }

    const activeDays = days.filter(
      day => day.count > 0
    ).length;

    /*
     * Small interpretation based ONLY on stored data.
     */
    let signatureText =
      "Your reflection journey is just beginning.";

    if (total === 1) {
      signatureText =
        `Your first reflection is on record. Keep exploring ${topDimension.toLowerCase()} and other dimensions to reveal more of your thinking patterns.`;
    } else if (total > 1) {
      signatureText =
        `You return most often to ${topDimension.toLowerCase()}, with ${secondDimension.toLowerCase()} also appearing in your reflections.`;
    }

    area.innerHTML = `
      <div class="insights-dashboard">

        <!-- =====================================================
             STATS
        ====================================================== -->

        <section class="insight-stats">

          <div class="insight-stat">
            <div class="insight-stat-value">
              ${String(total).padStart(2, "0")}
            </div>

            <div class="insight-stat-label">
              REFLECTIONS
            </div>
          </div>


          <div class="insight-stat">
            <div class="insight-stat-value">
              ${String(deep).padStart(2, "0")}
            </div>

            <div class="insight-stat-label">
              DEEP
            </div>
          </div>


          <div class="insight-stat">
            <div class="insight-stat-value">
              ${String(topDimensionCount).padStart(2, "0")}
            </div>

            <div class="insight-stat-label">
              MOST EXPLORED
            </div>

            <div class="insight-stat-sub">
              ${escapeHtml(topDimension)}
            </div>
          </div>

        </section>


        <!-- =====================================================
             ACTIVITY
        ====================================================== -->

        <section class="insight-panel activity-panel">

          <div class="panel-header">

            <div>
              <div class="eyebrow">
                RECENT ACTIVITY
              </div>

              <h3>
                 <span class="insight-heading-icon" aria-hidden="true">◷</span>
                   Your reflection rhythm
              </h3>

              <p>
                ${activeDays === 0
                  ? "Your recent reflection activity will appear here."
                  : `${activeDays} of the last 14 days included a reflection.`}
              </p>
            </div>

            <div class="activity-period">
              14 DAYS
            </div>

          </div>


          <div class="activity-grid">

            ${days.map(day => {

              const intensity =
                day.count === 0
                  ? ""
                  : day.count === 1
                    ? "is-low"
                    : day.count === 2
                      ? "is-medium"
                      : "is-high";

              return `
                <div
                  class="activity-day ${intensity}"
                  title="${day.dateLabel}: ${day.count} reflection${day.count === 1 ? "" : "s"}"
                >

                  <div class="activity-cell">
                    ${day.count > 0
                      ? `<span>${day.count}</span>`
                      : ""}
                  </div>

                  <div class="activity-label">
                    ${day.shortDay}
                  </div>

                </div>
              `;

            }).join("")}

          </div>

        </section>


        <!-- =====================================================
             THINKING PROFILE
        ====================================================== -->

        <section class="insight-panel profile-panel">

          <div class="panel-header profile-header">

            <div>
              <div class="eyebrow">
                DIMENSIONS EXPLORED
              </div>

              <h3>
                <span class="insight-heading-icon" aria-hidden="true">◈</span>
                  Your thinking profile
              </h3>

              <p>
                The areas your reflections have explored most often.
              </p>
            </div>

            <div class="profile-total">
              <strong>${totalExplorations}</strong>
              <span>explorations</span>
            </div>

          </div>

                    <div class="dimension-cards">

            ${(() => {
              const visibleDimensions = dimensions.filter(([, value]) => value > 0);

              if (!visibleDimensions.length) {
                return `
                  <div class="dimension-empty">
                    <div class="history-empty-icon" aria-hidden="true">◈</div>
                    <h3>Your thinking profile is just beginning.</h3>
                    <p>As you reflect, NEXUS will start showing which patterns appear most often.</p>
                  </div>
                `;
              }

              return visibleDimensions.map(([key, value], index) => {

                const percentage =
                  (value / maxDimension) * 100;
                const isTop = index === 0;

                return `
                  <div class="dimension-card${isTop ? " dimension-card--top" : ""}">

                    <div class="dimension-card-top">

                      <span class="dimension-index">
                        ${String(index + 1).padStart(2, "0")}
                      </span>

                      <strong>
                        ${String(value).padStart(2, "0")}
                      </strong>

                    </div>

                    <div class="dimension-card-name">
                      ${escapeHtml(key)}
                    </div>

                    <div class="dimension-mini-track">
                      <div
                        class="dimension-mini-fill"
                        style="width:${percentage}%"
                      ></div>
                    </div>

                  </div>
                `;

              }).join("");
            })()}

          </div>
        </section>


        <!-- =====================================================
             THINKING SIGNATURE
        ====================================================== -->

        <section class="signature-panel">

          <div class="signature-left">

            <div class="eyebrow">
              YOUR THINKING SIGNATURE
            </div>

            <h3>
              ${escapeHtml(signatureText)}
            </h3>

          </div>


          <div class="signature-meta">

            <div class="signature-item">

              <span>
                MOST EXPLORED
              </span>

              <strong>
                ${escapeHtml(topDimension)}
              </strong>

            </div>


            <div class="signature-item">

              <span>
                REFLECTION STYLE
              </span>

              <strong>
                ${reflectionStyle}
              </strong>

            </div>

          </div>

        </section>


        <!-- =====================================================
             DEPTH
        ====================================================== -->

        <section class="insight-panel depth-panel">

          <div class="panel-header">

            <div>
              <div class="eyebrow">
                REFLECTION DEPTH
              </div>

              <h3>
                <span class="insight-heading-icon" aria-hidden="true">◐</span>
                How deeply you explore
              </h3>

              <p>
                Your reflections across different levels of depth.
              </p>
            </div>

          </div>


          <div class="depth-list">

            <div class="depth-row">

              <div class="depth-row-name">
                <span class="depth-dot gentle"></span>
                Gentle
              </div>

              <strong>${gentle}</strong>

            </div>


            <div class="depth-row">

              <div class="depth-row-name">
                <span class="depth-dot balanced"></span>
                Balanced
              </div>

              <strong>${balanced}</strong>

            </div>


            <div class="depth-row">

              <div class="depth-row-name">
                <span class="depth-dot deep"></span>
                Deep
              </div>

              <strong>${deep}</strong>

            </div>

          </div>

        </section>

      </div>
    `;

  } catch (err) {

    area.innerHTML = `
      <div class="empty">
        ${escapeHtml(err.message)}
      </div>
    `;

  }
}
/* ===========================================================
   NEXUS MULTI-SCREEN PARALLAX (landing hero)
=========================================================== */
const nexusScreens = document.querySelectorAll(".parallax-screen");
const screenButtons = document.querySelectorAll(".screen-btn");
const progressBar = document.querySelector(".scroll-progress span");
let currentScreen = 0;
let isChangingScreen = false;

function changeNexusScreen(index) {
  if (index < 0 || index >= nexusScreens.length || isChangingScreen) return;
  isChangingScreen = true;
  currentScreen = index;
  nexusScreens.forEach((screen, i) => screen.classList.toggle("active", i === index));
  screenButtons.forEach((button, i) => button.classList.toggle("active", i === index));
  if (progressBar) progressBar.style.width = `${((index + 1) / nexusScreens.length) * 100}%`;
  setTimeout(() => { isChangingScreen = false; }, 900);
}
screenButtons.forEach((button, index) => button.addEventListener("click", () => changeNexusScreen(index)));

const parallaxHero = document.querySelector(".nexus-parallax-hero");
if (parallaxHero) {
  parallaxHero.addEventListener("wheel", (event) => {
    if (isChangingScreen) { event.preventDefault(); return; }
    if (Math.abs(event.deltaY) < 20) return;
    if (event.deltaY > 0) {
      if (currentScreen < nexusScreens.length - 1) { event.preventDefault(); changeNexusScreen(currentScreen + 1); }
    } else if (currentScreen > 0) { event.preventDefault(); changeNexusScreen(currentScreen - 1); }
  }, { passive: false });

  parallaxHero.addEventListener("mousemove", (event) => {
    const x = (event.clientX / window.innerWidth - 0.5);
    const y = (event.clientY / window.innerHeight - 0.5);
    const activeScreen = document.querySelector(".parallax-screen.active");
    if (!activeScreen) return;
    const visual = activeScreen.querySelector(".screen-visual");
    if (visual) visual.style.transform = `translate(${x * 18}px, ${y * 18}px)`;
    document.querySelectorAll(".parallax-orb").forEach((orb, index) => {
      const depth = (index + 1) * 12;
      orb.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  });
  parallaxHero.addEventListener("mouseleave", () => {
    const visual = document.querySelector(".parallax-screen.active .screen-visual");
    if (visual) visual.style.transform = "translate(0, 0)";
  });
}

document.addEventListener("keydown", (event) => {
  const hero = document.querySelector(".nexus-parallax-hero");
  if (!hero || $("#landingPage").classList.contains("hidden")) return;
  const rect = hero.getBoundingClientRect();
  const heroVisible = rect.top <= 100 && rect.bottom >= 100;
  if (!heroVisible) return;
  if (event.key === "ArrowDown" || event.key === "PageDown") {
    if (currentScreen < nexusScreens.length - 1) { event.preventDefault(); changeNexusScreen(currentScreen + 1); }
  }
  if (event.key === "ArrowUp" || event.key === "PageUp") {
    if (currentScreen > 0) { event.preventDefault(); changeNexusScreen(currentScreen - 1); }
  }
});