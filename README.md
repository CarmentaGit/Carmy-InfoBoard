# InfoBoard Sidebar (SillyTavern Extension)

A lightweight, immersive **roleplay HUD** for SillyTavern.

InfoBoard Sidebar extracts a structured `<info_board>` from the model's replies and displays it as a clean, narrative-focused sidebar instead of cluttering the chat.  
Designed for **story-driven RP**, not stats or DnD.

---

## ✨ Features

- Visual sidebar for RP state ("Current State" HUD)
- Sections instead of raw lists:
  - Presence
  - Mind
  - Connection
  - World
- Mood chips
- Arousal progress bar
- Per-character state caching (switch characters, state persists)
- Optional: hide the InfoBoard block from chat (suggested)
- Optional: auto-inject InfoBoard prompt (no preset editing required)
- Mobile-safe layout (avoids bottom UI overlap)

### 🆕 New in v2.0.0

- **Dual Pull Modes**: Choose between Auto (inject into generation) or Manual (generate on demand)
- **Connection Profile Support**: Use a different LLM for InfoBoard generation (e.g., use Gemini for RP, DeepSeek for tracking)
- **History Context**: Manual mode includes previous InfoBoards for better consistency
- **Message Metadata Storage**: InfoBoard data persists with chat saves
- **Improved Image Gen Compatibility**: No longer interferes with image generation requests

Everything runs **locally in your browser**. No external requests (except to your chosen API).

---

## 📸 Screenshots

### Sidebar HUD
![InfoBoard Sidebar](https://i.ibb.co/yBP0YNs6/sidebarhud.jpg)

### Options Menu
![Options Menu](https://i.ibb.co/tPFTqrw2/options-menu.jpg)

### Mobile View
![Mobile View](https://i.ibb.co/hJXxq0Kb/mobile2.gif)

---

## 📦 Installation (Manual)

1. Get the github link.
2. Go to Silly Tavern > Extensions > Install Extension
3. Paste the link and install. Easy!

---

## ⚙️ Usage

- The sidebar appears on the right as **Current State**
- Click `≡` to toggle visibility
- Use the `⚙` menu to configure settings

---

## 🔄 Pull Modes

InfoBoard now supports two pull modes:

### Auto Mode (Default)
- Injects InfoBoard prompt into every generation
- The bot includes InfoBoard data in its response
- Best for: Single-API setups, simple workflows

### Manual Mode
- Click the 📥 button to generate InfoBoard separately
- Uses `generateQuietPrompt` for background generation
- **Can use a different connection profile** than your main chat
- Includes historical InfoBoards for consistency
- Best for: Dual-API setups, using cheaper models for tracking

---

## 🔌 Connection Profiles (Manual Mode)

When using Manual mode, you can select a different connection profile:

1. Go to Settings → General
2. Set Pull Mode to **Manual**
3. Choose a Connection Profile from the dropdown
4. Click "↻ Refresh profiles" if your profiles don't appear

**Example Use Case:**
- Main chat: GPT-4 / Claude for quality roleplay
- InfoBoard: DeepSeek / Gemini Flash for cheap, fast state tracking

---

## 📊 History Context

In Manual mode, InfoBoard includes previous states in the generation prompt:

- **All**: Include all previous InfoBoards (recommended for long context models)
- **Last 20/10/5**: Limit to recent history
- **None**: Fresh generation each time

More history = better consistency. The LLM sees value progressions like:
```
Arousal: 10% → 15% → 20% → 25%
```

---

## 💾 Message Metadata Storage

InfoBoard data is now stored on each message's `extra.infoboard` field:

```javascript
message.extra.infoboard = {
  data: { Posture: "...", Mood: "...", ... },
  generatedAt: 1234567890,
  profile: "DeepSeek-Chat"
}
```

This means:
- ✅ Data persists with chat saves
- ✅ Survives page refresh
- ✅ Tied to specific messages
- ✅ Can be used for future features (time travel, trends)

---

## ⚙️ Settings & Customization

All options are available under **Settings (⚙)** and grouped into three tabs.

### 🧩 General

- **Pull Mode**: Auto (inject) or Manual (on-demand)
- **Connection Profile** (Manual only): Choose API for InfoBoard generation
- **Include History** (Manual only): How many previous InfoBoards to include
- **Auto-inject prompt** (Auto only): Add instructions automatically
- **Inject role**: System or User
- **Hide board in chat**: Show only in sidebar
- **Strip [brackets]**: Remove outer brackets
- **Panel opacity**: Adjust transparency

### 🧱 Layout

- **Categories**: Visual sections (Presence, Mind, etc.)
- **Infos**: Individual data points (Posture, Mood, etc.)
- **Detected keys**: Quick-add from model output

### 🧠 Prompt

- **Auto mode**: Generated from your Layout
- **Custom mode**: Write your own prompt
- **Preview**: See exactly what will be sent

---

## 📱 Mobile support

The panel respects:
- dynamic viewport height (`dvh`)
- safe-area insets (Android / iOS)
- bottom UI bars

You can scroll the full board without it being hidden.

---

## 🔧 Troubleshooting

### Manual mode: "SillyTavern API not available"
- Make sure you're running a recent version of SillyTavern
- The extension needs access to `SillyTavern.getContext()`

### Profiles not showing up
- Click "↻ Refresh profiles" in settings
- Make sure you have connection profiles configured in SillyTavern

### InfoBoard not generating in Manual mode
- Check browser console for errors
- Ensure your selected profile is properly configured
- Try with "Use current profile" first

### Image generation being affected
- v2.0.0 fixes this! The fetch wrapper now skips image generation endpoints

---

## ⚠️ Notes

- This is a **third-party extension**
- SillyTavern does **not** auto-update it
- Open to suggestions and feedback!

---

## 📝 Changelog

### v2.0.0
- Added Manual pull mode with `generateQuietPrompt`
- Added connection profile selection
- Added history context inclusion
- Added message metadata storage
- Fixed image generation interference
- Updated settings UI with mode-specific options

### v1.0.0
- Initial release
- Auto-inject mode
- Per-character caching
- Mobile-safe layout

---

## 💙 Credits

Created by **Carmenta** with help from Claude AI.
