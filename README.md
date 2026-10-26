# Mika Planner (phase 1 prototype)

A life planner you talk to through an animated anime character. Mika is a supportive coach who can read and add to your
iPhone calendar, set reminders, and keep notes, and she reacts to every reply with a facial expression and a gesture.

```
app/      Expo (React Native) app: chat screen, 3D character, on-device tools, SQLite
server/   Small Node server that holds your Anthropic API key and talks to Claude
```

## How it works

1. You type a message in the app. The app sends the conversation and your profile to the server on your Mac.
2. The server asks Claude (`claude-opus-5-5`). Claude either replies, or asks to use a tool, such as "list calendar events".
3. Tools run **on your phone**, because that's where your calendar, reminders and notes are. The app runs the tool and sends
   the result back through the server, and this repeats until Claude replies.
4. Every final reply is structured JSON: `{ "text", "emotion", "gesture" }`. The app shows the text, sets the character's face
   (for example `happy`, which maps to the VRM "happy" expression), and plays the gesture (`wave`, `nod`, `cheer`, and so on).

Your API key stays in `server/.env` on your Mac. It is never put inside the app. Notes, reminders, your profile and the chat
history are stored only on the phone, in SQLite.

The character is a free sample VRM model rendered with three.js and three-vrm inside a WebView. It breathes, blinks, sways
a little, and moves its mouth while a reply appears.

---

## Run it on your iPhone (step by step)

You need:

- Your Mac and iPhone on the **same Wi-Fi network**.
- The **Expo Go** app on your iPhone (free from the App Store).
- An **Anthropic API key** from https://console.anthropic.com (Settings → API keys).
- **Node.js 22**. You already have `nvm`, and this repo's `.nvmrc` tells it which version to use.

Each command below goes in the **Terminal** app. Run one at a time: copy it, paste it, press Return, and wait for it to
finish before running the next.

### 1. Start the server (Terminal window #1)

Go to the server folder:

```bash
cd ~/Documents/GitHub/PA/server
```

Switch to Node 22 (if it says "not installed", run `nvm install 22` and then this again):

```bash
nvm use 22
```

Install the server's packages (only needed the first time, and after pulling new changes):

```bash
npm install
```

Create your secrets file from the example:

```bash
cp .env.example .env
```

Open it in TextEdit:

```bash
open -e .env
```

In TextEdit, paste your key right after `ANTHROPIC_API_KEY=` (no spaces, no quotes), then save (⌘S) and close it.
`.env` is listed in `.gitignore`, so git will never commit it.

Start the server:

```bash
npm run dev
```

You should see something like:

```
Companion server running on port 8787
  Phone URL: http://192.168.1.77:8787
```

Leave this window open. The server stops when you close it or press Ctrl+C.

The first time, macOS may ask whether to allow `node` to accept incoming network connections. Click **Allow**, or the
phone can't reach it.

### 2. Start the app (Terminal window #2)

Open a second Terminal window or tab (⌘T), then:

```bash
cd ~/Documents/GitHub/PA/app
```

```bash
nvm use 22
```

```bash
npm install
```

```bash
npx expo start
```

A QR code appears. On your iPhone, open the **Camera** app, point it at the QR code, and tap the "Open in Expo Go"
banner.

The app finds the server automatically: it uses the same Mac address Expo Go is already connected to, on port 8787.

### 3. Try it

1. When iOS asks to find devices on your **local network**, tap **Allow**. That's how the app reaches the server.
2. Tap **Profile** (top right). Fill in your name, goals and routines, then tap Save. Mika sees this with every message.
3. Try a few messages:
   - "What's on my calendar tomorrow?" (iOS asks for calendar access the first time)
   - "Add a 30-minute run on Thursday at 7am"
   - "Remind me to call mum in 10 minutes" (iOS asks for notification permission)
   - "Save a note: book ideas: Dune, Project Hail Mary, tag it books"
   - "What notes do I have about books?"
4. **New chat** (top left) clears the conversation. Your notes, reminders and calendar stay.

### Stopping and starting again later

Press Ctrl+C in both Terminal windows to stop. Next time, run only the `cd`, `nvm use 22` and `npm run dev` /
`npx expo start` steps. You don't need to run `npm install` or copy `.env` again.

---

## Troubleshooting

**"Can't reach the server at http://…:8787"**

- Check that the server window is still running and shows no errors.
- Check that the phone and Mac are on the same Wi-Fi network (not a guest network, and the phone isn't on mobile data).
- Allow local network access: iPhone **Settings → Privacy & Security → Local Network → Expo Go** should be on.
- Check the macOS firewall: **System Settings → Network → Firewall**. Either turn it off while testing, or allow incoming
  connections for `node`.
- If automatic detection picks the wrong address, set the server address yourself. In the `app` folder, create a file
  called `.env` that contains `EXPO_PUBLIC_SERVER_URL=http://192.168.1.77:8787` (use the "Phone URL" the server printed).
  Then stop `npx expo start` with Ctrl+C and run it again.

**"The server has no Anthropic API key" / "key is missing or invalid"**: open `server/.env` again and check the key. Then
stop the server with Ctrl+C and run `npm run dev` again.

**The character says "Couldn't load the character"**: the 3D model (about 10 MB) and three.js load from the internet the
first time, so the phone needs internet access.

**Expo Go says the project uses an unsupported SDK**: update Expo Go from the App Store. This project uses Expo SDK 58.

**`npm install` fails with `Cannot read properties of null (reading 'edgesOut')`**: this is an npm bug with optional
peer dependencies. The `.npmrc` file in each folder already works around it, so make sure you're inside `app/` or
`server/` when you run it.

---

## Customising

- **Your own character**: make a model in VRoid Studio (free) and export it as `.vrm`. Upload it somewhere that gives you a
  direct download link, then change `DEFAULT_MODEL_URL` in `app/src/character/characterHtml.ts`.
- **How emotions look**: edit `app/src/character/mapping.ts`.
- **How gestures move**: edit `GESTURE_DEFS` in `app/src/character/characterHtml.ts`.
- **Mika's personality**: edit `server/src/prompt.ts`.
- **Tools Claude can use**: the schemas are in `server/src/schema.ts`, and the code that runs on the phone is in `app/src/tools/`.

To tweak the character on your Mac without the phone, preview it in a browser (from the `app` folder):

```bash
npx tsx scripts/export-character-html.ts
```

Then serve it, because browsers block modules on `file://` pages:

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/character-preview.html#debug. The `#debug` part adds a button for every emotion and gesture.

## Checks

From `server/`:

```bash
npm run typecheck
```

```bash
npm test
```

From `app/`:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run lint
```

## Notes on the Claude setup

- Model `claude-opus-5-5`, adaptive thinking, effort `medium` (set in `server/src/claude.ts`; try `low` for snappier
  replies).
- Final replies use structured outputs (`output_config.format`), so every reply is valid `{text, emotion, gesture}` JSON.
- Tools use `strict: true`, so tool inputs always match their schemas.
- **Refusal fallback is on**: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). If a safety classifier
  declines a request, the API re-runs it on Anthropic's recommended fallback model. Remove those two lines in
  `server/src/claude.ts` if you don't want that.
- Prompt caching is on, so the tools, persona and earlier messages are cached between turns.
- The conversation history is only ever appended to. Thinking blocks go back to Claude exactly as received, which the API
  requires. Instead of trimming old messages, the app starts a fresh conversation after 200 messages. Long-term memory is
  phase 3.
- The server streams from Claude internally, which avoids timeouts on long turns, and sends the finished reply to the
  app. Showing text word-by-word on the phone can come with voice in phase 2.

## Roadmap

- **Phase 2, voice**: speech-to-text, Claude, anime-style text-to-speech, lip sync, and voice notes.
- **Phase 3, memory and proactivity**: update the profile after conversations, morning and evening check-ins, and web
  research.
- **Phase 4, app stores**: hosted backend, sign-in, subscriptions, privacy policy, and App Store review.
