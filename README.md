# InfoBoard Sidebar (SillyTavern Extension)

A lightweight, immersive **roleplay HUD** for SillyTavern.

InfoBoard Sidebar extracts a structured `<info_board>` from the model’s replies and displays it as a clean, narrative-focused sidebar instead of cluttering the chat.  
Designed for **story-driven RP**, not stats or DnD.

---

## ✨ Features

- Visual sidebar for RP state (“Current State” HUD)
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

Everything runs **locally in your browser**. No external requests.

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
3. Past the link and install. Easy!

---

## ⚙️ Usage

- The sidebar appears on the right as **Current State**
- Click `≡` to toggle visibility
- Use the `⋯` menu to:
  - Hide the InfoBoard from chat
  - Strip `[brackets]` in sidebar (not suggested as it might interfere with date)
  - Enable **Auto-inject InfoBoard prompt**

---

### Auto-inject prompt

When enabled, the extension automatically adds the InfoBoard instruction to outgoing generations, so you **don’t need to edit presets**. This is suggested as in the current status, extension might not be suitable for all InfoBoard prompts.

**Unless you want to use this, you can manually put the prompt from prompt.md into your own preset and turn this option off.**

---

## 🧠 How it works (short version)

- The model outputs an `<info_board>` inside a codeblock
- The extension:
  - Finds the latest valid InfoBoard
  - Parses key/value lines
  - Displays them in the sidebar
  - Caches the state per character
- Prompt injection (if enabled) is done by intercepting the outgoing request **locally**

---

## 📱 Mobile support

The panel respects:
- dynamic viewport height (`dvh`)
- safe-area insets (Android / iOS)
- bottom UI bars

You can scroll the full board without it being hidden.

---

## ⚠️ Notes

- This is a **third-party extension**
- SillyTavern does **not** auto-update it, I will. So I'm open to suggestions and feedbacks

---

## 💙 Credits

Created by **Carmenta** with the help of my beloved ChatGPT. So code might be bloated, oh well.