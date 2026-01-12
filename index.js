(() => {
  "use strict";

  const MODULE_ID = "infoboard_sidebar";
  const STORAGE_KEY = `${MODULE_ID}_prefs_v2`;
  const LAYOUT_KEY = `${MODULE_ID}_layout_v2`;
  const PROMPT_KEY = `${MODULE_ID}_prompt_v2`;

  // Marker to prevent duplicate injection
  const IBS_MARKER = "<!-- IBS_PROMPT -->";

  // =========================
  // Defaults
  // =========================
  const DEFAULT_PREFS = {
    open: true,
    hideInChat: true,
    stripOuterBrackets: false,

    // default ON
    autoInjectPrompt: true,
    injectRole: "system", // "system" | "user"

    // prompt mode:
    // - "schema": generated from layout
    // - "custom": user edits prompt text
    promptMode: "schema",

    // UI
    showAdvanced: false,
  };

  // Default visual layout (your current vibe)
  const DEFAULT_LAYOUT = {
    extrasSectionTitle: "Extra",
    sections: [
      {
        title: "Presence",
        fields: [
          { key: "Posture", label: "Posture", display: "text" },
          { key: "Clothes", label: "Clothes", display: "text", subtle: true },
          { key: "Emoji", label: "Emoji", display: "text", subtle: true }
        ]
      },
      {
        title: "Mind",
        fields: [
          { key: "Mood", label: "Mood", display: "chips" },
          { key: "Thought", label: "Thought", display: "mono", subtle: true }
        ]
      },
      {
        title: "Connection",
        fields: [
          { key: "Affinity", label: "Affinity", display: "text" },
          { key: "Arousal", label: "Arousal", display: "bar_text" }
        ]
      },
      {
        title: "World",
        fields: [
          { key: "Location", label: "Location", display: "text" },
          { key: "Timezone", label: "Time", display: "text", subtle: true },
          { key: "Objective", label: "Objective", display: "text", subtle: true }
        ]
      }
    ]
  };

  // Default custom prompt (only used if promptMode="custom")
  const DEFAULT_CUSTOM_PROMPT = `${IBS_MARKER}
At the beginning of your next reply, write an informational board inside of <info_board>, based on the current setting and what just happened. Ensure ALL contents are inside a codeblock.

<info_board>
\`\`\`
Posture: [...]
Clothes: [...]
Affinity: [...]
Mood: [...]
Emoji: [...]
Thought: [...]
Arousal: 0% - [...]
Location: [...]
Timezone: [...]
Objective: [...]
\`\`\`
</info_board>`;

  // =========================
  // State
  // =========================
  const prefs = { ...DEFAULT_PREFS };
  let layoutConfig = structuredClone(DEFAULT_LAYOUT);
  let customPrompt = DEFAULT_CUSTOM_PROMPT;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(prefs, DEFAULT_PREFS, saved);
    } catch (_) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function loadLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      layoutConfig = raw ? JSON.parse(raw) : structuredClone(DEFAULT_LAYOUT);
      if (!layoutConfig || typeof layoutConfig !== "object") layoutConfig = structuredClone(DEFAULT_LAYOUT);
      if (!Array.isArray(layoutConfig.sections)) layoutConfig.sections = structuredClone(DEFAULT_LAYOUT.sections);
      if (typeof layoutConfig.extrasSectionTitle !== "string") layoutConfig.extrasSectionTitle = "Extra";
      for (const s of layoutConfig.sections) {
        if (!s || typeof s !== "object") continue;
        if (!Array.isArray(s.fields)) s.fields = [];
      }
    } catch {
      layoutConfig = structuredClone(DEFAULT_LAYOUT);
    }
  }

  function saveLayout() {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutConfig));
    } catch (_) {}
  }

  function loadPrompt() {
    try {
      const raw = localStorage.getItem(PROMPT_KEY);
      customPrompt = raw ? String(raw) : DEFAULT_CUSTOM_PROMPT;
    } catch {
      customPrompt = DEFAULT_CUSTOM_PROMPT;
    }
  }

  function savePrompt() {
    try {
      localStorage.setItem(PROMPT_KEY, customPrompt);
    } catch (_) {}
  }

  // =========================
  // Utils
  // =========================
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
    }
    for (const c of children) node.append(c);
    return node;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function shallowText(v) {
    return String(v ?? "").trim();
  }

  function safeClone(o) {
    try {
      return structuredClone(o);
    } catch {
      return JSON.parse(JSON.stringify(o));
    }
  }

  // =========================
  // Per-character cache
  // =========================
  const CACHE_KEY = `${MODULE_ID}_board_cache_v1`;
  let boardCache = {};
  let activeKey = "global";

  function loadBoardCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      boardCache = raw ? JSON.parse(raw) : {};
      if (!boardCache || typeof boardCache !== "object") boardCache = {};
    } catch {
      boardCache = {};
    }
  }

  function saveBoardCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(boardCache));
    } catch {}
  }

  function getActiveCharacterKey() {
    try {
      if (window?.characters && window?.this_chid !== undefined) {
        const ch = window.characters[window.this_chid];
        if (ch) {
          const idLike = ch.avatar || ch.name || window.this_chid;
          return `chid:${String(idLike)}`;
        }
      }
    } catch {}

    const nameEl =
      document.querySelector(".char-name") ||
      document.querySelector("#chat_header .name") ||
      document.querySelector("#top-bar .name") ||
      document.querySelector(".header .name") ||
      document.querySelector("[data-testid='char-name']");

    const name = (nameEl?.textContent || "").trim();
    if (name) return `name:${name}`;

    const titleEl =
      document.querySelector("#chat_name") ||
      document.querySelector(".chat-title") ||
      document.querySelector(".chat_name");

    const title = (titleEl?.textContent || "").trim();
    if (title) return `chat:${title}`;

    return "global";
  }

  function setCacheForActive(dataObj) {
    const key = activeKey || "global";
    boardCache[key] = { data: dataObj, savedAt: Date.now() };
    saveBoardCache();
  }

  function getCacheForKey(key) {
    const entry = boardCache[key];
    return entry?.data || null;
  }

  // =========================
  // Parsing
  // =========================
  function getAllExpectedKeysFromLayout() {
    const keys = new Set();
    for (const sec of layoutConfig.sections || []) {
      for (const f of sec.fields || []) {
        if (f?.key) keys.add(String(f.key));
      }
    }
    return keys.size ? Array.from(keys) : [
      "Posture","Clothes","Affinity","Mood","Emoji","Thought","Arousal","Location","Timezone","Objective"
    ];
  }

  function looksLikeInfoBoard(text) {
    const expected = getAllExpectedKeysFromLayout();
    let hits = 0;
    for (const k of expected) {
      const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(k)}\\s*:`, "i");
      if (re.test(text)) hits++;
    }
    // tolerant detection
    return hits >= Math.min(4, Math.max(2, expected.length));
  }

  function maybeStripBrackets(value) {
    const v = String(value ?? "").trim();
    if (!prefs.stripOuterBrackets) return v;
    if (v.startsWith("[") && v.endsWith("]")) return v.slice(1, -1).trim();
    return v;
  }

  function parseKeyValueLines(text) {
    const lines = text.split("\n");
    const data = {};
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (!key) continue;
      val = maybeStripBrackets(val);
      data[key] = val;
    }
    return data;
  }

  function getPercent(value) {
    if (!value) return null;
    const m = String(value).match(/(\d{1,3})\s*%/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n)) return null;
    return clamp(n, 0, 100);
  }

  function splitToChips(value) {
    if (!value) return [];
    return String(value)
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  // =========================
  // Prompt generation from schema
  // =========================
  function buildPromptFromSchema() {
    const keysInOrder = [];
    const keyToField = new Map();

    for (const sec of layoutConfig.sections || []) {
      for (const f of sec.fields || []) {
        if (!f?.key) continue;
        const k = String(f.key).trim();
        if (!k) continue;
        if (!keysInOrder.includes(k)) keysInOrder.push(k);
        keyToField.set(k, f);
      }
    }

    const lines = keysInOrder.length
      ? keysInOrder.map(k => {
          const f = keyToField.get(k) || {};
          const disp = f.display || "text";

          // Users requested: text / text+bar / bar-only
          // We keep chips/mono for compatibility and defaults.
          if (disp === "bar_only") return `${k}: [%]`;
          if (disp === "bar_text") return `${k}: [%] - [...]`;
          return `${k}: [...]`;
        }).join("\n")
      : [
          "Posture: [...]",
          "Clothes: [...]",
          "Affinity: [...]",
          "Mood: [...]",
          "Emoji: [...]",
          "Thought: [...]",
          "Arousal: [%] - [...]",
          "Location: [...]",
          "Timezone: [...]",
          "Objective: [...]",
        ].join("\n");

    return `${IBS_MARKER}
At the beginning of your next reply, write an informational board inside of <info_board>, based on the current setting and what just happened. Keep it concise and consistent. Ensure ALL contents are inside a codeblock.

<info_board>
\`\`\`
${lines}
\`\`\`
</info_board>`;
  }

  function getEffectiveInjectionPrompt() {
    if (prefs.promptMode === "custom") {
      const p = customPrompt || "";
      return p.includes(IBS_MARKER) ? p : `${IBS_MARKER}\n${p}`;
    }
    return buildPromptFromSchema();
  }

  // =========================
  // UI (HUD)
  // =========================
  let root, panel, content;
  let settingsModal = null;
  let lastDetectedKeys = [];

  function buildUI() {
    root = el("div", { id: "ibs-root", class: "ibs-root" });

    const toggleBtn = el(
      "button",
      {
        id: "ibs-toggle",
        class: "ibs-toggle",
        title: "Toggle panel",
        onclick: () => {
          prefs.open = !prefs.open;
          savePrefs();
          renderOpenState();
        },
      },
      ["≡"]
    );

    panel = el("div", { id: "ibs-panel", class: "ibs-panel" });

    const header = el("div", { class: "ibs-header" }, [
      el("div", { class: "ibs-titlewrap" }, [
        el("div", { class: "ibs-title" }, ["Current State"]),
        el("div", { class: "ibs-subtitle" }, ["Live RP snapshot"]),
      ]),
      el("div", { class: "ibs-actions" }, [
        el("button", { class: "ibs-mini", title: "Refresh", onclick: () => refreshFromChat(true) }, ["↻"]),
        el("button", { class: "ibs-mini", title: "Settings", onclick: openSettings }, ["⚙"]),
        el(
          "button",
          {
            class: "ibs-mini",
            title: "Close",
            onclick: () => {
              prefs.open = false;
              savePrefs();
              renderOpenState();
            },
          },
          ["✕"]
        ),
      ]),
    ]);

    content = el("div", { class: "ibs-content" }, [
      el("div", { class: "ibs-empty" }, ["No info board found yet."])
    ]);

    panel.append(header, content);
    root.append(toggleBtn, panel);
    document.body.append(root);

    renderOpenState();
  }

  function renderOpenState() {
    root.classList.toggle("open", prefs.open);
  }

  // ----- rendering helpers -----
  function section(title, bodyNodes = []) {
    const wrap = el("div", { class: "ibs-section" });
    wrap.append(el("div", { class: "ibs-section-title" }, [title]));
    const body = el("div", { class: "ibs-section-body" });
    for (const n of bodyNodes) if (n) body.append(n);
    wrap.append(body);
    return wrap;
  }

  function field(label, value, { subtle = false, mono = false } = {}) {
    if (value == null || String(value).trim() === "") return null;

    const labelNode = el("div", { class: "ibs-field-label" }, [label]);

    const valNode = mono
      ? el("div", { class: `ibs-field-value ibs-mono ${subtle ? "subtle" : ""}`.trim() }, [String(value)])
      : el("div", { class: `ibs-field-value ${subtle ? "subtle" : ""}`.trim() }, [String(value)]);

    const wrap = el("div", { class: "ibs-field" });
    wrap.append(labelNode, valNode);
    return wrap;
  }

  function chips(label, items) {
    if (!items || items.length === 0) return null;
    const wrap = el("div", { class: "ibs-field" }, [
      el("div", { class: "ibs-field-label" }, [label]),
    ]);
    const row = el("div", { class: "ibs-chips" });
    for (const it of items) row.append(el("span", { class: "ibs-chip" }, [it]));
    wrap.append(row);
    return wrap;
  }

  function barOnly(label, textValue) {
    if (!textValue || String(textValue).trim() === "") return null;
    const pct = getPercent(textValue);
    if (pct === null) return null;

    return el("div", { class: "ibs-field" }, [
      el("div", { class: "ibs-field-label" }, [label]),
      el("div", { class: "ibs-bar" }, [
        el("div", { class: "ibs-bar-fill", style: `width:${pct}%;` })
      ])
    ]);
  }

  function barWithText(label, textValue) {
    if (!textValue || String(textValue).trim() === "") return null;
    const pct = getPercent(textValue) ?? 0;

    return el("div", { class: "ibs-field" }, [
      el("div", { class: "ibs-field-label" }, [label]),
      el("div", { class: "ibs-bar" }, [
        el("div", { class: "ibs-bar-fill", style: `width:${pct}%;` })
      ]),
      el("div", { class: "ibs-field-value subtle" }, [String(textValue)]),
    ]);
  }

  function renderBoard(data) {
    content.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
      content.append(el("div", { class: "ibs-empty" }, ["No info board found yet."]));
      return;
    }

    const usedKeys = new Set();
    const nodes = [];

    for (const sec of layoutConfig.sections || []) {
      const bodyNodes = [];
      for (const f of sec.fields || []) {
        if (!f?.key) continue;

        const key = String(f.key);
        const label = f.label ? String(f.label) : key;
        const value = data[key];
        const subtle = !!f.subtle;

        let node = null;
        switch (f.display) {
          case "chips":
            node = chips(label, splitToChips(value));
            break;
          case "mono":
            node = field(label, value, { mono: true, subtle });
            break;
          case "bar_only":
            node = barOnly(label, value);
            break;
          case "bar_text":
            node = barWithText(label, value);
            break;
          case "text":
          default:
            node = field(label, value, { subtle });
            break;
        }

        if (node) {
          usedKeys.add(key);
          bodyNodes.push(node);
        }
      }

      if (bodyNodes.length) nodes.push(section(sec.title || "Section", bodyNodes));
    }

    for (const n of nodes) content.append(n);

    const extras = Object.entries(data).filter(([k]) => !usedKeys.has(k));
    if (extras.length) {
      content.append(section(layoutConfig.extrasSectionTitle || "Extra",
        extras.map(([k, v]) => field(k, v, { subtle: true }))
      ));
    }
  }

  // =========================
  // Chat parsing + hide in chat
  // =========================
  function getLatestInfoBoardCodeBlock() {
    const codes = Array.from(document.querySelectorAll(".mes pre code"));
    for (let i = codes.length - 1; i >= 0; i--) {
      const codeEl = codes[i];
      const t = (codeEl.textContent || "").trim();
      if (looksLikeInfoBoard(t)) return codeEl;
    }
    return null;
  }

  function hideOrShowBoardInChat(codeEl) {
    if (!codeEl) return;
    const pre = codeEl.closest("pre");
    if (!pre) return;
    pre.style.display = prefs.hideInChat ? "none" : "";
  }

  function refreshFromChat() {
    activeKey = getActiveCharacterKey();

    const codeEl = getLatestInfoBoardCodeBlock();
    if (!codeEl) {
      const cached = getCacheForKey(activeKey);
      if (cached) renderBoard(cached);
      else renderBoard(null);
      return;
    }

    const boardText = (codeEl.textContent || "").trim();
    const data = parseKeyValueLines(boardText);

    lastDetectedKeys = Object.keys(data).sort((a, b) => a.localeCompare(b));

    renderBoard(data);
    setCacheForActive(data);
    hideOrShowBoardInChat(codeEl);
  }

  function installObserver() {
    const target =
      document.querySelector("#chat") ||
      document.querySelector("#chat_area") ||
      document.querySelector(".chat") ||
      document.body;

    const obs = new MutationObserver(() => {
      requestAnimationFrame(() => refreshFromChat());
    });

    obs.observe(target, { childList: true, subtree: true });
    refreshFromChat();
  }

  function installActiveCharacterWatcher() {
    activeKey = getActiveCharacterKey();
    const cached = getCacheForKey(activeKey);
    if (cached) renderBoard(cached);

    setInterval(() => {
      const nextKey = getActiveCharacterKey();
      if (nextKey && nextKey !== activeKey) {
        activeKey = nextKey;
        const cachedBoard = getCacheForKey(activeKey);
        if (cachedBoard) renderBoard(cachedBoard);
        else renderBoard(null);
      }
    }, 600);
  }

  // =========================
  // Settings modal (visual editor)
  // =========================
  function closeSettings() {
  if (settingsModal) {
    // 🔧 Show the sidebar panel again
    const panel = document.getElementById('ibs-panel');
    if (panel) {
      panel.style.display = '';
    }
    
    // 🔧 Restore the hidden SillyTavern interface
    const hiddenId = settingsModal.getAttribute('data-hidden-element');
    if (hiddenId) {
      const stRoot = document.getElementById(hiddenId) || 
                     document.querySelector('body > div:first-child');
      if (stRoot) {
        stRoot.style.display = '';
      }
    }
    
    settingsModal.remove();
    settingsModal = null;
  }
}
  function openSettings(e) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (settingsModal) return;

    const overlay = el("div", { class: "ibs-modal-overlay", onclick: closeSettings });
    const modal = el("div", { class: "ibs-modal", onclick: (ev) => ev.stopPropagation() });

    const header = el("div", { class: "ibs-modal-header" }, [
      el("div", { class: "ibs-modal-title" }, ["InfoBoard Settings"]),
      el("div", { class: "ibs-modal-sub" }, ["Edit categories + infos without writing code"])
    ]);

    const tabs = el("div", { class: "ibs-tabs" });
    const tabBtns = {
      general: el("button", { class: "ibs-tab active" }, ["General"]),
      layout: el("button", { class: "ibs-tab" }, ["Layout"]),
      prompt: el("button", { class: "ibs-tab" }, ["Prompt"]),
    };
    Object.values(tabBtns).forEach(b => tabs.append(b));

    const body = el("div", { class: "ibs-modal-body" });
    const footer = el("div", { class: "ibs-modal-footer" });
    footer.append(
      el("button", { class: "ibs-btn", onclick: () => { resetAll(); } }, ["Reset all"]),
      el("button", { class: "ibs-btn primary", onclick: closeSettings }, ["Close"])
    );

    modal.append(header, tabs, body, footer);
    overlay.append(modal);
    
    settingsModal = overlay;
    
    // Append directly to body
    document.body.append(overlay);
    
    // Force positioning after a tiny delay
    setTimeout(() => {
      // Force inline styles to override everything
      overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(0,0,0,0.95) !important;
        padding: 20px !important;
        overflow-y: auto !important;
      `;

      const modalBox = overlay.querySelector('.ibs-modal');
      if (modalBox) {
        modalBox.style.cssText = `
          position: relative !important;
          z-index: 2147483648 !important;
          max-height: 80vh !important;
          width: 90vw !important;
          max-width: 600px !important;
          margin: auto !important;
          background: rgba(16,16,16,0.98) !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          border-radius: 16px !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        `;
      }
      
      // Force body to be visible and scrollable
      const modalBody = overlay.querySelector('.ibs-modal-body');
      if (modalBody) {
        modalBody.style.cssText = `
          padding: 12px !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          flex: 1 !important;
          min-height: 0 !important;
          color: rgba(255,255,255,0.9) !important;
        `;
      }
    }, 100);

    settingsModal = overlay;

    let activeTab = "general";
    let selectedCategoryIndex = 0;

    // ensure selected category valid
    if (!layoutConfig.sections || layoutConfig.sections.length === 0) {
      layoutConfig.sections = safeClone(DEFAULT_LAYOUT.sections);
      saveLayout();
    }

    function setTab(name) {
      activeTab = name;
      for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle("active", k === name);
      renderTab();
    }

    tabBtns.general.onclick = () => setTab("general");
    tabBtns.layout.onclick = () => setTab("layout");
    tabBtns.prompt.onclick = () => setTab("prompt");

    function resetAll() {
      layoutConfig = safeClone(DEFAULT_LAYOUT);
      customPrompt = DEFAULT_CUSTOM_PROMPT;
      Object.assign(prefs, DEFAULT_PREFS);
      saveLayout();
      savePrompt();
      savePrefs();
      refreshFromChat();
      renderTab();
    }

    // --- General tab UI ---
    function renderGeneral() {
      body.innerHTML = "";

      const row1 = el("div", { class: "ibs-form" });

      row1.append(
        toggleRow("Auto-inject prompt", prefs.autoInjectPrompt, (v) => {
          prefs.autoInjectPrompt = v;
          savePrefs();
        }, "Default is ON. Adds the InfoBoard instructions automatically."),

        selectRow("Inject role", prefs.injectRole, [
          { value: "system", label: "System (recommended)" },
          { value: "user", label: "User (try if ignored)" }
        ], (v) => {
          prefs.injectRole = v;
          savePrefs();
        }),

        toggleRow("Hide board in chat", prefs.hideInChat, (v) => {
          prefs.hideInChat = v;
          savePrefs();
          refreshFromChat();
        }),

        toggleRow("Strip [brackets] around values", prefs.stripOuterBrackets, (v) => {
          prefs.stripOuterBrackets = v;
          savePrefs();
          refreshFromChat();
        }),

        textRow("Extras section title (in case LLM gives more info", layoutConfig.extrasSectionTitle || "Extra", (v) => {
          layoutConfig.extrasSectionTitle = v || "Extra";
          saveLayout();
          refreshFromChat();
        })
      );

      body.append(row1);
    }

    // --- Layout tab UI (visual editor) ---
    function renderLayout() {
      body.innerHTML = "";

      const wrap = el("div", { class: "ibs-layout-wrap" });

      // Category dropdown
      const catRow = el("div", { class: "ibs-row" });
      const catLabel = el("div", { class: "ibs-field-label" }, ["Category"]);
      const catSelect = el("select", { class: "ibs-select" });

      layoutConfig.sections.forEach((s, idx) => {
        catSelect.append(el("option", { value: String(idx) }, [s.title || `Category ${idx + 1}`]));
      });

      if (selectedCategoryIndex >= layoutConfig.sections.length) selectedCategoryIndex = 0;
      catSelect.value = String(selectedCategoryIndex);

      catSelect.addEventListener("change", () => {
        selectedCategoryIndex = parseInt(catSelect.value, 10) || 0;
        renderLayout();
      });

      const addCatBtn = el("button", { class: "ibs-btn" , onclick: () => {
        const title = prompt("New category name?", "New Category");
        if (!title) return;
        layoutConfig.sections.push({ title: String(title), fields: [] });
        saveLayout();
        selectedCategoryIndex = layoutConfig.sections.length - 1;
        renderLayout();
      }}, ["+ Add category"]);

      const renameCatBtn = el("button", { class: "ibs-btn", onclick: () => {
        const sec = layoutConfig.sections[selectedCategoryIndex];
        if (!sec) return;
        const title = prompt("Rename category:", sec.title || "");
        if (!title) return;
        sec.title = String(title);
        saveLayout();
        renderLayout();
      }}, ["Rename"]);

      const delCatBtn = el("button", { class: "ibs-btn danger", onclick: () => {
        if (layoutConfig.sections.length <= 1) {
          alert("You need at least one category.");
          return;
        }
        const sec = layoutConfig.sections[selectedCategoryIndex];
        const ok = confirm(`Delete category "${sec?.title || "Untitled"}"?`);
        if (!ok) return;
        layoutConfig.sections.splice(selectedCategoryIndex, 1);
        saveLayout();
        selectedCategoryIndex = Math.max(0, selectedCategoryIndex - 1);
        renderLayout();
      }}, ["Delete"]);

      catRow.append(catLabel, catSelect, addCatBtn, renameCatBtn, delCatBtn);

      // Infos list
      const sec = layoutConfig.sections[selectedCategoryIndex];
      const listTitle = el("div", { class: "ibs-detected-title" }, [`Infos in "${sec?.title || "Category"}"`]);

      const list = el("div", { class: "ibs-list" });

      (sec?.fields || []).forEach((f, idx) => {
        const item = el("div", { class: "ibs-list-item" });

        const left = el("div", { class: "ibs-li-left" }, [
          el("div", { class: "ibs-li-key" }, [f.key || "(no key)"]),
          el("div", { class: "ibs-li-meta" }, [
            `${f.label || f.key || ""} • ${prettyDisplay(f.display)}${f.subtle ? " • subtle" : ""}`
          ])
        ]);

        const upBtn = el("button", { class: "ibs-icon", title: "Move up", onclick: () => {
          if (idx === 0) return;
          const arr = sec.fields;
          [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
          saveLayout();
          refreshFromChat();
          renderLayout();
        }}, ["↑"]);

        const downBtn = el("button", { class: "ibs-icon", title: "Move down", onclick: () => {
          const arr = sec.fields;
          if (idx >= arr.length - 1) return;
          [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
          saveLayout();
          refreshFromChat();
          renderLayout();
        }}, ["↓"]);

        const editBtn = el("button", { class: "ibs-icon", title: "Edit", onclick: () => {
          openFieldEditor(selectedCategoryIndex, idx, "edit");
        }}, ["✎"]);

        const delBtn = el("button", { class: "ibs-icon danger", title: "Remove", onclick: () => {
          const ok = confirm(`Remove info "${f.key}"?`);
          if (!ok) return;
          sec.fields.splice(idx, 1);
          saveLayout();
          refreshFromChat();
          renderLayout();
        }}, ["🗑"]);

        const right = el("div", { class: "ibs-li-right" }, [upBtn, downBtn, editBtn, delBtn]);
        item.append(left, right);
        list.append(item);
      });

      const addInfoBtn = el("button", { class: "ibs-btn primary", onclick: () => {
        openFieldEditor(selectedCategoryIndex, -1, "add");
      }}, ["+ Add info"]);

      // Detected keys helper
      const detected = el("div", { class: "ibs-detected" }, [
        el("div", { class: "ibs-detected-title" }, ["Detected keys (click to add as Text):"])
      ]);
      const dkRow = el("div", { class: "ibs-detected-chips" });
      for (const k of (lastDetectedKeys || []).slice(0, 30)) {
        dkRow.append(el("button", {
          class: "ibs-dk",
          onclick: () => {
            if (!sec) return;
            sec.fields = sec.fields || [];
            if (sec.fields.some(x => String(x.key) === k)) return;
            sec.fields.push({ key: k, label: k, display: "text" });
            saveLayout();
            refreshFromChat();
            renderLayout();
          }
        }, [k]));
      }
      detected.append(dkRow);

      wrap.append(catRow, listTitle, list, addInfoBtn, detected);
      body.append(wrap);
    }

    function prettyDisplay(d) {
      switch (d) {
        case "text": return "Text";
        case "bar_text": return "Text + Bar";
        case "bar_only": return "Bar only";
        case "chips": return "Chips";
        case "mono": return "Monospace";
        default: return "Text";
      }
    }

    // Field editor (visual)
    function openFieldEditor(sectionIndex, fieldIndex, mode) {
      const sec = layoutConfig.sections[sectionIndex];
      if (!sec) return;

      const current = (mode === "edit" && fieldIndex >= 0) ? sec.fields[fieldIndex] : {
        key: "",
        label: "",
        display: "text",
        subtle: false
      };

      const dialog = el("div", { class: "ibs-dialog-overlay" }, [
        el("div", { class: "ibs-dialog", onclick: (ev) => ev.stopPropagation() }, [])
      ]);

      dialog.addEventListener("click", () => dialog.remove());

      const box = dialog.querySelector(".ibs-dialog");

      const title = el("div", { class: "ibs-dialog-title" }, [mode === "edit" ? "Edit info" : "Add info"]);
      const hint = el("div", { class: "ibs-hint" }, [
        "Key must match what the bot outputs (e.g. “Posture”). Display type controls how it looks in the sidebar."
      ]);

      const keyInput = el("input", { class: "ibs-input", value: current.key || "", placeholder: "Key (e.g. Posture)" });
      const labelInput = el("input", { class: "ibs-input", value: current.label || "", placeholder: "Label (optional, shown in UI)" });

      const displaySelect = el("select", { class: "ibs-select" });
      displaySelect.append(
        el("option", { value: "text" }, ["Text"]),
        el("option", { value: "bar_text" }, ["Text + Bar"]),
        el("option", { value: "bar_only" }, ["Bar only"]),
        el("option", { value: "chips" }, ["Chips (comma-separated)"]),
        el("option", { value: "mono" }, ["Monospace (thought)"])
      );
      displaySelect.value = current.display || "text";

      const subtleToggle = checkboxRow("Subtle text", !!current.subtle, "Softer color (good for secondary info).");

      const actions = el("div", { class: "ibs-row" });
      const cancelBtn = el("button", { class: "ibs-btn", onclick: () => dialog.remove() }, ["Cancel"]);
      const saveBtn = el("button", { class: "ibs-btn primary", onclick: () => {
        const key = shallowText(keyInput.value);
        if (!key) {
          alert("Key is required.");
          return;
        }

        const label = shallowText(labelInput.value) || key;
        const display = displaySelect.value || "text";
        const subtle = subtleToggle.querySelector("input")?.checked || false;

        const newField = { key, label, display, subtle };

        // Prevent duplicates by key within category
        const dup = (sec.fields || []).some((f, i) => String(f.key) === key && i !== fieldIndex);
        if (dup) {
          alert(`"${key}" already exists in this category.`);
          return;
        }

        sec.fields = sec.fields || [];
        if (mode === "edit" && fieldIndex >= 0) sec.fields[fieldIndex] = newField;
        else sec.fields.push(newField);

        saveLayout();
        refreshFromChat();
        renderLayout();
        dialog.remove();
      }}, ["Save"]);

      actions.append(cancelBtn, saveBtn);

      box.append(
        title,
        hint,
        el("div", { class: "ibs-form" }, [
          labeled("Key", keyInput),
          labeled("Label", labelInput),
          labeled("Display type", displaySelect),
          subtleToggle
        ]),
        actions
      );

      document.body.append(dialog);
    }

    // --- Prompt tab UI ---
    function renderPrompt() {
      body.innerHTML = "";

      const modeRow = el("div", { class: "ibs-row" });
      const modeLabel = el("div", { class: "ibs-field-label" }, ["Prompt mode"]);
      const modeSelect = el("select", { class: "ibs-select" });
      modeSelect.append(
        el("option", { value: "schema" }, ["Auto (generated from layout)"]),
        el("option", { value: "custom" }, ["Custom prompt text"])
      );
      modeSelect.value = prefs.promptMode;

      modeSelect.addEventListener("change", () => {
        prefs.promptMode = modeSelect.value;
        savePrefs();
        renderPrompt();
      });

      modeRow.append(modeLabel, modeSelect);

      const explain = el("div", { class: "ibs-hint" }, [
        prefs.promptMode === "schema"
          ? "Auto mode generates the injected prompt from your Layout (keys + bar types)."
          : "Custom mode lets you paste your own prompt. Make sure it outputs Key: Value lines in a codeblock."
      ]);

      const preview = el("pre", { class: "ibs-preview" });
      preview.textContent = getEffectiveInjectionPrompt();

      body.append(modeRow, explain);

      if (prefs.promptMode === "custom") {
        const area = el("textarea", { class: "ibs-textarea" });
        area.value = customPrompt || "";
        area.addEventListener("input", () => {
          customPrompt = area.value;
          savePrompt();
          preview.textContent = getEffectiveInjectionPrompt();
        });

        body.append(
          labeled("Custom prompt", area),
          labeled("Injection preview", preview)
        );
      } else {
        body.append(labeled("Injection preview", preview));
      }

      // Advanced (collapsed)
      const adv = el("details", { class: "ibs-adv" });
      const sum = el("summary", { class: "ibs-adv-sum" }, ["Advanced"]);
      const advBody = el("div", { class: "ibs-adv-body" });

      const rawBtn = el("button", { class: "ibs-btn", onclick: () => {
        const raw = JSON.stringify(layoutConfig, null, 2);
        navigator.clipboard?.writeText(raw);
        alert("Layout JSON copied to clipboard.");
      }}, ["Copy layout JSON"]);

      advBody.append(
        el("div", { class: "ibs-hint" }, ["Power users: you can copy the raw layout JSON for sharing or debugging."]),
        rawBtn
      );

      adv.append(sum, advBody);
      body.append(adv);
    }

    // --- Shared small form components ---
    function labeled(labelText, inputEl) {
      return el("div", { class: "ibs-group" }, [
        el("div", { class: "ibs-field-label" }, [labelText]),
        inputEl
      ]);
    }

    function toggleRow(labelText, checked, onChange, hintText = "") {
      const row = el("div", { class: "ibs-toggle-row" });

      const left = el("div", { class: "ibs-toggle-left" }, [
        el("div", { class: "ibs-toggle-title" }, [labelText]),
        hintText ? el("div", { class: "ibs-toggle-hint" }, [hintText]) : el("span")
      ]);

      const input = el("input", { type: "checkbox" });
      input.checked = !!checked;
      input.addEventListener("change", () => onChange(!!input.checked));

      const right = el("label", { class: "ibs-switch" }, [
        input,
        el("span", { class: "ibs-slider" })
      ]);

      row.append(left, right);
      return row;
    }

    function checkboxRow(labelText, checked, hintText = "") {
      const row = el("div", { class: "ibs-toggle-row" });

      const left = el("div", { class: "ibs-toggle-left" }, [
        el("div", { class: "ibs-toggle-title" }, [labelText]),
        hintText ? el("div", { class: "ibs-toggle-hint" }, [hintText]) : el("span")
      ]);

      const input = el("input", { type: "checkbox" });
      input.checked = !!checked;

      const right = el("label", { class: "ibs-checkline" }, [
        input,
        el("span", { class: "ibs-checkbox" })
      ]);

      row.append(left, right);
      return row;
    }

    function selectRow(labelText, value, options, onChange) {
      const wrap = el("div", { class: "ibs-group" });
      const label = el("div", { class: "ibs-field-label" }, [labelText]);
      const select = el("select", { class: "ibs-select" });

      for (const opt of options) {
        select.append(el("option", { value: opt.value }, [opt.label]));
      }
      select.value = value;

      select.addEventListener("change", () => onChange(select.value));
      wrap.append(label, select);
      return wrap;
    }

    function textRow(labelText, value, onInput) {
      const input = el("input", { class: "ibs-input", value: value || "" });
      input.addEventListener("input", () => onInput(input.value));
      return labeled(labelText, input);
    }

    function renderTab() {
      if (activeTab === "general") renderGeneral();
      else if (activeTab === "layout") renderLayout();
      else renderPrompt();
    }

    renderTab();
  }
  // =========================
  // Injection via fetch wrapper
  // =========================
  let fetchWrapped = false;
  let originalFetch = null;

  function shouldInterceptUrl(url) {
    const u = String(url || "");
    return (
      u.includes("/api/") &&
      (
        u.includes("generate") ||
        u.includes("chat") ||
        u.includes("completion") ||
        u.includes("openai") ||
        u.includes("textgen") ||
        u.includes("backends")
      )
    );
  }

  function injectIntoPayload(obj) {
    if (!prefs.autoInjectPrompt) return { obj, injected: false };
    if (!obj || typeof obj !== "object") return { obj, injected: false };

    const promptText = getEffectiveInjectionPrompt();
    const role = prefs.injectRole === "user" ? "user" : "system";

    if (Array.isArray(obj.messages)) {
      const already = obj.messages.some(m => (m?.content || "").includes(IBS_MARKER));
      if (already) return { obj, injected: false };
      obj.messages.push({ role, content: promptText });
      return { obj, injected: true };
    }

    if (typeof obj.prompt === "string") {
      if (!obj.prompt.includes(IBS_MARKER)) {
        obj.prompt += "\n\n" + promptText;
        return { obj, injected: true };
      }
      return { obj, injected: false };
    }

    if (typeof obj.system_prompt === "string") {
      if (!obj.system_prompt.includes(IBS_MARKER)) {
        obj.system_prompt += "\n\n" + promptText;
        return { obj, injected: true };
      }
      return { obj, injected: false };
    }

    return { obj, injected: false };
  }

  function wrapFetchForInjection() {
    if (fetchWrapped) return;
    fetchWrapped = true;

    originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      try {
        const reqUrl =
          typeof input === "string"
            ? input
            : (input && input.url) ? input.url : "";

        const method =
          (init && init.method) ||
          (typeof input !== "string" && input && input.method) ||
          "GET";

        const isPost = String(method).toUpperCase() === "POST";

        if (!isPost || !shouldInterceptUrl(reqUrl)) {
          return originalFetch(input, init);
        }

        let body = init && init.body;

        if (!body && typeof input !== "string" && input instanceof Request) {
          const ct = input.headers.get("content-type") || "";
          if (!ct.includes("application/json")) {
            return originalFetch(input, init);
          }
          const cloned = input.clone();
          body = await cloned.text();

          init = Object.assign({}, init || {});
          init.headers = new Headers(init.headers || input.headers);
          init.method = method;
        }

        if (!body) return originalFetch(input, init);
        if (typeof body !== "string") return originalFetch(input, init);

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return originalFetch(input, init);
        }

        const { obj: injectedObj, injected } = injectIntoPayload(parsed);

        if (injected) {
          init = Object.assign({}, init || {});
          init.body = JSON.stringify(injectedObj);

          const headers = new Headers(
            init.headers ||
            (typeof input !== "string" && input instanceof Request ? input.headers : undefined)
          );
          if (!headers.get("content-type")) headers.set("content-type", "application/json");
          init.headers = headers;
        }

        return originalFetch(input, init);
      } catch (err) {
        console.warn("[IBS] fetch wrapper error:", err);
        return originalFetch(input, init);
      }
    };
  }

  // =========================
  // Boot
  // =========================
  function boot() {
    loadPrefs();
    loadLayout();
    loadPrompt();
    loadBoardCache();

    buildUI();
    installObserver();
    installActiveCharacterWatcher();
    wrapFetchForInjection();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromChat();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
