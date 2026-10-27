import type { CharacterAction } from "../actions/library";
import { EMOTION_FACES, GESTURES, IDLE_FACE } from "./mapping";

// "Mao", an official Live2D sample model (Live2D Free Material License).
const SAMPLES = "https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources";
export const DEFAULT_MODEL_URL = `${SAMPLES}/Mao/Mao.model3.json`;

// Live2D's runtime has to be loaded from Live2D's own site (it isn't on npm).
const CUBISM_CORE_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const PIXI_VERSION = "6.5.10";
const PIXI_LIVE2D_VERSION = "0.4.0";

// How Mika's controls (actions/library.ts) map onto this model's own Live2D
// parameters. To use a different model, write a rig like this for it.
type Range = [param: string, min: number, max: number];
type ArmSet = { part: string; Shoulder: Range; Elbow: Range; Wrist: Range; Hand: Range };
export type Rig = {
  frame: { heightScale: number; top: number }; // head-to-waist framing
  direct: Record<string, string>; // control -> parameter, same units
  scaled: Record<string, [param: string, factor: number]>; // control * factor -> parameter
  additive: string[]; // controls added on top of the idle motion
  mouthForm: { up: string; down: string; restUp: number }; // smile/frown split over two parameters
  lipSync: string;
  arms: Record<"L" | "R", { relaxed: ArmSet; raised: ArmSet }>;
  performances: Record<string, [group: string, index: number]>;
};

export const MAO_RIG: Rig = {
  frame: { heightScale: 1.55, top: 0.0 },
  direct: {
    AngleX: "ParamAngleX", AngleY: "ParamAngleY", AngleZ: "ParamAngleZ",
    BodyAngleX: "ParamBodyAngleX", BodyAngleY: "ParamBodyAngleY", BodyAngleZ: "ParamBodyAngleZ",
    BodyMoveX: "ParamAllX", BodyMoveY: "ParamAllY", BodyRotate: "ParamAllRotate",
    EyeLOpen: "ParamEyeLOpen", EyeROpen: "ParamEyeROpen", EyeLSmile: "ParamEyeLSmile", EyeRSmile: "ParamEyeRSmile",
    EyeLForm: "ParamEyeLForm", EyeRForm: "ParamEyeRForm", EyeBallX: "ParamEyeBallX", EyeBallY: "ParamEyeBallY",
    EyeSparkle: "ParamEyeEffect",
    BrowLY: "ParamBrowLY", BrowRY: "ParamBrowRY", BrowLAngle: "ParamBrowLAngle", BrowRAngle: "ParamBrowRAngle",
    BrowLForm: "ParamBrowLForm", BrowRForm: "ParamBrowRForm",
    MouthOpen: "ParamA", MouthI: "ParamI", MouthU: "ParamU", MouthE: "ParamE", MouthO: "ParamO",
    MouthPout: "ParamMouthAngry", Cheek: "ParamCheek",
  },
  scaled: {
    ShoulderL: ["ParamLeftShoulderUp", 10], ShoulderR: ["ParamRightShoulderUp", 10],
    PupilSmall: ["ParamEyeBallForm", -1], WandSpin: ["ParamWandRotate", 10],
  },
  additive: ["AngleX", "AngleY", "AngleZ", "BodyAngleX", "BodyAngleY", "BodyAngleZ", "BodyMoveX", "BodyMoveY", "BodyRotate", "EyeBallX", "EyeBallY"],
  mouthForm: { up: "ParamMouthUp", down: "ParamMouthDown", restUp: 1 },
  lipSync: "ParamA",
  arms: {
    L: {
      relaxed: { part: "PartArmLA", Shoulder: ["ParamArmLA01", -10, 30], Elbow: ["ParamArmLA02", -20, 10], Wrist: ["ParamArmLA03", -30, 30], Hand: ["ParamHandLA", -10, 0] },
      raised: { part: "PartArmLB", Shoulder: ["ParamArmLB01", -30, 30], Elbow: ["ParamArmLB02", -30, 30], Wrist: ["ParamArmLB03", -30, 10], Hand: ["ParamHandLB", -10, 10] },
    },
    R: {
      relaxed: { part: "PartArmRA", Shoulder: ["ParamArmRA01", -10, 30], Elbow: ["ParamArmRA02", -20, 10], Wrist: ["ParamArmRA03", -30, 30], Hand: ["ParamHandRA", -10, 0] },
      raised: { part: "PartArmRB", Shoulder: ["ParamArmRB01", -30, 30], Elbow: ["ParamArmRB02", -30, 30], Wrist: ["ParamArmRB03", -20, 20], Hand: ["ParamHandRB", -10, 10] },
    },
  },
  performances: { twirl: ["TapBody", 0], magic_heart: ["TapBody", 3], magic_heart_big: ["TapBody", 4], magic_trick: ["TapBody", 5] },
};

// The whole character renderer as one HTML page, loaded into a WebView.
// The app drives it by calling window.companion.react({...}),
// speak(ms) / mouth(level) and pose(action) via injectJavaScript; the page
// reports back with window.ReactNativeWebView.postMessage(JSON).
export function buildCharacterHtml(modelUrl: string = DEFAULT_MODEL_URL, debugActions: CharacterAction[] = [], rig: Rig = MAO_RIG): string {
  const config = JSON.stringify({ modelUrl, rig, faces: EMOTION_FACES, idleFace: IDLE_FACE, gestures: GESTURES, debugActions });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  #status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font: 15px -apple-system, system-ui, sans-serif; color: #7a6f9b; }
  #debug { position: absolute; left: 8px; bottom: 8px; display: none; flex-wrap: wrap; gap: 4px; max-width: 95%; }
  #debug button { font-size: 12px; padding: 4px 8px; }
  #fx { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
  .fx { position: absolute; font: 700 28px -apple-system, system-ui, sans-serif; color: #7c5cd6;
    animation: floatUp 2.4s ease-out forwards; text-shadow: 0 1px 2px rgba(255,255,255,0.8); }
  @keyframes floatUp {
    0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
    15% { opacity: 1; }
    100% { transform: translate(var(--dx), -110px) scale(1.15); opacity: 0; }
  }
</style>
<script src="${CUBISM_CORE_URL}"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi.js@${PIXI_VERSION}/dist/browser/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display@${PIXI_LIVE2D_VERSION}/dist/cubism4.min.js"></script>
</head>
<body>
<canvas id="stage"></canvas>
<div id="fx"></div>
<div id="status">Waking up…</div>
<div id="debug"></div>
<script>
(function () {
const CONFIG = ${config};
const RIG = CONFIG.rig;
const post = (msg) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };
const statusEl = document.getElementById("status");
window.onerror = (m) => post({ type: "error", message: String(m) });

// One clock for every animation; the #debug page can step it to test poses
// without waiting in real time.
let clockOffset = 0;
const clockMs = () => performance.now() + clockOffset;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeInOut = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
// envelope: ramps in over the first 20%, out over the last 25%
const env = (t) => Math.min(easeInOut(t / 0.2), easeInOut((1 - t) / 0.25));
const TAU = Math.PI * 2;
const ADDITIVE = new Set(RIG.additive);
// Shorthand face keys that mean "both sides".
const PAIRS = { EyeSmile: ["EyeLSmile", "EyeRSmile"], EyeForm: ["EyeLForm", "EyeRForm"], BrowY: ["BrowLY", "BrowRY"], BrowForm: ["BrowLForm", "BrowRForm"] };

// ---------- face (emotion), eased over time ----------
let targetFace = Object.assign({}, CONFIG.idleFace);
const face = {};
const FACE_KEYS = ["MouthForm", "EyeSmile", "EyeOpen", "EyeForm", "BrowY", "BrowForm", "Cheek", "MouthOpen", "MouthPout", "EyeBallY", "EyeSparkle", "PupilSmall"];
const rest = (key) => (key === "EyeOpen" ? 1 : 0);
FACE_KEYS.forEach((key) => { face[key] = rest(key); });
let faceResetAt = 0;
let speakUntil = 0, mouth = 0, mouthLevel = 0, mouthAt = -1e9;

// ---------- gestures: short movements, in Mika's controls ----------
// Each returns { set: {control: value}, add: {control: value} } for t in 0..1;
// "set" values are blended in with the gesture's envelope.
const GESTURE_DEFS = {
  nod: { dur: 1.2, pose: (t) => ({ add: { AngleY: -Math.sin(t * TAU * 2) * 14 * env(t), BodyAngleY: -2 * env(t) } }) },
  tilt_head: { dur: 2.0, pose: (t) => ({ add: { AngleZ: 16 * env(t), AngleX: 6 * env(t), BodyAngleZ: 2 * env(t) } }) },
  wave: { dur: 2.4, pose: (t) => {
    const swing = Math.sin(t * TAU * 3);
    return { set: { ArmLUp: 1, ArmLShoulder: 0.7, ArmLElbow: 0.3 + swing * 0.5, ArmLWrist: swing * 0.6, HandL: 1 }, add: { AngleZ: -6 * env(t) } };
  } },
  cheer: { dur: 1.8, pose: (t) => ({
    set: { ArmLUp: 1, ArmRUp: 1, ArmLShoulder: 1, ArmRShoulder: 1, ArmLElbow: 0.6, ArmRElbow: 0.6, HandL: 1, HandR: 1 },
    add: { AngleY: 8 * env(t), BodyMoveY: Math.abs(Math.sin(t * TAU * 2)) * 4 * env(t) },
  }) },
  think: { dur: 3.0, pose: (t) => ({
    set: { ArmLUp: 1, ArmLShoulder: 0, ArmLElbow: -1, ArmLWrist: 0, HandL: -1 }, // hand by her cheek
    add: { AngleX: 10 * env(t), AngleZ: 8 * env(t), AngleY: 6 * env(t), EyeBallX: 0.5 * env(t), EyeBallY: 0.6 * env(t) },
  }) },
};
let gesture = null; // { def, start }

// ---------- held actions from the action library ----------
let poseAction = null, poseTarget = 0, poseWeight = 0, poseStart = 0, poseEndAt = Infinity, nextFx = 0;
let performanceUntil = 0; // while one of the model's own animations plays, it drives the arms
const EFFECT_GLYPHS = { zzz: ["Z", "z", "Z"], hearts: ["♥", "💕"], sparkles: ["✨", "✦"], sweat: ["💧"], music: ["♪", "♫", "🎵"], question: ["?"], exclamation: ["!"] };
const fxLayer = document.getElementById("fx");
function spawnEffect(effect) {
  const glyphs = EFFECT_GLYPHS[effect];
  if (!glyphs) return;
  const el = document.createElement("div");
  el.className = "fx";
  el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
  el.style.left = (58 + Math.random() * 14) + "%";
  el.style.top = (14 + Math.random() * 8) + "%";
  el.style.setProperty("--dx", (Math.random() * 40 - 10) + "px");
  if (effect === "zzz") el.style.fontSize = (20 + Math.random() * 14) + "px";
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------- renderer ----------
const app = new PIXI.Application({
  view: document.getElementById("stage"),
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

let model = null, baseHeight = 1;
function layout() {
  if (!model) return;
  const w = window.innerWidth, h = window.innerHeight;
  // Frame head to waist: the model is a full-body picture, so scale it up
  // and let the legs run off the bottom of the view.
  const scale = Math.min((h * RIG.frame.heightScale) / baseHeight, (w * 2.6) / baseHeight);
  model.scale.set(scale);
  model.x = w / 2;
  model.y = h * RIG.frame.top;
}
window.addEventListener("resize", layout);

PIXI.live2d.Live2DModel.from(CONFIG.modelUrl, { autoInteract: false })
  .then((m) => {
    model = m;
    model.anchor.set(0.5, 0);
    model.scale.set(1);
    baseHeight = model.height;
    app.stage.addChild(model);
    layout();
    statusEl.style.display = "none";
    const core = model.internalModel.coreModel;
    // We decide which arm drawing is visible ourselves (see writeRig), so turn
    // off Live2D's pose system, which would otherwise fade the other one back in.
    model.internalModel.pose = undefined;
    model.on("poseLoaded", () => { model.internalModel.pose = undefined; }); // it loads after the model
    // Runs every frame after the idle motion, blinking and physics, so the
    // emotion, gesture and action values win.
    model.internalModel.on("beforeModelUpdate", () => applyFrame(core));
    if (location.hash === "#debug") {
      window.__model = model;
      // model.update() only accumulates time, so drive the internal model directly.
      let elapsed = 0;
      window.__step = (frames, ms = 33) => { for (let i = 0; i < frames; i++) { clockOffset += ms; elapsed += ms; model.internalModel.update(ms, elapsed); } };
      window.__state = () => ({ armUp: { ...armUp }, poseWeight, performing: clockMs() < performanceUntil,
        parts: ["PartArmLA", "PartArmLB", "PartArmRA", "PartArmRB"].map((id) => +core.getPartOpacityById(id).toFixed(2)) });
    }
    post({ type: "ready", model: CONFIG.modelUrl.split("/").pop(), license: "Live2D Free Material License" });
  })
  .catch((err) => {
    statusEl.textContent = "Couldn't load the character.";
    post({ type: "error", message: String((err && err.message) || err) });
  });

const armUp = { L: 0, R: 0 };
let last = clockMs();

function applyFrame(core) {
  const now = clockMs();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const time = now / 1000;
  const get = (id) => core.getParameterValueById(id);

  // Layers write into SET (control -> [value, weight]) and ADD (control -> sum).
  const SET = {}, ADD = {};
  const setC = (k, v, w) => {
    if (w <= 0) return;
    (PAIRS[k] || [k]).forEach((key) => {
      const cur = SET[key];
      if (!cur) SET[key] = [v, w];
      else { cur[0] = cur[0] * (1 - w) + v * w; cur[1] = Math.max(cur[1], w); }
    });
  };
  const addC = (k, v) => (PAIRS[k] || [k]).forEach((key) => { ADD[key] = (ADD[key] || 0) + v; });

  // 1. face: ease toward the target emotion; after a while relax back to idle
  if (faceResetAt && time > faceResetAt) { targetFace = Object.assign({}, CONFIG.idleFace); faceResetAt = 0; }
  const k = 1 - Math.exp(-dt * 6);
  FACE_KEYS.forEach((key) => {
    const target = targetFace[key] != null ? targetFace[key] : rest(key);
    face[key] += (target - face[key]) * k;
  });
  ["MouthForm", "EyeSmile", "EyeForm", "BrowY", "BrowForm", "Cheek", "MouthOpen", "MouthPout", "EyeSparkle", "PupilSmall"].forEach((key) => setC(key, face[key], 1));
  addC("EyeBallY", face.EyeBallY);
  // eyes: multiply the model's own blink so blinking keeps working
  setC("EyeLOpen", get(RIG.direct.EyeLOpen) * face.EyeOpen, 1);
  setC("EyeROpen", get(RIG.direct.EyeROpen) * face.EyeOpen, 1);

  // 2. held action
  poseWeight += (poseTarget - poseWeight) * (1 - Math.exp(-dt * 5));
  if (poseTarget > 0 && time > poseEndAt) { poseTarget = 0; post({ type: "pose_end", name: poseAction && poseAction.name }); }
  if (poseAction && poseWeight > 0.002) {
    const w = poseWeight;
    (poseAction.pose || []).forEach((p) => (ADDITIVE.has(p.param) ? addC(p.param, p.value * w) : setC(p.param, p.value, w)));
    const t = time - poseStart;
    (poseAction.sway || []).forEach((sw) => {
      const v = Math.sin((t / sw.periodSeconds) * TAU) * sw.amplitude * w;
      if (ADDITIVE.has(sw.param)) addC(sw.param, v);
      else { const cur = SET[sw.param]; setC(sw.param, (cur ? cur[0] : 0) + v, cur ? cur[1] : w); }
    });
    if (poseAction.effect && poseAction.effect !== "none" && w > 0.5 && now > nextFx) {
      spawnEffect(poseAction.effect);
      nextFx = now + (poseAction.effect === "zzz" ? 1100 : 700);
    }
  }

  // 3. gesture (wins over a held action while it runs)
  if (gesture) {
    const t = (time - gesture.start) / gesture.def.dur;
    if (t >= 1) gesture = null;
    else {
      const g = gesture.def.pose(t), e = env(t);
      Object.entries(g.set || {}).forEach(([key, v]) => setC(key, v, e));
      Object.entries(g.add || {}).forEach(([key, v]) => addC(key, v));
    }
  }

  // 4. mouth: live voice volume when the app sends it, otherwise a fake
  //    talking motion for the length of the reply
  let mouthTarget = 0;
  if (now - mouthAt < 250) mouthTarget = mouthLevel;
  else if (now < speakUntil) mouthTarget = Math.max(0, Math.sin(time * 18) * 0.5 + Math.sin(time * 7) * 0.25);
  mouth += (mouthTarget - mouth) * (1 - Math.exp(-dt * 25));

  writeRig(core, SET, ADD, dt);
}

// Writes Mika's controls onto the model through the rig.
function writeRig(core, SET, ADD, dt) {
  const set = (id, v) => core.setParameterValueById(id, v);
  const get = (id) => core.getParameterValueById(id);
  const blend = (id, [v, w]) => set(id, get(id) * (1 - w) + v * w);

  Object.entries(RIG.direct).forEach(([ctrl, id]) => {
    if (ADDITIVE.has(ctrl)) { if (ADD[ctrl]) core.addParameterValueById(id, ADD[ctrl]); }
    else if (SET[ctrl]) blend(id, SET[ctrl]);
  });
  Object.entries(RIG.scaled).forEach(([ctrl, [id, factor]]) => {
    if (SET[ctrl]) blend(id, [SET[ctrl][0] * factor, SET[ctrl][1]]);
  });
  if (SET.MouthForm) {
    const mf = RIG.mouthForm, [v, w] = SET.MouthForm;
    blend(mf.up, [Math.max(0, v) * mf.restUp, w]);
    blend(mf.down, [Math.max(0, -v), w]);
  }
  set(RIG.lipSync, clamp(Math.max(get(RIG.lipSync), mouth), 0, 1));

  // arms: fade between the relaxed and raised arm drawings, then place the
  // shoulder/elbow/wrist/hand (-1..1 mapped onto each parameter's range).
  // During one of the model's own animations, follow the arm it asks for.
  const performing = clockMs() < performanceUntil;
  ["L", "R"].forEach((side) => {
    const sets = RIG.arms[side];
    const up = SET["Arm" + side + "Up"];
    const target = performing ? (get(sets.raised.part) > 0.5 ? 1 : 0) : up ? up[0] * up[1] : 0;
    armUp[side] += (target - armUp[side]) * (1 - Math.exp(-dt * (performing ? 20 : 10)));
    core.setPartOpacityById(sets.relaxed.part, 1 - armUp[side]);
    core.setPartOpacityById(sets.raised.part, armUp[side]);
    if (performing) return;
    const place = (armSet, weight) => ["Shoulder", "Elbow", "Wrist", "Hand"].forEach((joint) => {
      const c = SET["Arm" + side + joint] || (joint === "Hand" ? SET["Hand" + side] : null);
      if (!c) return;
      const [id, lo, hi] = armSet[joint];
      const v = c[0] >= 0 ? c[0] * hi : -c[0] * lo;
      blend(id, [v, c[1] * weight]);
    });
    place(armUp[side] > 0.5 ? sets.raised : sets.relaxed, 1);
  });
}

window.companion = {
  react({ emotion, gesture: g }) {
    targetFace = Object.assign({}, CONFIG.faces[emotion] || CONFIG.idleFace);
    faceResetAt = clockMs() / 1000 + 12;
    if (g && GESTURE_DEFS[g]) gesture = { def: GESTURE_DEFS[g], start: clockMs() / 1000 };
  },
  speak(ms) { speakUntil = clockMs() + Math.min(ms, 60000); },
  stopSpeaking() { speakUntil = 0; mouthAt = -1e9; },
  mouth(level) { mouthLevel = clamp(level, 0, 1); mouthAt = clockMs(); },
  pose(action) {
    if (!action) { poseTarget = 0; return; }
    poseAction = action;
    poseTarget = 1;
    poseStart = clockMs() / 1000;
    poseEndAt = action.durationSeconds > 0 ? poseStart + action.durationSeconds : Infinity;
    const perf = action.performance && RIG.performances[action.performance];
    if (perf && model) {
      model.motion(perf[0], perf[1], 3);
      performanceUntil = clockMs() + (action.durationSeconds > 0 ? action.durationSeconds : 6) * 1000;
    }
  },
};

// Open this page with #debug in a desktop browser to try every emotion/gesture/action.
if (location.hash === "#debug") {
  const dbg = document.getElementById("debug");
  dbg.style.display = "flex";
  const button = (label, onclick) => { const b = document.createElement("button"); b.textContent = label; b.onclick = onclick; dbg.appendChild(b); };
  Object.keys(CONFIG.faces).forEach((e) => button(e, () => { window.companion.react({ emotion: e, gesture: "none" }); window.companion.speak(1500); }));
  CONFIG.gestures.forEach((g) => button("▶ " + g, () => window.companion.react({ emotion: "happy", gesture: g })));
  (CONFIG.debugActions || []).forEach((a) => button("★ " + a.name, () => window.companion.pose(a)));
  button("★ none", () => window.companion.pose(null));
}
})();
</script>
</body>
</html>`;
}
