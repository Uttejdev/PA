import { EMOTION_EXPRESSIONS, GESTURES, IDLE_EXPRESSION } from "./mapping";

// Free sample model from the three-vrm repo (MIT). Swap in your own VRoid
// Studio export by hosting the .vrm somewhere and changing this URL.
export const DEFAULT_MODEL_URL =
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@v3.5.5/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm";

const THREE_VERSION = "0.186.1";
const THREE_VRM_VERSION = "3.5.5";

// The whole character renderer as one HTML page, loaded into a WebView.
// The app drives it by calling window.companion.react({...}) and
// window.companion.speak(ms) via injectJavaScript; the page reports back with
// window.ReactNativeWebView.postMessage(JSON).
export function buildCharacterHtml(modelUrl: string = DEFAULT_MODEL_URL): string {
  const config = JSON.stringify({
    modelUrl,
    expressions: EMOTION_EXPRESSIONS,
    idleExpression: IDLE_EXPRESSION,
    gestures: GESTURES,
  });
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
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/",
  "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@${THREE_VRM_VERSION}/lib/three-vrm.module.min.js"
} }
</script>
</head>
<body>
<div id="status">Waking up…</div>
<div id="debug"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const CONFIG = ${config};
const post = (msg) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };
const statusEl = document.getElementById("status");
window.onerror = (m) => post({ type: "error", message: String(m) });

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
camera.position.set(0, 1.3, 1.9);
camera.lookAt(0, 1.25, 0);
const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1, 1.5, 2);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Narrow screens: pull back a little so the upper body fits.
  camera.position.z = w / h < 0.9 ? 2.7 : 2.1;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let vrm = null;
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.load(
  CONFIG.modelUrl,
  (gltf) => {
    vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm); // VRM 0.x models face the other way
    vrm.scene.traverse((o) => { o.frustumCulled = false; });
    scene.add(vrm.scene);
    if (vrm.lookAt) vrm.lookAt.target = camera;
    statusEl.style.display = "none";
    const meta = vrm.meta || {};
    post({ type: "ready", model: meta.name || meta.title || "", license: meta.licenseUrl || meta.licenseName || "" });
  },
  (p) => { if (p.total) statusEl.textContent = "Waking up… " + Math.round((p.loaded / p.total) * 100) + "%"; },
  (err) => { statusEl.textContent = "Couldn't load the character."; post({ type: "error", message: String(err && err.message || err) }); },
);

// ---------- face ----------
const PRESETS = ["happy", "angry", "sad", "relaxed", "surprised"];
let targetFace = Object.assign({}, CONFIG.idleExpression);
const face = {};
PRESETS.forEach((k) => { face[k] = 0; });
let faceResetAt = 0;

let nextBlink = 1.5, blinkT = -1;
let speakUntil = 0;

// ---------- body ----------
const easeInOut = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
// envelope: ramps in over the first 20%, out over the last 25%
const env = (t) => Math.min(easeInOut(t / 0.2), easeInOut((1 - t) / 0.25));
const TAU = Math.PI * 2;

// Each gesture returns bone rotation offsets [x, y, z] for progress t in 0..1.
const GESTURE_DEFS = {
  nod: { dur: 1.2, pose: (t) => ({ head: [Math.sin(t * TAU * 2) * 0.22 * env(t), 0, 0], neck: [0.05 * env(t), 0, 0] }) },
  tilt_head: { dur: 2.0, pose: (t) => ({ head: [0, 0, 0.28 * env(t)], neck: [0, 0, 0.08 * env(t)] }) },
  wave: { dur: 2.4, pose: (t) => {
    const e = env(t);
    return {
      rightUpperArm: [0, 0, -1.9 * e],
      rightLowerArm: [0, Math.sin(t * TAU * 3) * 0.5 * e, -0.6 * e],
      head: [0, 0, -0.08 * e],
    };
  } },
  cheer: { dur: 1.8, pose: (t) => {
    const e = env(t), bounce = Math.abs(Math.sin(t * TAU * 2)) * e;
    return {
      rightUpperArm: [0, 0, -2.0 * e],
      leftUpperArm: [0, 0, 2.0 * e],
      rightLowerArm: [0, 0, -0.3 * e],
      leftLowerArm: [0, 0, 0.3 * e],
      hips: [0, 0, 0], hipsY: 0.03 * bounce,
      head: [-0.1 * e, 0, 0],
    };
  } },
  think: { dur: 3.0, pose: (t) => {
    const e = env(t);
    return {
      rightUpperArm: [0, 0, 0.45 * e],
      rightLowerArm: [0, 2.3 * e, 0],
      rightHand: [0, 0, 0.3 * e],
      head: [-0.12 * e, 0.15 * e, 0.12 * e],
    };
  } },
};
let gesture = null; // { def, start }

// Arms come down from the T-pose to rest at the sides.
const REST = { leftUpperArm: [0, 0, -1.2], rightUpperArm: [0, 0, 1.2], leftLowerArm: [0, 0, -0.1], rightLowerArm: [0, 0, 0.1] };
const BONES = ["hips", "spine", "chest", "neck", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "rightHand"];

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  if (vrm) {
    const h = vrm.humanoid;
    // pose = rest + idle + gesture
    const pose = {};
    BONES.forEach((b) => { pose[b] = (REST[b] || [0, 0, 0]).slice(); });
    const breath = Math.sin(time * 1.6);
    pose.spine[0] += breath * 0.015;
    pose.chest[0] += breath * 0.02;
    pose.leftUpperArm[2] -= breath * 0.015;
    pose.rightUpperArm[2] += breath * 0.015;
    pose.head[1] += Math.sin(time * 0.5) * 0.04;
    pose.head[2] += Math.sin(time * 0.37) * 0.02;
    let hipsY = 0;
    if (gesture) {
      const t = (time - gesture.start) / gesture.def.dur;
      if (t >= 1) gesture = null;
      else {
        const off = gesture.def.pose(t);
        for (const b in off) {
          if (b === "hipsY") { hipsY = off[b]; continue; }
          if (pose[b]) for (let i = 0; i < 3; i++) pose[b][i] += off[b][i];
        }
      }
    }
    BONES.forEach((b) => {
      const node = h.getNormalizedBoneNode(b);
      if (node) node.rotation.set(pose[b][0], pose[b][1], pose[b][2]);
    });
    const hips = h.getNormalizedBoneNode("hips");
    if (hips) hips.position.y = (hips.userData.baseY ??= hips.position.y) + hipsY;

    // face: ease toward the target emotion; after a while relax back to idle
    if (faceResetAt && time > faceResetAt) { targetFace = Object.assign({}, CONFIG.idleExpression); faceResetAt = 0; }
    const em = vrm.expressionManager;
    if (em) {
      const k = 1 - Math.exp(-dt * 6);
      PRESETS.forEach((p) => {
        face[p] += ((targetFace[p] || 0) - face[p]) * k;
        em.setValue(p, face[p]);
      });
      // blink
      if (blinkT < 0 && time > nextBlink) blinkT = 0;
      let blink = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        blink = Math.sin(Math.min(blinkT / 0.16, 1) * Math.PI);
        if (blinkT > 0.16) { blinkT = -1; nextBlink = time + 2 + Math.random() * 4; }
      }
      em.setValue("blink", blink * (1 - face.happy * 0.6));
      // talking mouth until real lip sync arrives (phase 2)
      const talking = performance.now() < speakUntil;
      em.setValue("aa", talking ? Math.max(0, Math.sin(time * 18) * 0.5 + Math.sin(time * 7) * 0.2) : 0);
    }
    vrm.update(dt);
  }
  renderer.render(scene, camera);
}
frame();

window.companion = {
  react({ emotion, gesture: g }) {
    targetFace = Object.assign({}, CONFIG.expressions[emotion] || CONFIG.idleExpression);
    faceResetAt = clock.elapsedTime + 12;
    if (g && GESTURE_DEFS[g]) gesture = { def: GESTURE_DEFS[g], start: clock.elapsedTime };
  },
  speak(ms) { speakUntil = performance.now() + Math.min(ms, 15000); },
};

// Open this page with #debug in a desktop browser to try every emotion/gesture.
if (location.hash === "#debug") {
  const dbg = document.getElementById("debug");
  dbg.style.display = "flex";
  Object.keys(CONFIG.expressions).forEach((e) => {
    const b = document.createElement("button"); b.textContent = e;
    b.onclick = () => { window.companion.react({ emotion: e, gesture: "none" }); window.companion.speak(1500); };
    dbg.appendChild(b);
  });
  CONFIG.gestures.forEach((g) => {
    const b = document.createElement("button"); b.textContent = "▶ " + g;
    b.onclick = () => window.companion.react({ emotion: "happy", gesture: g });
    dbg.appendChild(b);
  });
}
</script>
</body>
</html>`;
}
