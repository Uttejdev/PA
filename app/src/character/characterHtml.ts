import type { CharacterAction } from "../actions/library";
import { EMOTION_FACES, GESTURES, IDLE_FACE } from "./mapping";

// "Hiyori", an official Live2D sample model (Live2D Free Material License).
// Swap in another Live2D Cubism 3/4/5 model by pointing this at its .model3.json.
const SAMPLES = "https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources";
export const DEFAULT_MODEL_URL = `${SAMPLES}/Hiyori/Hiyori.model3.json`;

// Live2D's runtime has to be loaded from Live2D's own site (it isn't on npm).
const CUBISM_CORE_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const PIXI_VERSION = "6.5.10";
const PIXI_LIVE2D_VERSION = "0.4.0";

// The whole character renderer as one HTML page, loaded into a WebView.
// The app drives it by calling window.companion.react({...}) and
// window.companion.speak(ms) / mouth(level) via injectJavaScript; the page
// reports back with window.ReactNativeWebView.postMessage(JSON).
export function buildCharacterHtml(modelUrl: string = DEFAULT_MODEL_URL, debugActions: CharacterAction[] = []): string {
  const config = JSON.stringify({ modelUrl, faces: EMOTION_FACES, idleFace: IDLE_FACE, gestures: GESTURES, debugActions });
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
const post = (msg) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };
const statusEl = document.getElementById("status");
window.onerror = (m) => post({ type: "error", message: String(m) });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const easeInOut = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
// envelope: ramps in over the first 20%, out over the last 25%
const env = (t) => Math.min(easeInOut(t / 0.2), easeInOut((1 - t) / 0.25));
const TAU = Math.PI * 2;

// ---------- state the app controls ----------
let targetFace = Object.assign({}, CONFIG.idleFace);
const face = {};
const FACE_KEYS = ["MouthForm", "EyeSmile", "EyeOpen", "BrowY", "BrowForm", "Cheek", "MouthOpen", "EyeBallY"];
const FACE_REST = { EyeOpen: 1 };
const rest = (key) => (FACE_REST[key] != null ? FACE_REST[key] : 0);
FACE_KEYS.forEach((key) => { face[key] = rest(key); });
let faceResetAt = 0;
let speakUntil = 0, mouth = 0, mouthLevel = 0, mouthAt = -1e9;

// Gestures: values layered on top of the idle motion, for progress t in 0..1.
// Hiyori's second arm set ("B", faded in with armsB) is the hands-in-front pose.
const GESTURE_DEFS = {
  nod: { dur: 1.2, pose: (t) => ({ AngleY: -Math.sin(t * TAU * 2) * 14 * env(t), BodyAngleY: -2 * env(t) }) },
  tilt_head: { dur: 2.0, pose: (t) => ({ AngleZ: 16 * env(t), AngleX: 6 * env(t), BodyAngleZ: 2 * env(t) }) },
  wave: { dur: 2.4, pose: (t) => {
    const e = env(t), swing = Math.sin(t * TAU * 3);
    return { armsB: e, ArmRB: 10, ArmLB: -10, HandRB: swing * 10, AngleZ: -8 * e + swing * 3 * e, BodyAngleZ: -3 * e };
  } },
  cheer: { dur: 1.8, pose: (t) => {
    const e = env(t);
    return { armsB: e, ArmRB: 10, ArmLB: 10, HandRB: -10, HandLB: -10, AngleY: 8 * e, hop: Math.abs(Math.sin(t * TAU * 2)) * e };
  } },
  think: { dur: 3.0, pose: (t) => {
    const e = env(t);
    return { armsB: e, ArmRB: -10, ArmLB: 0, HandRB: 10, AngleX: 10 * e, AngleZ: 8 * e, AngleY: 6 * e, EyeBallX: 0.5 * e };
  } },
};
let gesture = null; // { def, start }

// Held visual actions from the action library (sleep, dance, shy…).
let poseAction = null, poseTarget = 0, poseWeight = 0, poseStart = 0, poseEndAt = Infinity, nextFx = 0;
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
// The arm switch fades on its own, so a gesture cut short by the next one
// never leaves both arm sets half-visible.
let armsB = 0;
const arms = { ArmRB: 0, ArmLB: 0, HandRB: 0, HandLB: 0 };

// ---------- renderer ----------
const app = new PIXI.Application({
  view: document.getElementById("stage"),
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

let model = null, baseHeight = 1, baseY = 0;
function layout() {
  if (!model) return;
  const w = window.innerWidth, h = window.innerHeight;
  // Frame head to waist: the model is a full-body picture, so scale it up
  // and let the legs run off the bottom of the view.
  const scale = Math.min((h * 1.75) / baseHeight, (w * 2.6) / baseHeight);
  model.scale.set(scale);
  model.x = w / 2;
  baseY = h * 0.03;
  model.y = baseY;
}
window.addEventListener("resize", layout);

PIXI.live2d.Live2DModel.from(CONFIG.modelUrl, { autoInteract: false })
  .then((m) => {
    model = m;
    model.anchor.set(0.5, 0);
    baseHeight = model.height;
    app.stage.addChild(model);
    layout();
    statusEl.style.display = "none";
    const core = model.internalModel.coreModel;
    // Runs every frame after the idle motion, blinking and physics, so the
    // emotion and gesture values win.
    model.internalModel.on("beforeModelUpdate", () => applyPose(core));
    post({ type: "ready", model: CONFIG.modelUrl.split("/").pop(), license: "Live2D Free Material License" });
  })
  .catch((err) => {
    statusEl.textContent = "Couldn't load the character.";
    post({ type: "error", message: String((err && err.message) || err) });
  });

let last = performance.now();
function applyPose(core) {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const time = now / 1000;
  const set = (id, v) => core.setParameterValueById(id, v);
  const add = (id, v) => core.addParameterValueById(id, v);
  const get = (id) => core.getParameterValueById(id);

  // face: ease toward the target emotion; after a while relax back to idle
  if (faceResetAt && time > faceResetAt) { targetFace = Object.assign({}, CONFIG.idleFace); faceResetAt = 0; }
  const k = 1 - Math.exp(-dt * 6);
  FACE_KEYS.forEach((key) => {
    const target = targetFace[key] != null ? targetFace[key] : rest(key);
    face[key] += (target - face[key]) * k;
  });
  set("ParamMouthForm", clamp(face.MouthForm, -1, 1));
  set("ParamEyeLSmile", face.EyeSmile);
  set("ParamEyeRSmile", face.EyeSmile);
  // multiply so the model's own blinking keeps working
  set("ParamEyeLOpen", clamp(get("ParamEyeLOpen") * face.EyeOpen, 0, 1.2));
  set("ParamEyeROpen", clamp(get("ParamEyeROpen") * face.EyeOpen, 0, 1.2));
  set("ParamBrowLY", face.BrowY);
  set("ParamBrowRY", face.BrowY);
  set("ParamBrowLForm", face.BrowForm);
  set("ParamBrowRForm", face.BrowForm);
  set("ParamCheek", face.Cheek);
  add("ParamEyeBallY", face.EyeBallY);

  // mouth: follow the live voice volume when the app sends it,
  // otherwise fake a talking motion for the length of the reply
  let mouthTarget = 0;
  if (now - mouthAt < 250) mouthTarget = mouthLevel;
  else if (now < speakUntil) mouthTarget = Math.max(0, Math.sin(time * 18) * 0.5 + Math.sin(time * 7) * 0.25);
  mouth += (mouthTarget - mouth) * (1 - Math.exp(-dt * 25));
  set("ParamMouthOpenY", clamp(Math.max(mouth, face.MouthOpen), 0, 1));

  // held action: blend its pose over the face, add sway, show its effect
  poseWeight += (poseTarget - poseWeight) * (1 - Math.exp(-dt * 5));
  if (poseTarget > 0 && now / 1000 > poseEndAt) { poseTarget = 0; post({ type: "pose_end", name: poseAction && poseAction.name }); }
  let poseArms = null;
  if (poseAction && poseWeight > 0.002) {
    const w = poseWeight;
    const lerp = (id, v) => set(id, get(id) * (1 - w) + v * w);
    const ADD = { AngleX: 1, AngleY: 1, AngleZ: 1, BodyAngleX: 1, BodyAngleY: 1, BodyAngleZ: 1, EyeBallX: 1, EyeBallY: 1 };
    const PAIRS = { EyeSmile: ["ParamEyeLSmile", "ParamEyeRSmile"], BrowY: ["ParamBrowLY", "ParamBrowRY"], BrowForm: ["ParamBrowLForm", "ParamBrowRForm"] };
    const IDS = { MouthOpen: "ParamMouthOpenY" };
    const arms = {};
    const apply = (param, value, additive) => {
      if (param === "ArmsUp" || param === "ArmR" || param === "ArmL" || param === "HandR" || param === "HandL") { arms[param] = value; return; }
      if (ADD[param] || additive) { add("Param" + param, value * w); return; }
      (PAIRS[param] || [IDS[param] || "Param" + param]).forEach((id) => lerp(id, value));
    };
    (poseAction.pose || []).forEach((p) => apply(p.param, p.value, false));
    const t = now / 1000 - poseStart;
    (poseAction.sway || []).forEach((sw) => apply(sw.param, Math.sin((t / sw.periodSeconds) * TAU) * sw.amplitude, true));
    if (arms.ArmsUp != null) poseArms = { up: arms.ArmsUp * w, ArmRB: arms.ArmR, ArmLB: arms.ArmL, HandRB: arms.HandR, HandLB: arms.HandL };
    // still talk while posing (e.g. sleepy mumbling)
    set("ParamMouthOpenY", clamp(Math.max(get("ParamMouthOpenY"), mouth), 0, 1));
    if (poseAction.effect && poseAction.effect !== "none" && w > 0.5 && now > nextFx) {
      spawnEffect(poseAction.effect);
      nextFx = now + (poseAction.effect === "zzz" ? 1100 : 700);
    }
  }

  // gesture
  let hop = 0, armsTarget = 0;
  if (gesture) {
    const t = (time - gesture.start) / gesture.def.dur;
    if (t >= 1) gesture = null;
    else {
      const p = gesture.def.pose(t);
      if (p.armsB != null) {
        armsTarget = p.armsB;
        Object.keys(arms).forEach((id) => { if (p[id] != null) arms[id] = p[id]; });
      }
      ["AngleX", "AngleY", "AngleZ", "BodyAngleY", "BodyAngleZ", "EyeBallX"].forEach((id) => { if (p[id]) add("Param" + id, p[id]); });
      hop = p.hop || 0;
    }
  }
  // a gesture's arms win over a held action's arms
  if (!armsTarget && poseArms) {
    armsTarget = poseArms.up;
    ["ArmRB", "ArmLB", "HandRB", "HandLB"].forEach((id) => { if (poseArms[id] != null) arms[id] = poseArms[id]; });
  }
  armsB += (armsTarget - armsB) * (1 - Math.exp(-dt * 12));
  if (armsB > 0.002) {
    core.setPartOpacityById("PartArmA", 1 - armsB);
    core.setPartOpacityById("PartArmB", armsB);
    Object.keys(arms).forEach((id) => set("Param" + id, arms[id]));
  } else if (armsB > 0) {
    armsB = 0;
    core.setPartOpacityById("PartArmA", 1);
    core.setPartOpacityById("PartArmB", 0);
  }
  if (model) model.y = baseY - hop * window.innerHeight * 0.03;
}

window.companion = {
  react({ emotion, gesture: g }) {
    targetFace = Object.assign({}, CONFIG.faces[emotion] || CONFIG.idleFace);
    faceResetAt = performance.now() / 1000 + 12;
    if (g && GESTURE_DEFS[g]) gesture = { def: GESTURE_DEFS[g], start: performance.now() / 1000 };
  },
  speak(ms) { speakUntil = performance.now() + Math.min(ms, 60000); },
  stopSpeaking() { speakUntil = 0; mouthAt = -1e9; },
  mouth(level) { mouthLevel = clamp(level, 0, 1); mouthAt = performance.now(); },
  pose(action) {
    if (!action) { poseTarget = 0; return; }
    poseAction = action;
    poseTarget = 1;
    poseStart = performance.now() / 1000;
    poseEndAt = action.durationSeconds > 0 ? poseStart + action.durationSeconds : Infinity;
  },
};

// Open this page with #debug in a desktop browser to try every emotion/gesture.
if (location.hash === "#debug") {
  const dbg = document.getElementById("debug");
  dbg.style.display = "flex";
  Object.keys(CONFIG.faces).forEach((e) => {
    const b = document.createElement("button"); b.textContent = e;
    b.onclick = () => { window.companion.react({ emotion: e, gesture: "none" }); window.companion.speak(1500); };
    dbg.appendChild(b);
  });
  CONFIG.gestures.forEach((g) => {
    const b = document.createElement("button"); b.textContent = "▶ " + g;
    b.onclick = () => window.companion.react({ emotion: "happy", gesture: g });
    dbg.appendChild(b);
  });
  (CONFIG.debugActions || []).forEach((a) => {
    const b = document.createElement("button"); b.textContent = "★ " + a.name;
    b.onclick = () => window.companion.pose(a);
    dbg.appendChild(b);
  });
  const off = document.createElement("button"); off.textContent = "★ none";
  off.onclick = () => window.companion.pose(null);
  dbg.appendChild(off);
}
})();
</script>
</body>
</html>`;
}
