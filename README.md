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

## ⚙️ Settings & Customization

InfoBoard Sidebar can be fully customized **without writing any code**.  
All options are available under **Settings (⚙)** and grouped into three tabs.

---

### 🧩 General

Controls how the InfoBoard behaves.

![General](https://i.ibb.co/jjQtCQj/General.jpg)

- **Auto-inject prompt**  
  Automatically adds InfoBoard instructions to each generation.  
  *(Recommended – ON by default)*

- **Inject role**  
  Chooses how the prompt is sent to the model.  
  - **System** (recommended)  
  - **User** (use if system prompts are ignored)

- **Hide board in chat**  
  Hides the `<info_board>` block from chat and shows it only in the sidebar.

- **Strip [brackets] around values**  
  Removes outer brackets for a cleaner look.

- **Extras section title**  
  Name of the fallback section used **when the model outputs additional info**.

---

### 🧱 Layout

Controls **what appears in the sidebar**.

![Layout](https://i.ibb.co/HDqJmGNG/Layout.jpg)

- **Categories**  
  Visual sections such as *Presence*, *Mind*, *Connection*, or *World*.  
  You can add, rename, delete, and reorder them.

- **Infos**  
  Individual data points inside categories (e.g. *Posture*, *Mood*, *Arousal*).  
  Infos can be added, edited, reordered, or removed.

- **Detected keys**  
  Shows keys detected from the model’s output.  
  Click one to instantly add it to the current category.

---

### ➕ Add / Edit Info

When adding or editing an Info:

![Add Info](https://i.ibb.co/HTx8qrST/Add-info.jpg)

- **Key**  
  Must match what the model outputs (e.g. `Posture`, `Mood`).

- **Label (optional)**  
  Display name shown in the sidebar (cosmetic only).

- **Display type**  
  Controls how the info is shown:
  - **Text**
  - **Text + Bar**
  - **Bar only**
  - **Chips** (comma-separated values)
  - **Monospace (thought)**

- **Subtle text**  
  Displays the value in a softer color.

---

### 🧠 Prompt

- **Auto (generated from layout)**  
  Builds the injected prompt automatically from your Layout.

- **Custom prompt**  
  Lets advanced users write their own prompt manually.

A live **Injection Preview** shows exactly what will be sent to the model.

---

### 📌 About “Extra”

If the model outputs keys that aren’t defined in your layout, they appear in the **Extras** section instead of being discarded.  
This helps prevent information loss and makes it easy to discover new infos to add later.


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