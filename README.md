# Mika Planner (voice prototype)

A life planner you talk to, out loud, through an animated anime character. Mika is a supportive coach who can read and add
to your iPhone calendar, set alarms and reminders, and keep notes. She answers in her own voice, with a facial expression and a
gesture for every reply.

```
app/      Expo (React Native) app: voice screen, 2D Live2D character, on-device tools, SQLite
server/   Small Node server that holds your API keys and talks to Claude and Boson (voice)
```

## How it works

1. Tap the mic and talk. The app listens until you stop speaking, then sends the recording to the server on your Mac, which
   turns it into text with Boson AI's speech-to-text (`higgs-stt-3.1`).
2. The app sends that text, the conversation so far and your profile to the server, which asks Claude (`claude-opus-5-5`). Claude either replies, or asks to use a tool, such as "list calendar events".
3. Tools run **on your phone**, because that's where your calendar, reminders and notes are. The app runs the tool and sends
   the result back through the server, and this repeats until Claude replies.
4. Every final reply is structured JSON: `{ "text", "emotion", "gesture" }`. The server turns the text into Mika's voice with
   Boson's text-to-speech (`higgs-tts-3`, voice `chloe`). The app plays it, moves her mouth with the voice's volume, sets her
   face (for example `happy` raises her smile, eye squint and blush), and plays the gesture (`wave`, `nod`, `cheer`, and
   so on).
5. When she finishes talking, she listens again, hands-free, like a phone call. She greets you when the app opens and keeps
   listening until you pause her. Tap her while she's talking to cut her off.

Your API keys stay in `server/.env` on your Mac. It is never put inside the app. Notes, reminders, your profile and the chat
history are stored only on the phone, in SQLite. Recordings are sent to the server only to be transcribed, and aren't kept.

The character is **Hiyori**, a free official Live2D sample model, rendered in 2D with pixi-live2d-display inside a WebView.
She breathes, blinks, sways through her idle animations, and moves her mouth while she talks.

**Licences:** the Hiyori model is under the
[Live2D Free Material License](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html). The Live2D Cubism
Core runtime, which loads from Live2D's website, is under the
[Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).
Both are free for individuals and small businesses. Before you publish the app, check the
[SDK release licence](https://www.live2d.com/en/sdk/license/), which depends on your company's revenue.

---

## Run it on your iPhone (step by step)

You need:

- Your Mac and iPhone on the **same Wi-Fi network**.
- The **Expo Go** app on your iPhone (free from the App Store).
- An **Anthropic API key** from https://console.anthropic.com (Settings → API keys).
- A **Boson AI API key** from https://boson.ai/workspace, for speech-to-text and Mika's voice. It's free during Boson's
  preview, with rate limits.
- A free **Expo account** (https://expo.dev/signup). Expo Go only opens projects when you're signed in on both the Mac and
  the phone.
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

In TextEdit, paste your Anthropic key right after `ANTHROPIC_API_KEY=` and your Boson key right after `BOSON_API_KEY=` (no
spaces, no quotes), then save (⌘S) and close it.
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

Sign in to Expo (only needed once per Mac):

```bash
npx expo login
```

Also sign in to the **Expo Go** app on your iPhone, with the same account.

```bash
npx expo start
```

A QR code appears. On your iPhone, open the **Camera** app, point it at the QR code, and tap the "Open in Expo Go"
banner.

The app finds the server automatically: it uses the same Mac address Expo Go is already connected to, on port 8787.

### 3. Try it

1. When iOS asks to find devices on your **local network**, tap **Allow**. That's how the app reaches the server.
2. Tap **Profile** (top right). Fill in your name, goals and routines, then tap Save. Mika knows this every time you talk.
3. Allow the **microphone**. Mika greets you out loud and starts listening on her own, with no button to press. When the
   ring pulses, she's listening. Just talk, then pause, and she answers out loud and listens again. Try:
   - "What's on my calendar tomorrow?" (iOS asks for calendar access the first time)
   - "Add a thirty-minute run on Thursday at seven a.m."
   - "Remind me to stretch in two minutes" (iOS asks for notification permission)
   - "Save a note called book ideas: Dune and Project Hail Mary, tag it books"
   - "What notes do I have about books?"
   - "Wake me up at seven on weekdays", or to try it now, "set an alarm for two minutes from now"
4. Tap Mika while she's talking to cut her off. The **pause** button makes her wait quietly until you tap it again. She
   also pauses when you leave the app, and carries on when you come back. The screen stays on while she's listening.
5. **Start over** (top left) makes her forget the conversation. Your notes, reminders and calendar stay.

Each reply takes about 5–8 seconds after you stop talking: about half a second to understand you, 2–4 seconds for Claude
(more if she uses tools), and about 2 seconds to generate her voice.

### Stopping and starting again later

Press Ctrl+C in both Terminal windows to stop. Next time, run only the `cd`, `nvm use 22` and `npm run dev` /
`npx expo start` steps. You don't need to run `npm install` or copy `.env` again.

---

## Mika's actions (she can act things out)

Besides her expressions and quick gestures, Mika has a library of held **actions**, sorted into categories (rest,
affection, fun, reaction, greeting, focus, other). Ask her to "go to sleep", "close your eyes", "dance", "bow", "be shy"
or "look away", and she does it, with effects like floating Zzz, hearts or music notes. She stays in a held action
(like sleep) until something changes ("wake up!"); short ones (like a wink) end by themselves.

**She learns new ones.** Ask for something that isn't in the library ("do a big stretch", "salute", "sulk"). Claude
designs it from her face and body controls, saves it under a category on your phone, and performs it. Next time she
uses the saved version straight away. Learned actions she hasn't used for 60 days are forgotten. Built-ins stay.

- The built-in actions and the controls they can use are in `app/src/actions/library.ts`; learned ones are in the
  phone's SQLite database (`character_actions` table).
- To preview every action in a browser, run the character preview (see Customising); the `#debug` page has a ★ button
  for each built-in action.

## Alarms

iPhone apps can't set alarms in Apple's Clock app, so Mika has her own. Ask her ("wake me up at 6:30 tomorrow", "weekday
alarm at 7", "cancel my 7 o'clock alarm"), or tap **Alarms** (top right) to see, switch off or delete them.

- **With the app open** (for example on your nightstand, plugged in; the screen stays on): a looping chime plays **even in
  silent mode**, then Mika wakes you by voice. Tap **Stop**, or **Snooze** for 9 minutes.
- **With the app closed or in the background:** you get an alarm notification every minute for 4 minutes. Tap it, or its
  Stop/Snooze buttons, to open Mika. These use the normal notification sound, so **silent mode and Focus will mute them**.

For a real alarm clock, keep the app open overnight. An alarm that rings through silent mode with the app closed needs
Apple's AlarmKit (iOS 26), which only works in a standalone build of the app, not in Expo Go. That's planned for when the
app becomes a development build.

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

**Mika can't hear you, or stops listening right away**: allow the microphone in iPhone **Settings → Expo Go →
Microphone**. Speak normally, close to the phone. She waits for about a second of quiet before she answers.

**Mika mishears you, or answers in the wrong language**: set **Language you speak to Mika** in **Profile**. Speech
recognition is told that language, and Mika always answers in it. Short noises, hums and "mm-hmm"s are ignored.

**Mika's voice sounds different (more robotic) sometimes**: Boson's free preview is occasionally busy. The server retries
3 times, and if it still can't make her voice, the phone's built-in voice reads the reply so she never goes silent.

**You can't hear Mika**: check that the volume is up. If the server window shows `[audio]` or `Text-to-speech failed`
errors, check `BOSON_API_KEY` in `server/.env` and restart the server.

**"You need to be signed in to Expo Go and Expo CLI"**: run `npx expo login` on the Mac, and log in to the Expo Go app with
the same account.

**The character says "Couldn't load the character"**: the Live2D model (about 3 MB) and its runtime load from the internet the
first time, so the phone needs internet access.

**Expo Go says the project uses an unsupported SDK**: update Expo Go from the App Store. This project uses Expo SDK 58.

**`npm install` fails with `Cannot read properties of null (reading 'edgesOut')`**: this is an npm bug with optional
peer dependencies. The `.npmrc` file in each folder already works around it, so make sure you're inside `app/` or
`server/` when you run it.

---

## Customising

- **Your own character**: any Live2D Cubism 3, 4 or 5 model works. Commission one, buy one (for example on BOOTH or
  nizima), or try the other official samples (Mao, Haru, Natori, Rice and others). Host the model's folder somewhere with
  direct links, then point `DEFAULT_MODEL_URL` in `app/src/character/characterHtml.ts` at its `.model3.json`. Faces use
  Live2D's standard parameter names, so they carry over to most models. The arm gestures use Hiyori's second arm set, so
  they may need adjusting for another model.
- **How emotions look**: edit `app/src/character/mapping.ts`.
- **How gestures move**: edit `GESTURE_DEFS` in `app/src/character/characterHtml.ts`.
- **Mika's personality**: edit `server/src/prompt.ts`.
- **Mika's voice**: set `BOSON_VOICE` in `server/.env`, for example `chloe` (friendly), `nora` (calm) or `eleanor`
  (professional), then restart the server. Boson also supports custom and cloned voices.
- **How quickly she answers after you stop talking**: change `silenceEndMs` in `app/src/voice/vad.ts`.
- **Alarm sound**: edit and run `python3 scripts/make-alarm-sound.py` (from `app/`), or replace
  `app/assets/sounds/alarm.wav`.
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
- The server streams from Claude internally, which avoids timeouts on long turns. It starts generating the voice as soon
  as Claude's reply is ready, and the phone fetches it from `GET /audio/:id`.
- The prompt tells Claude its words will be spoken: short sentences, times written the way people say them, and a quick
  question back when speech recognition may have misheard.

## Roadmap

- **Phase 2, voice** (mostly done): hands-free conversation, Boson speech-to-text and voice, and volume-driven lip sync.
  Still to do: voice notes, cutting Mika off just by talking (not only by tapping), and starting playback while the rest
  of the reply is still being generated, to lower the wait.
- **Phase 3, memory and proactivity**: update the profile after conversations, morning and evening check-ins, and web
  research.
- **Phase 4, app stores**: hosted backend, sign-in, subscriptions, privacy policy, and App Store review.
