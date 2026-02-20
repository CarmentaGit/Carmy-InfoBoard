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

    // Pull mode: "auto" = inject into generation, "manual" = click button to generate
    pullMode: "auto",

    // For auto mode
    autoInjectPrompt: true,
    injectRole: "system", // "system" | "user"

    // For manual mode
    manualProfile: "", // empty = use current profile

    // History: "all" or a number like 5, 10, 20
    historyLimit: "all",

    // prompt mode:
    // - "schema": generated from layout
    // - "custom": user edits prompt text
    promptMode: "schema",

    // UI
    showAdvanced: false,
    panelOpacity: 0.78,
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
  let isGenerating = false; // Prevent double-clicks
  let availableProfiles = []; // Cache of connection profiles

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
  // SillyTavern API Helpers
  // =========================
  function getSTContext() {
    try {
      if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
        return SillyTavern.getContext();
      }
    } catch (e) {
      console.warn("[IBS] Could not get SillyTavern context:", e);
    }
    return null;
  }

  function hasSTAPI() {
    return getSTContext() !== null;
  }

  // Get character/user names and group info for prompt context
  function getChatParticipants() {
    const info = { userName: "", charName: "", charNames: [], isGroup: false };
    try {
      const context = getSTContext();
      if (context) {
        info.userName = context.name1 || "";
        info.charName = context.name2 || "";

        // Check for group chat
        if (context.groupId) {
          info.isGroup = true;
          const group = (context.groups || []).find(g => g.id === context.groupId);
          if (group?.members && Array.isArray(context.characters)) {
            // members are avatar filenames - resolve to character names
            for (const avatarOrId of group.members) {
              const ch = context.characters.find(c => c.avatar === avatarOrId);
              const name = ch?.name || "";
              if (name && !info.charNames.includes(name)) {
                info.charNames.push(name);
              }
            }
          }
        }
      }

      // Fallback for character name from window globals
      if (!info.charName && window?.characters && window?.this_chid !== undefined) {
        const ch = window.characters[window.this_chid];
        if (ch?.name) info.charName = ch.name;
      }

      // If group but member resolution failed, try extracting names from chat
      if (info.isGroup && info.charNames.length === 0) {
        const context = getSTContext();
        if (context?.chat) {
          const nameSet = new Set();
          for (const msg of context.chat) {
            if (!msg.is_user && msg.name) {
              nameSet.add(msg.name);
            }
          }
          info.charNames = Array.from(nameSet);
        }
        // Last resort: at least include the main char name
        if (info.charNames.length === 0 && info.charName) {
          info.charNames.push(info.charName);
        }
      }
    } catch {}
    return info;
  }

  // Get available connection profiles - tries multiple methods
  async function fetchConnectionProfiles() {
    const profiles = [];
    
    try {
      // Method 1: Try to access power_user.connection_profiles directly
      if (window.power_user?.connection_profiles) {
        const cp = window.power_user.connection_profiles;
        if (Array.isArray(cp)) {
          for (const p of cp) {
            // Profile objects have { id, name, ... } - we want the name
            if (p?.name) {
              profiles.push(p.name);
            } else if (typeof p === "string") {
              profiles.push(p);
            }
          }
        } else if (typeof cp === "object") {
          // If it's an object keyed by ID, get the names
          for (const key of Object.keys(cp)) {
            const profile = cp[key];
            if (profile?.name) {
              profiles.push(profile.name);
            } else if (typeof profile === "string") {
              profiles.push(profile);
            }
          }
        }
      }
      
      // Method 2: Try the UI dropdown directly - this has the display names
      if (profiles.length === 0) {
        const profileSelect = document.querySelector('#connection_profiles');
        if (profileSelect) {
          const options = profileSelect.querySelectorAll('option');
          options.forEach(opt => {
            const name = opt.textContent?.trim();
            // Skip empty, "None", "Default" type entries
            if (name && name !== "<None>" && name !== "None" && name !== "Default" && !profiles.includes(name)) {
              profiles.push(name);
            }
          });
        }
      }
      
      // Method 3: Try executeSlashCommands if available
      if (profiles.length === 0) {
        const context = getSTContext();
        if (context?.executeSlashCommands) {
          try {
            const result = await context.executeSlashCommands("/profile-list");
            if (result && typeof result === "string") {
              try {
                const parsed = JSON.parse(result);
                if (Array.isArray(parsed)) {
                  for (const p of parsed) {
                    if (typeof p === "string") profiles.push(p);
                    else if (p?.name) profiles.push(p.name);
                  }
                }
              } catch {
                const lines = result.split("\n").map(l => l.trim()).filter(Boolean);
                profiles.push(...lines);
              }
            }
          } catch {}
        }
      }
      
    } catch (e) {
      console.warn("[IBS] Could not fetch profiles:", e);
    }
    
    availableProfiles = profiles;
    console.log("[IBS] Found profiles:", profiles);
    return profiles;
  }

  // Get current profile name
  async function getCurrentProfile() {
    try {
      // Method 1: Get from UI dropdown (most reliable for getting the display name)
      const profileSelect = document.querySelector('#connection_profiles');
      if (profileSelect && profileSelect.selectedIndex >= 0) {
        const selectedOption = profileSelect.options[profileSelect.selectedIndex];
        const name = selectedOption?.textContent?.trim();
        if (name && name !== "<None>" && name !== "None") {
          console.log("[IBS] Current profile from UI:", name);
          return name;
        }
      }
      
      // Method 2: Try power_user - but need to map ID to name
      if (window.power_user?.connection_profiles && window.power_user?.selected_connection_profile) {
        const selectedId = window.power_user.selected_connection_profile;
        const profiles = window.power_user.connection_profiles;
        if (Array.isArray(profiles)) {
          const found = profiles.find(p => p.id === selectedId);
          if (found?.name) {
            console.log("[IBS] Current profile from power_user:", found.name);
            return found.name;
          }
        }
      }
      
      // Method 3: Try slash command
      const context = getSTContext();
      if (context?.executeSlashCommands) {
        const result = await context.executeSlashCommands("/profile");
        if (result && typeof result === "string") {
          console.log("[IBS] Current profile from slash command:", result);
          return result.trim();
        }
      }
      
      return "";
    } catch (e) {
      console.warn("[IBS] Could not get current profile:", e);
      return "";
    }
  }

  // Switch to a profile (case-insensitive matching, with verification)
  async function switchProfile(profileName) {
    try {
      if (!profileName) return false;

      console.log("[IBS] Switching to profile:", profileName);
      const target = profileName.trim().toLowerCase();

      // Method 1: Try using the UI dropdown directly (case-insensitive)
      const profileSelect = document.querySelector('#connection_profiles');
      if (profileSelect) {
        const options = Array.from(profileSelect.options);
        const targetOption = options.find(opt =>
          opt.textContent?.trim().toLowerCase() === target
        );
        if (targetOption) {
          profileSelect.value = targetOption.value;
          profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
          console.log("[IBS] Profile switched via UI dropdown");
          // Wait for ST to process the change
          await new Promise(r => setTimeout(r, 300));
          return true;
        }
      }

      // Method 2: Try slash command
      const context = getSTContext();
      if (context?.executeSlashCommands) {
        await context.executeSlashCommands(`/profile ${profileName}`);
        console.log("[IBS] Profile switched via slash command");
        await new Promise(r => setTimeout(r, 300));
        return true;
      }

      return false;
    } catch (e) {
      console.warn("[IBS] Could not switch profile:", e);
      return false;
    }
  }

  // Verify that the current profile matches expected (case-insensitive)
  async function verifyProfile(expectedName) {
    const current = await getCurrentProfile();
    if (!current || !expectedName) return false;
    return current.trim().toLowerCase() === expectedName.trim().toLowerCase();
  }

  // =========================
  // Message Metadata Storage
  // =========================
  function getStoredInfoBoardsFromChat() {
    const context = getSTContext();
    if (!context?.chat) return [];

    const boards = [];
    for (let i = 0; i < context.chat.length; i++) {
      const msg = context.chat[i];
      if (!msg.is_user && msg.extra?.infoboard?.data) {
        boards.push({
          index: i,
          data: msg.extra.infoboard.data,
          generatedAt: msg.extra.infoboard.generatedAt || null
        });
      }
    }
    return boards;
  }

  function storeInfoBoardOnMessage(messageIndex, data) {
    const context = getSTContext();
    if (!context?.chat || messageIndex < 0 || messageIndex >= context.chat.length) return false;

    const msg = context.chat[messageIndex];
    if (!msg) return false;

    msg.extra = msg.extra || {};
    msg.extra.infoboard = {
      data: data,
      generatedAt: Date.now(),
      profile: prefs.manualProfile || "current"
    };

    // Save the chat to persist
    if (context.saveChat) {
      context.saveChat();
    }

    return true;
  }

  function getLastBotMessageIndex() {
    const context = getSTContext();
    if (!context?.chat) return -1;

    for (let i = context.chat.length - 1; i >= 0; i--) {
      if (!context.chat[i].is_user) {
        return i;
      }
    }
    return -1;
  }

  // =========================
  // Per-character cache (fallback when ST API not available)
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

    // Build perspective context
    const p = getChatParticipants();
    let perspectiveNote = "";
    if (p.isGroup && p.charNames.length > 0) {
      perspectiveNote = `\nThis is a group chat with characters: ${p.charNames.join(", ")}. The info board must describe the CHARACTER(S) (${p.charNames.join(", ")}), NOT the user${p.userName ? ` (${p.userName})` : ""}. Track the characters' states, emotions, and actions.`;
    } else if (p.charName) {
      perspectiveNote = `\nThe info board must describe the CHARACTER (${p.charName}), NOT the user${p.userName ? ` (${p.userName})` : ""}. Track ${p.charName}'s state, emotions, and actions.`;
    }

    return `${IBS_MARKER}
At the beginning of your next reply, write an informational board inside of <info_board>, based on the current setting and what just happened. Keep it concise and consistent. Ensure ALL contents are inside a codeblock. Do NOT think or reason about it, just output the board directly.${perspectiveNote}

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

  // Build prompt with history context for manual pull
  function buildManualPullPrompt() {
    const storedBoards = getStoredInfoBoardsFromChat();
    
    // Apply history limit
    let boardsToInclude = storedBoards;
    if (prefs.historyLimit !== "all" && typeof prefs.historyLimit === "number") {
      boardsToInclude = storedBoards.slice(-prefs.historyLimit);
    }

    let historySection = "";
    if (boardsToInclude.length > 0) {
      // Use the board's original index in storedBoards for "messages ago" calc
      const totalBoards = storedBoards.length;
      const startIdx = totalBoards - boardsToInclude.length;
      const historyLines = boardsToInclude.map((b, idx) => {
        const originalIdx = startIdx + idx;
        const messagesAgo = totalBoards - originalIdx;
        const dataLines = Object.entries(b.data)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n");
        return `[${messagesAgo} messages ago]\n${dataLines}`;
      }).join("\n---\n");

      historySection = `
Here are the previous InfoBoard states for reference. Use these to maintain consistency - values should only change if something happened in the story to change them:

${historyLines}

---
Now, based on what just happened in the most recent message, generate the CURRENT InfoBoard state:
`;
    }

    const basePrompt = prefs.promptMode === "custom" 
      ? (customPrompt || "").replace(IBS_MARKER, "").trim()
      : buildPromptFromSchema().replace(IBS_MARKER, "").trim();

    // Build perspective context
    const p = getChatParticipants();
    let perspectiveNote = "";
    if (p.isGroup && p.charNames.length > 0) {
      perspectiveNote = `\nThis is a group chat with characters: ${p.charNames.join(", ")}. The info board must describe the CHARACTER(S) (${p.charNames.join(", ")}), NOT the user${p.userName ? ` (${p.userName})` : ""}. Track the characters' states, emotions, and actions.`;
    } else if (p.charName) {
      perspectiveNote = `\nThe info board must describe the CHARACTER (${p.charName}), NOT the user${p.userName ? ` (${p.userName})` : ""}. Track ${p.charName}'s state, emotions, and actions.`;
    }

    return `${IBS_MARKER}
IMPORTANT: Output ONLY the info board below. Do NOT think, reason, or explain. Just fill in the values directly.${perspectiveNote}
${historySection}
${basePrompt}`;
  }

  // =========================
  // Manual Pull Generation
  // =========================
  // Resolve generation function - prefer generateRaw (doesn't touch chat/swipes)
  // Falls back to generateQuietPrompt if generateRaw isn't available
  function resolveGenerateFunction() {
    const context = getSTContext();
    // Prefer generateRaw - it doesn't corrupt swipes
    if (context?.generateRaw) {
      return { fn: context.generateRaw, type: "raw" };
    }
    if (typeof window.generateRaw === "function") {
      return { fn: window.generateRaw, type: "raw" };
    }
    // Fallback to generateQuietPrompt
    if (context?.generateQuietPrompt) {
      return { fn: context.generateQuietPrompt, type: "quiet" };
    }
    if (typeof window.generateQuietPrompt === "function") {
      return { fn: window.generateQuietPrompt, type: "quiet" };
    }
    return null;
  }

  // Build chat context messages from ST chat for use with generateRaw
  function buildChatContextMessages(maxMessages = 20) {
    const context = getSTContext();
    if (!context?.chat || context.chat.length === 0) return [];

    const messages = [];
    const chat = context.chat;
    // Take last N messages for context
    const start = Math.max(0, chat.length - maxMessages);

    for (let i = start; i < chat.length; i++) {
      const msg = chat[i];
      if (!msg || !msg.mes) continue;

      // Strip any existing infoboard blocks from the message to keep context clean
      let content = String(msg.mes);
      content = content.replace(/<info_board[^>]*>[\s\S]*?<\/info_board>/gi, "").trim();
      // Also strip code blocks that look like infoboards
      content = content.replace(/```[\s\S]*?```/g, (match) => {
        return looksLikeInfoBoard(match) ? "" : match;
      }).trim();

      if (!content) continue;

      messages.push({
        role: msg.is_user ? "user" : "assistant",
        content: content
      });
    }

    return messages;
  }

  // Restore profile with retry logic
  async function restoreProfileWithRetry(profileName, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[IBS] Restore attempt ${attempt}/${maxAttempts}: ${profileName}`);
      const switched = await switchProfile(profileName);
      if (switched) {
        const verified = await verifyProfile(profileName);
        if (verified) {
          console.log("[IBS] Profile restored and verified");
          return true;
        }
        console.warn("[IBS] Profile switched but verification failed, retrying...");
      }
      // Increasing delay between retries
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
    return false;
  }

  async function manualPullInfoBoard() {
    if (isGenerating) return;

    const context = getSTContext();
    if (!context) {
      console.warn("[IBS] SillyTavern API not available for manual pull");
      showToast("SillyTavern API not available", "error");
      return;
    }

    // Resolve generate function early so we fail fast
    const gen = resolveGenerateFunction();
    if (!gen) {
      showToast("No generation function available - is SillyTavern fully loaded?", "error");
      return;
    }

    isGenerating = true;
    updateGenerateButton(true);

    // Temporarily block auto-injection while we're switched to a different profile
    const savedAutoInject = prefs.autoInjectPrompt;
    let originalProfile = "";
    let switchedProfile = false;

    try {
      // If using a specific profile, switch to it
      if (prefs.manualProfile && prefs.manualProfile !== "") {
        // Validate that the target profile still exists
        if (availableProfiles.length > 0) {
          const targetLower = prefs.manualProfile.trim().toLowerCase();
          const exists = availableProfiles.some(p => p.trim().toLowerCase() === targetLower);
          if (!exists) {
            // Refresh profiles in case list is stale
            await fetchConnectionProfiles();
            const stillMissing = !availableProfiles.some(p => p.trim().toLowerCase() === targetLower);
            if (stillMissing) {
              throw new Error(`Profile "${prefs.manualProfile}" not found. Check Settings > General.`);
            }
          }
        }

        originalProfile = await getCurrentProfile();
        console.log("[IBS] Original profile:", originalProfile);
        console.log("[IBS] Target profile:", prefs.manualProfile);

        // Case-insensitive comparison to see if we need to switch
        const alreadyOnTarget = originalProfile &&
          originalProfile.trim().toLowerCase() === prefs.manualProfile.trim().toLowerCase();

        if (!alreadyOnTarget) {
          // Disable auto-inject so if any other request fires during our switch,
          // it won't inject the infoboard prompt using the wrong profile
          prefs.autoInjectPrompt = false;

          const switched = await switchProfile(prefs.manualProfile);
          if (switched) {
            switchedProfile = true;
            console.log("[IBS] Switched to target profile");
          } else {
            console.warn("[IBS] Failed to switch to target profile, generating with current");
            showToast("Could not switch profile - using current", "warning");
          }
        } else {
          console.log("[IBS] Already on target profile, no switch needed");
        }
      }

      // Build prompt with history
      const ibsPrompt = buildManualPullPrompt();
      let result;

      if (gen.type === "raw") {
        // generateRaw: doesn't touch chat/swipes at all
        // Build a messages array: chat context + infoboard instruction
        const chatMessages = buildChatContextMessages(20);
        const prompt = [
          ...chatMessages,
          { role: "user", content: ibsPrompt }
        ];

        // Build system prompt with character context
        const participants = getChatParticipants();
        let sysPrompt = "You generate structured info boards for roleplay. Output ONLY the info board in the exact format requested. Do NOT explain, reason, or think step-by-step. Respond immediately with the key-value pairs.";
        if (participants.isGroup && participants.charNames.length > 0) {
          sysPrompt += ` The info board tracks the CHARACTERS (${participants.charNames.join(", ")}), NOT the user${participants.userName ? ` (${participants.userName})` : ""}. All fields describe the characters' current state.`;
        } else if (participants.charName) {
          sysPrompt += ` The info board tracks the CHARACTER (${participants.charName}), NOT the user${participants.userName ? ` (${participants.userName})` : ""}. All fields describe ${participants.charName}'s current state.`;
        }

        console.log("[IBS] Calling generateRaw with", prompt.length, "messages...");
        result = await gen.fn({
          prompt,
          systemPrompt: sysPrompt
        });
      } else {
        // generateQuietPrompt fallback: takes { quietPrompt } object
        console.log("[IBS] Calling generateQuietPrompt (fallback)...");
        result = await gen.fn({ quietPrompt: ibsPrompt });
      }

      console.log("[IBS] Result type:", typeof result, "length:", String(result || "").length);

      if (!result || (typeof result === "string" && result.trim() === "")) {
        throw new Error(
          "Empty response from model. If using a reasoning model (DeepSeek R1, etc.), " +
          "it may have spent all tokens on thinking. Try a non-reasoning model or increase max tokens."
        );
      }

      // Parse the result - try multiple extraction methods
      let infoBoardText = typeof result === "string" ? result : String(result);

      // Method 1: Extract from <info_board> tags
      const tagMatch = infoBoardText.match(/<info_board[^>]*>([\s\S]*?)<\/info_board>/i);
      if (tagMatch) {
        console.log("[IBS] Found <info_board> tags");
        infoBoardText = tagMatch[1];
      }

      // Method 2: Extract from code block
      const codeMatch = infoBoardText.match(/```(?:\w*\n)?([\s\S]*?)```/);
      if (codeMatch) {
        console.log("[IBS] Found code block");
        infoBoardText = codeMatch[1];
      }

      // Method 3: Parse key-value lines
      let data = parseKeyValueLines(infoBoardText.trim());
      console.log("[IBS] Parsed data keys:", Object.keys(data));

      // Fallback: try parsing the entire raw result
      if (Object.keys(data).length === 0 && typeof result === "string") {
        data = parseKeyValueLines(result.trim());
      }

      // Fallback: flexible extraction for lines matching "Key: Value"
      if (Object.keys(data).length === 0) {
        const lines = (typeof result === "string" ? result : "").split("\n");
        for (const line of lines) {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0 && colonIdx < 30) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            if (key && value && /^[A-Z][a-zA-Z\s]*$/.test(key)) {
              data[key.trim()] = value;
            }
          }
        }
      }

      if (Object.keys(data).length === 0) {
        // Log enough to debug but not spam the console
        const preview = String(result || "").slice(0, 500);
        console.error("[IBS] Failed to parse InfoBoard. Response preview:", preview);
        throw new Error("Could not parse InfoBoard from response. Check browser console (F12) for raw output.");
      }

      // Store on last bot message
      const lastBotIndex = getLastBotMessageIndex();
      if (lastBotIndex >= 0) {
        storeInfoBoardOnMessage(lastBotIndex, data);
      }

      // Update display
      lastDetectedKeys = Object.keys(data).sort((a, b) => a.localeCompare(b));
      renderBoard(data);
      setCacheForActive(data);

      showToast("InfoBoard generated!", "success");

    } catch (err) {
      console.error("[IBS] Manual pull error:", err);
      showToast(`Generation failed: ${err.message}`, "error");
    } finally {
      // Always restore auto-inject setting first
      prefs.autoInjectPrompt = savedAutoInject;

      // Restore original profile if we switched
      if (switchedProfile && originalProfile) {
        try {
          console.log("[IBS] Restoring original profile:", originalProfile);
          const restored = await restoreProfileWithRetry(originalProfile);
          if (!restored) {
            console.error("[IBS] CRITICAL: Could not restore profile to:", originalProfile);
            showToast(`Warning: Could not restore profile to "${originalProfile}". Please switch manually!`, "error");
          }
        } catch (restoreErr) {
          console.error("[IBS] Profile restore threw:", restoreErr);
          showToast(`Warning: Could not restore profile. Please switch manually!`, "error");
        }
      }

      // These MUST always execute regardless of profile restore outcome
      isGenerating = false;
      updateGenerateButton(false);
    }
  }

  function showToast(message, type = "info") {
    // Try to use ST's toast if available
    const context = getSTContext();
    if (context?.toastr) {
      if (type === "error") context.toastr.error(message);
      else if (type === "warning") context.toastr.warning(message);
      else if (type === "success") context.toastr.success(message);
      else context.toastr.info(message);
      return;
    }

    // Fallback: simple toast
    const bgColors = {
      error: "rgba(255,80,80,0.9)",
      warning: "rgba(255,180,50,0.9)",
      success: "rgba(74,200,120,0.9)",
      info: "rgba(74,163,255,0.9)"
    };
    const toast = el("div", {
      class: "ibs-toast",
      style: `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        background: ${bgColors[type] || bgColors.info};
        color: white;
        border-radius: 8px;
        z-index: 99999;
        font-size: 13px;
      `
    }, [message]);

    document.body.append(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // =========================
  // UI (HUD)
  // =========================
  let root, panel, content, generateBtn;
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

    applyPanelOpacity();

    // Create generate button (for manual mode)
    generateBtn = el("button", { 
      class: "ibs-mini ibs-generate-btn", 
      title: "Generate InfoBoard",
      onclick: manualPullInfoBoard 
    }, ["📥"]);

    const header = el("div", { class: "ibs-header" }, [
      el("div", { class: "ibs-titlewrap" }, [
        el("div", { class: "ibs-title" }, ["Current State"]),
        el("div", { class: "ibs-subtitle", id: "ibs-subtitle" }, [
          prefs.pullMode === "manual" ? "Manual mode" : "Auto mode"
        ]),
      ]),
      el("div", { class: "ibs-actions" }, [
        generateBtn,
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
    updateGenerateButtonVisibility();
  }

  function updateGenerateButton(loading = false) {
    if (!generateBtn) return;
    generateBtn.textContent = loading ? "⏳" : "📥";
    generateBtn.disabled = loading;
    generateBtn.style.opacity = loading ? "0.5" : "1";
  }

  function updateGenerateButtonVisibility() {
    if (!generateBtn) return;
    generateBtn.style.display = prefs.pullMode === "manual" ? "" : "none";
    
    // Update subtitle
    const subtitle = document.getElementById("ibs-subtitle");
    if (subtitle) {
      subtitle.textContent = prefs.pullMode === "manual" ? "Manual mode" : "Auto mode";
    }
  }

  function renderOpenState() {
    root.classList.toggle("open", prefs.open);
  }

  function applyPanelOpacity() {
    if (panel) {
      panel.style.backgroundColor = `rgba(16,16,16,${prefs.panelOpacity})`;
    }
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
    // Try multiple selectors - mobile ST may use different markup
    const selectors = [
      ".mes pre code",           // Standard desktop
      ".mes code",               // Code without pre wrapper
      ".mes .mes_text pre code", // Nested in mes_text
      ".mes .mes_text code",     // Nested code without pre
      ".mes_block pre code",     // Alternative block structure
    ];

    for (const selector of selectors) {
      const codes = Array.from(document.querySelectorAll(selector));
      for (let i = codes.length - 1; i >= 0; i--) {
        const codeEl = codes[i];
        const t = (codeEl.textContent || "").trim();
        if (looksLikeInfoBoard(t)) return codeEl;
      }
    }
    return null;
  }

  function hideOrShowBoardInChat(codeEl) {
    if (!codeEl) return;
    const pre = codeEl.closest("pre");
    if (!pre) return;
    pre.style.display = prefs.hideInChat ? "none" : "";
  }

  // Try to extract infoboard data directly from the raw message text (ST chat array)
  // This works even if DOM rendering strips or reformats the content
  function parseInfoBoardFromMessageData() {
    const context = getSTContext();
    if (!context?.chat) return null;

    // Check last few bot messages (most recent first)
    for (let i = context.chat.length - 1; i >= Math.max(0, context.chat.length - 5); i--) {
      const msg = context.chat[i];
      if (msg.is_user || !msg.mes) continue;

      let text = String(msg.mes);

      // Try extracting from <info_board> tags
      const tagMatch = text.match(/<info_board[^>]*>([\s\S]*?)<\/info_board>/i);
      if (tagMatch) text = tagMatch[1];

      // Try extracting from code block
      const codeMatch = text.match(/```(?:\w*\n)?([\s\S]*?)```/);
      if (codeMatch) text = codeMatch[1];

      const data = parseKeyValueLines(text.trim());
      if (looksLikeInfoBoard(text) && Object.keys(data).length > 0) {
        return { data, messageIndex: i };
      }
    }
    return null;
  }

  function refreshFromChat() {
    activeKey = getActiveCharacterKey();

    // In auto mode, always try DOM first (that's where fresh auto-generated boards are)
    // In manual mode, prefer metadata (that's where manualPullInfoBoard stores data)

    // Step 1: Try to find an infoboard in the chat DOM
    const codeEl = getLatestInfoBoardCodeBlock();

    if (codeEl) {
      const boardText = (codeEl.textContent || "").trim();
      const data = parseKeyValueLines(boardText);

      if (Object.keys(data).length > 0) {
        lastDetectedKeys = Object.keys(data).sort((a, b) => a.localeCompare(b));
        renderBoard(data);
        setCacheForActive(data);
        hideOrShowBoardInChat(codeEl);

        // Store in metadata for persistence (auto mode only, manual stores its own)
        if (prefs.pullMode === "auto" && hasSTAPI()) {
          const lastBotIndex = getLastBotMessageIndex();
          if (lastBotIndex >= 0) {
            const ctx = getSTContext();
            const msg = ctx?.chat?.[lastBotIndex];
            if (msg && !msg.extra?.infoboard?.data) {
              storeInfoBoardOnMessage(lastBotIndex, data);
            }
          }
        }
        return;
      }
    }

    // Step 2: DOM didn't have it - try parsing directly from raw message data
    // This handles mobile/alternative renderers that may not create <pre><code> elements
    if (hasSTAPI()) {
      const rawResult = parseInfoBoardFromMessageData();
      if (rawResult) {
        lastDetectedKeys = Object.keys(rawResult.data).sort((a, b) => a.localeCompare(b));
        renderBoard(rawResult.data);
        setCacheForActive(rawResult.data);
        // Hide the DOM element if it exists in some form
        if (codeEl) hideOrShowBoardInChat(codeEl);

        // Store in metadata
        if (prefs.pullMode === "auto") {
          const ctx = getSTContext();
          const msg = ctx?.chat?.[rawResult.messageIndex];
          if (msg && !msg.extra?.infoboard?.data) {
            storeInfoBoardOnMessage(rawResult.messageIndex, rawResult.data);
          }
        }
        return;
      }
    }

    // Step 3: Try message metadata (manual mode stores here)
    if (hasSTAPI()) {
      const storedBoards = getStoredInfoBoardsFromChat();
      if (storedBoards.length > 0) {
        const latest = storedBoards[storedBoards.length - 1];
        renderBoard(latest.data);
        lastDetectedKeys = Object.keys(latest.data).sort((a, b) => a.localeCompare(b));
        if (codeEl) hideOrShowBoardInChat(codeEl);
        return;
      }
    }

    // Step 4: Nothing found anywhere - show cache or empty
    const cached = getCacheForKey(activeKey);
    if (cached) renderBoard(cached);
    else renderBoard(null);
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

    // Also hook into SillyTavern's event system as backup
    // This is more reliable than MutationObserver, especially on mobile
    try {
      const context = getSTContext();
      if (context?.eventSource) {
        const events = context.event_types || {};
        // MESSAGE_RECEIVED fires when a new bot message is fully rendered
        const messageEvents = [
          events.MESSAGE_RECEIVED,
          events.MESSAGE_UPDATED,
          events.MESSAGE_SWIPED,
          events.CHAT_CHANGED,
          events.CHARACTER_MESSAGE_RENDERED,
          "message_received",
          "chatLoaded",
        ].filter(Boolean);

        for (const evt of messageEvents) {
          context.eventSource.on(evt, () => {
            // Slight delay to let DOM fully render
            setTimeout(() => refreshFromChat(), 150);
          });
        }
        console.log("[IBS] Hooked into ST events:", messageEvents);
      }
    } catch (e) {
      console.warn("[IBS] Could not hook ST events:", e);
    }

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
        // When character changes, refresh from chat/metadata
        refreshFromChat();
      }
    }, 600);
  }

  // =========================
  // Settings modal (visual editor)
  // =========================
  function closeSettings() {
    if (settingsModal) {
      const panel = document.getElementById('ibs-panel');
      if (panel) {
        panel.style.display = '';
      }
      
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

    // Fetch profiles when opening settings
    fetchConnectionProfiles();

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
    
    document.body.append(overlay);
    
    setTimeout(() => {
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
      updateGenerateButtonVisibility();
      renderTab();
    }

    // --- General tab UI ---
    function renderGeneral() {
      body.innerHTML = "";

      const row1 = el("div", { class: "ibs-form" });

      // NEW: Pull Mode selector
      row1.append(
        selectRow("Pull Mode", prefs.pullMode, [
          { value: "auto", label: "Auto (inject into generation)" },
          { value: "manual", label: "Manual (click to generate)" }
        ], (v) => {
          prefs.pullMode = v;
          savePrefs();
          updateGenerateButtonVisibility();
          renderGeneral(); // Re-render to show/hide relevant options
        }),

        el("div", { class: "ibs-hint", style: "margin-bottom: 12px;" }, [
          prefs.pullMode === "auto" 
            ? "Auto mode injects InfoBoard prompt into every generation. The bot includes InfoBoard in its response."
            : "Manual mode lets you click a button to generate InfoBoard separately, using any connection profile you choose."
        ])
      );

      // Auto mode options
      if (prefs.pullMode === "auto") {
        row1.append(
          toggleRow("Auto-inject prompt", prefs.autoInjectPrompt, (v) => {
            prefs.autoInjectPrompt = v;
            savePrefs();
          }, "Adds InfoBoard instructions to each generation."),

          selectRow("Inject role", prefs.injectRole, [
            { value: "system", label: "System (recommended)" },
            { value: "user", label: "User (try if ignored)" }
          ], (v) => {
            prefs.injectRole = v;
            savePrefs();
          })
        );
      }

      // Manual mode options
      if (prefs.pullMode === "manual") {
        // Profile selector - show dropdown if profiles found, text input otherwise
        if (availableProfiles.length > 0) {
          const profileOptions = [
            { value: "", label: "Use current profile" },
            ...availableProfiles.map(p => ({ value: p, label: p }))
          ];

          row1.append(
            selectRow("Connection Profile", prefs.manualProfile, profileOptions, (v) => {
              prefs.manualProfile = v;
              savePrefs();
            })
          );
        } else {
          // No profiles detected - show text input
          row1.append(
            textRow("Connection Profile (type name)", prefs.manualProfile || "", (v) => {
              prefs.manualProfile = v.trim();
              savePrefs();
            }),
            
            el("div", { class: "ibs-hint", style: "margin-bottom: 8px; color: rgba(255,200,100,0.85);" }, [
              "No profiles auto-detected. Leave empty to use current, or type a profile name exactly as it appears in SillyTavern."
            ])
          );
        }

        row1.append(
          el("div", { class: "ibs-hint", style: "margin-bottom: 12px;" }, [
            "Choose a different profile to generate InfoBoard (e.g., use a cheaper/faster model like DeepSeek)."
          ]),

          // History limit
          selectRow("Include history", String(prefs.historyLimit), [
            { value: "all", label: "All previous InfoBoards" },
            { value: "20", label: "Last 20" },
            { value: "10", label: "Last 10" },
            { value: "5", label: "Last 5" },
            { value: "0", label: "None (fresh each time)" }
          ], (v) => {
            prefs.historyLimit = v === "all" ? "all" : parseInt(v, 10);
            savePrefs();
          }),

          el("div", { class: "ibs-hint", style: "margin-bottom: 12px;" }, [
            "More history = better consistency. The LLM sees how values changed over time."
          ])
        );

        // Refresh profiles button
        const refreshBtn = el("button", { 
          class: "ibs-btn",
          onclick: async () => {
            refreshBtn.textContent = "Loading...";
            await fetchConnectionProfiles();
            renderGeneral();
          }
        }, ["↻ Refresh profiles"]);

        row1.append(refreshBtn);
      }

      // Common options
      row1.append(
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

        textRow("Extras section title", layoutConfig.extrasSectionTitle || "Extra", (v) => {
          layoutConfig.extrasSectionTitle = v || "Extra";
          saveLayout();
          refreshFromChat();
        }),

        sliderRow("Panel opacity", prefs.panelOpacity, 0, 1, 0.01, (v) => {
          prefs.panelOpacity = v;
          savePrefs();
          applyPanelOpacity();
        }, `${Math.round(prefs.panelOpacity * 100)}%`)
      );

      body.append(row1);
    }

    // --- Layout tab UI (visual editor) ---
    function renderLayout() {
      body.innerHTML = "";

      const wrap = el("div", { class: "ibs-layout-wrap" });

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

    function openFieldEditor(sectionIndex, fieldIndex, mode) {
      const sec = layoutConfig.sections[sectionIndex];
      if (!sec) return;

      const current = (mode === "edit" && fieldIndex >= 0) ? sec.fields[fieldIndex] : {
        key: "",
        label: "",
        display: "text",
        subtle: false
      };

      const dialog = el("div", { class: "ibs-dialog-overlay" });
      dialog.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 2147483649 !important;
        background: rgba(0,0,0,0.7) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 20px !important;
        width: 100vw !important;
        height: 100vh !important;
        overflow-y: auto !important;
      `;

      const dialogBox = el("div", { class: "ibs-dialog", onclick: (ev) => ev.stopPropagation() });
      dialogBox.style.cssText = `
        position: relative !important;
        z-index: 2147483650 !important;
        max-height: 80vh !important;
        max-width: 90vw !important;
        width: 560px !important;
        margin: auto !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
      `;

      dialog.append(dialogBox);
      dialog.addEventListener("click", () => dialog.remove());

      const box = dialogBox;

      const title = el("div", { class: "ibs-dialog-title" }, [mode === "edit" ? "Edit info" : "Add info"]);
      const hint = el("div", { class: "ibs-hint" }, [
        'Key must match what the bot outputs (e.g. "Posture"). Display type controls how it looks in the sidebar.'
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
      preview.textContent = prefs.pullMode === "manual" 
        ? buildManualPullPrompt() 
        : getEffectiveInjectionPrompt();

      body.append(modeRow, explain);

      if (prefs.promptMode === "custom") {
        const area = el("textarea", { class: "ibs-textarea" });
        area.value = customPrompt || "";
        area.addEventListener("input", () => {
          customPrompt = area.value;
          savePrompt();
          preview.textContent = prefs.pullMode === "manual" 
            ? buildManualPullPrompt() 
            : getEffectiveInjectionPrompt();
        });

        body.append(
          labeled("Custom prompt", area),
          labeled("Injection preview", preview)
        );
      } else {
        body.append(labeled("Injection preview", preview));
      }

      // Info about history in manual mode
      if (prefs.pullMode === "manual") {
        const historyInfo = el("div", { class: "ibs-hint", style: "margin-top: 12px;" }, [
          `In Manual mode, the prompt will include ${prefs.historyLimit === "all" ? "ALL" : prefs.historyLimit} previous InfoBoard(s) for context.`
        ]);
        body.append(historyInfo);
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

    function sliderRow(labelText, value, min, max, step, onChange, displayValue) {
      const row = el("div", { class: "ibs-toggle-row" });

      const left = el("div", { class: "ibs-toggle-left" }, [
        el("div", { class: "ibs-toggle-title" }, [labelText]),
        el("div", { class: "ibs-toggle-hint" }, [displayValue || String(value)])
      ]);

      const slider = el("input", { 
        type: "range", 
        min: String(min), 
        max: String(max), 
        step: String(step),
        value: String(value),
        class: "ibs-range-slider"
      });
      
      slider.addEventListener("input", () => {
        const val = parseFloat(slider.value);
        const display = displayValue ? `${Math.round(val * 100)}%` : String(val);
        left.querySelector(".ibs-toggle-hint").textContent = display;
        onChange(val);
      });

      const right = el("div", { class: "ibs-slider-wrap" }, [slider]);

      row.append(left, right);
      return row;
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
  // Injection via fetch wrapper (Auto mode only)
  // =========================
  let fetchWrapped = false;
  let originalFetch = null;

  function shouldInterceptUrl(url) {
    const u = String(url || "").toLowerCase();

    // Must be an API path
    if (!u.includes("/api/")) return false;

    // Skip image generation endpoints
    if (u.includes("/sdapi/") || u.includes("/comfyui") || u.includes("/diffusion") ||
        u.includes("/dall-e") || u.includes("/dalle") || u.includes("/stability") ||
        u.includes("/image-gen") || u.includes("/image_gen")) {
      return false;
    }

    // Intercept text generation endpoints
    return (
      u.includes("generate") ||
      u.includes("chat") ||
      u.includes("completion") ||
      u.includes("openai") ||
      u.includes("textgen") ||
      u.includes("backends")
    );
  }

  function injectIntoPayload(obj) {
    // Only inject in Auto mode with auto-inject enabled
    // Also skip if we're mid-generation (profile may be switched to infoboard API)
    if (prefs.pullMode !== "auto" || !prefs.autoInjectPrompt || isGenerating) {
      console.log("[IBS] Skipping injection - mode:", prefs.pullMode, "autoInject:", prefs.autoInjectPrompt, "isGenerating:", isGenerating);
      return { obj, injected: false };
    }
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

        console.log("[IBS] Intercepted fetch:", reqUrl);

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
        console.log("[IBS] Injection result:", injected);

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

    // Fetch profiles on boot (async, non-blocking)
    fetchConnectionProfiles();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshFromChat();
    });

    console.log("[IBS] InfoBoard Sidebar loaded. Mode:", prefs.pullMode);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
