# InfoBoard Prompt

## Auto Mode (Default)

If you're using **Auto mode** and don't want auto-injection, paste the following into your preset or system prompt.

---

At the beginning of your next reply, write an informational board inside of `<info_board>` following the format below.  
Ensure that contents are always inside a codeblock.

```
<info_board>
Posture: [Sentence about the current appearance of agent, focusing on pose, action and clothing or nude state]  
Clothes: [Sentence about the clothes the agent is wearing right now.]  
Affinity: [# {{char}}'s aff value] (Word or phrase reflecting agent's feeling for {{USER}})  
Mood: [Agent's mood]  
Emoji: [Kaomoji that depict agent's current state]  
Thought: ["Agent's internal thought"]  
Arousal: [% Agent's arousal based on mood and stimulation agent receives] (Brief description)  
Location: [Agent's current location]  
Timezone: [24-hour time] [Weekday Month Day, Year] [Season]  
Objective: [Brief description of agent's current goal]
</info_board>
```

---

## Manual Mode

In **Manual mode**, the extension handles everything automatically:

1. You chat normally with your main LLM
2. Click the 📥 button when you want to update the InfoBoard
3. The extension sends a separate request to your chosen profile
4. Previous InfoBoard states are included for consistency

### How Manual Mode Prompt Works

The extension automatically builds a prompt that includes:

1. **History section** (if enabled): Previous InfoBoard states formatted like:
   ```
   [3 messages ago]
     Posture: Standing by the window
     Mood: Happy
     Arousal: 10%
   ---
   [2 messages ago]
     Posture: Sitting on the couch
     Mood: Shy
     Arousal: 15%
   ```

2. **Base prompt**: Your configured prompt (auto-generated or custom)

This helps the LLM maintain consistency - it can see that arousal went from 10% → 15% and continue the natural progression.

---

## Tips for Better Results

### General
- Keep descriptions concise but informative
- Use consistent formatting
- Include both current state AND recent changes

### For Arousal/Progress Tracking
- Always include the % value
- Add a brief description after the %
- Example: `Arousal: 25% - Slightly flushed, breathing quickened`

### For Mood
- Use comma-separated values for multiple moods
- The extension will display these as chips
- Example: `Mood: Happy, Curious, Slightly nervous`

### For Thoughts
- Use quotes around internal monologue
- Keep it character-appropriate
- Example: `Thought: "I wonder what they're thinking..."`

---

## Custom Prompt Tips

If using custom prompts in Manual mode:

1. Make sure output is in `<info_board>` tags with a codeblock inside
2. Use `Key: Value` format on each line
3. Keep keys consistent with your Layout configuration
4. The `<!-- IBS_PROMPT -->` marker is added automatically

Example custom prompt:
```
Based on the current story state, generate an InfoBoard reflecting the character's current situation.

<info_board>
```
Posture: [description]
Mood: [comma-separated moods]
Thought: ["internal monologue"]
Arousal: [X%] - [description]
Location: [where they are]
```
</info_board>
```
