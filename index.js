(() => {
  "use strict";

  const MODULE_ID = "infoboard_sidebar";
  const STORAGE_KEY = `${MODULE_ID}_prefs`;

  // Marker to prevent duplicates
  const IBS_MARKER = "<!-- IBS_PROMPT -->";

  // Your exact prompt (kept as-is)
  const INFOBOARD_PROMPT = `${IBS_MARKER}
• At the beginning of your next reply, write an informational board inside of <info_board> following the format, filling placeholders based on the current setting, and logically progressing based off of what occurred in the last message. Ensure that contents are always inside codeblock:

<info_board>
\`\`\`
Posture: [Sentence about the current appearance of agent, focusing on pose, action and clothing or nude state]
Clothes: [Sentence about the clothes the agent is wearing right now.]
Affinity: [# {{char}}’s aff value] (Word or phrase reflecting agent's feeling for {{USER}})
Mood: [Agent's mood]
Emoji: [Kaomoji that depict agent's current state]
Thought: [“Agent’s internal thought”]
Arousal: [% Agent’s arousal based on mood and stimulation agent receives] (Brief description of how turned on agent is)
Location: [Agent’s current location]
Timezone: [current time in 24-hour clock format] [current day in the simulation in Weekday Month Day, Year format] [the current season]
Objective: [briefly describe agent's current goal in a few words]
\`\`\`
</info_board>`;

  // ----- prefs -----
  const prefs = {
    open: true,
    hideInChat: true,
    stripOuterBrackets: false,
    autoInjectPrompt: false, // inject via fetch wrapper
    injectMode: "system",    // "system" | "user"
  };

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.open === "boolean") prefs.open = saved.open;
      if (typeof saved.hideInChat === "boolean") prefs.hideInChat = saved.hideInChat;
      if (typeof saved.stripOuterBrackets === "boolean") prefs.stripOuterBrackets = saved.stripOuterBrackets;
      if (typeof saved.autoInjectPrompt === "boolean") prefs.autoInjectPrompt = saved.autoInjectPrompt;
      if (typeof saved.injectMode === "string") prefs.injectMode = saved.injectMode;
    } catch (_) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

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

  // ============================================================
  // Per-character cache
  // ============================================================
  const CACHE_KEY = `${MODULE_ID}_board_cache_v1`;
  let boardCache = {}; // { [activeKey]: { data, savedAt } }
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

  // Best-effort active character key:
  // - prefers ST globals if available
  // - otherwise uses DOM header name
  function getActiveCharacterKey() {
    // 1) ST globals (best)
    try {
      if (window?.characters && window?.this_chid !== undefined) {
        const ch = window.characters[window.this_chid];
        if (ch) {
          const idLike = ch.avatar || ch.name || window.this_chid;
          return `chid:${String(idLike)}`;
        }
      }
    } catch {}

    // 2) DOM (themes/builds vary)
    const nameEl =
      document.querySelector(".char-name") ||
      document.querySelector("#chat_header .name") ||
      document.querySelector("#top-bar .name") ||
      document.querySelector(".header .name") ||
      document.querySelector("[data-testid='char-name']");

    const name = (nameEl?.textContent || "").trim();
    if (name) return `name:${name}`;

    // 3) fallback to chat title
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

  // ============================================================
  // parsing
  // ============================================================
  const EXPECTED_KEYS = [
    "Posture",
    "Clothes",
    "Affinity",
    "Mood",
    "Emoji",
    "Thought",
    "Arousal",
    "Location",
    "Timezone",
    "Objective",
  ];

  function looksLikeInfoBoard(text) {
    let hits = 0;
    for (const k of EXPECTED_KEYS) {
      const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(k)}\\s*:`, "i");
      if (re.test(text)) hits++;
    }
    return hits >= 4;
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

  function getArousalPercent(arousalValue) {
    if (!arousalValue) return null;
    const m = String(arousalValue).match(/(\d{1,3})\s*%/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n)) return null;
    return clamp(n, 0, 100);
  }

  function splitMoodToChips(moodValue) {
    if (!moodValue) return [];
    return String(moodValue)
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  // ============================================================
  // UI
  // ============================================================
  let root, panel, content;
  let menuEl = null;

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
        el("button", { class: "ibs-mini", title: "Options", onclick: toggleMenu }, ["⋯"]),
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

  // ----- menu -----
  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function menuItem(checked, label, onChange) {
    return el("div", {
      class: "ibs-menu-item",
      onclick: (e) => {
        e.stopPropagation();
        onChange(!checked);
        closeMenu();
      }
    }, [
      el("span", { class: "ibs-check" }, [checked ? "✓" : ""]),
      el("span", {}, [label])
    ]);
  }

  function toggleMenu(e) {
    e.stopPropagation();
    if (menuEl) return closeMenu();

    menuEl = el("div", { class: "ibs-menu" }, [
      menuItem(prefs.hideInChat, "Hide board in chat", (v) => {
        prefs.hideInChat = v;
        savePrefs();
        refreshFromChat(true);
      }),
      menuItem(prefs.stripOuterBrackets, "Strip [brackets]", (v) => {
        prefs.stripOuterBrackets = v;
        savePrefs();
        refreshFromChat(true);
      }),
      menuItem(prefs.autoInjectPrompt, "Auto-inject InfoBoard prompt", (v) => {
        prefs.autoInjectPrompt = v;
        savePrefs();
        console.log("[IBS] Auto-inject:", prefs.autoInjectPrompt ? "ON" : "OFF");
      }),
    ]);

    document.body.append(menuEl);

    const rect = e.currentTarget.getBoundingClientRect();
    const MENU_W = 240;
    const x = rect.right - MENU_W;
    const y = rect.bottom + 8;

    menuEl.style.left = `${Math.max(8, x)}px`;
    menuEl.style.top = `${y}px`;

    setTimeout(() => {
      document.addEventListener("click", closeMenuOnce, { once: true });
    }, 0);
  }

  function closeMenuOnce() {
    closeMenu();
  }

  // ----- sections render -----
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

  function arousalField(arousalText) {
    if (!arousalText || String(arousalText).trim() === "") return null;
    const pct = getArousalPercent(arousalText) ?? 0;

    return el("div", { class: "ibs-field" }, [
      el("div", { class: "ibs-field-label" }, ["Arousal"]),
      el("div", { class: "ibs-bar" }, [
        el("div", { class: "ibs-bar-fill", style: `width:${pct}%;` })
      ]),
      el("div", { class: "ibs-field-value subtle" }, [String(arousalText)]),
    ]);
  }

  function renderBoard(data) {
    content.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
      content.append(el("div", { class: "ibs-empty" }, ["No info board found yet."]));
      return;
    }

    const nodes = [];

    nodes.push(section("Presence", [
      field("Posture", data.Posture),
      field("Clothes", data.Clothes, { subtle: true }),
      field("Emoji", data.Emoji ? maybeStripBrackets(data.Emoji) : "", { subtle: true }),
    ]));

    nodes.push(section("Mind", [
      chips("Mood", splitMoodToChips(data.Mood)),
      field("Thought", data.Thought, { mono: true, subtle: true }),
    ]));

    nodes.push(section("Connection", [
      field("Affinity", data.Affinity),
      arousalField(data.Arousal),
    ]));

    nodes.push(section("World", [
      field("Location", data.Location),
      field("Time", data.Timezone, { subtle: true }),
      field("Objective", data.Objective, { subtle: true }),
    ]));

    for (const n of nodes) content.append(n);

    const known = new Set(EXPECTED_KEYS);
    const extras = Object.entries(data).filter(([k]) => !known.has(k));
    if (extras.length) {
      content.append(section("Extra", extras.map(([k, v]) => field(k, v, { subtle: true }))));
    }
  }

  // ============================================================
  // Chat parsing + hide in chat
  // ============================================================
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

  function refreshFromChat(force = false) {
    // Ensure activeKey is current before saving cache
    activeKey = getActiveCharacterKey();

    const codeEl = getLatestInfoBoardCodeBlock();
    if (!codeEl) {
      // If no info board in DOM, try restore cached for current character
      const cached = getCacheForKey(activeKey);
      if (cached) renderBoard(cached);
      return;
    }

    const boardText = (codeEl.textContent || "").trim();
    const data = parseKeyValueLines(boardText);

    renderBoard(data);
    setCacheForActive(data);          // <-- per-character save
    hideOrShowBoardInChat(codeEl);
  }

  function installObserver() {
    const target =
      document.querySelector("#chat") ||
      document.querySelector("#chat_area") ||
      document.querySelector(".chat") ||
      document.body;

    const obs = new MutationObserver(() => {
      requestAnimationFrame(() => refreshFromChat(false));
    });

    obs.observe(target, { childList: true, subtree: true });
    refreshFromChat(true);
  }

  function installActiveCharacterWatcher() {
    // Initial
    activeKey = getActiveCharacterKey();
    const cached = getCacheForKey(activeKey);
    if (cached) renderBoard(cached);

    // Poll is robust across builds/themes
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

  // ============================================================
  // FETCH-BASED PROMPT INJECTION (reliable across staging)
  // ============================================================
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

    // OpenAI-style messages array
    if (Array.isArray(obj.messages)) {
      const already = obj.messages.some(m => (m?.content || "").includes(IBS_MARKER));
      if (already) return { obj, injected: false };

      const role = prefs.injectMode === "user" ? "user" : "system";
      obj.messages.push({ role, content: INFOBOARD_PROMPT });
      return { obj, injected: true };
    }

    // Prompt string
    if (typeof obj.prompt === "string") {
      if (!obj.prompt.includes(IBS_MARKER)) {
        obj.prompt += "\n\n" + INFOBOARD_PROMPT;
        return { obj, injected: true };
      }
      return { obj, injected: false };
    }

    // System prompt string
    if (typeof obj.system_prompt === "string") {
      if (!obj.system_prompt.includes(IBS_MARKER)) {
        obj.system_prompt += "\n\n" + INFOBOARD_PROMPT;
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

        // If input is a Request and init.body not set, clone and read
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

          console.log("[IBS] Injected InfoBoard prompt into request:", reqUrl);
        }

        return originalFetch(input, init);
      } catch (err) {
        console.warn("[IBS] fetch wrapper error:", err);
        return originalFetch(input, init);
      }
    };

    console.log("[IBS] fetch wrapper installed");
  }

  // ============================================================
  // boot
  // ============================================================
  function boot() {
    loadPrefs();
    loadBoardCache();

    buildUI();
    installObserver();
    installActiveCharacterWatcher();
    wrapFetchForInjection();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromChat(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
