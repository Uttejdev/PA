// Mika's visual actions: held poses built from the character's controls.
// Built-ins ship with the app; Claude can design and save new ones, which
// are stored by category (see store.ts) and reused next time.
//
// Controls are model-independent; characterHtml.ts maps them onto the Live2D
// model's own parameters (its "rig"). "L"/"R" mean the character's own
// left/right (her left arm appears on the viewer's right).

// The controls an action may set, with their safe ranges. Head/body angles
// and eye direction add to the idle motion; everything else is blended over
// the normal face and pose.
export const POSE_PARAMS = {
  // head and body
  AngleX: [-30, 30], // head turn: + = towards her left
  AngleY: [-30, 30], // head nod: + = look up, - = look down
  AngleZ: [-30, 30], // head tilt
  BodyAngleX: [-10, 10],
  BodyAngleY: [-10, 10],
  BodyAngleZ: [-10, 10],
  BodyMoveX: [-10, 10], // shift her whole body sideways
  BodyMoveY: [-10, 10], // + = up (hop), - = down (crouch)
  BodyRotate: [-10, 10], // lean her whole body
  // eyes (each side separately)
  EyeLOpen: [0, 1.2], // eyelid: 0 closed, 1 open, 1.2 wide
  EyeROpen: [0, 1.2],
  EyeLSmile: [0, 1], // happy squint
  EyeRSmile: [0, 1],
  EyeLForm: [0, 1], // eye shape change (sharper, determined)
  EyeRForm: [0, 1],
  EyeBallX: [-1, 1], // look left/right
  EyeBallY: [-1, 1], // look down/up
  PupilSmall: [0, 1], // shrink pupils (shock)
  EyeSparkle: [0, 1], // sparkly eyes
  // brows (each side separately)
  BrowLY: [-1, 1], // height
  BrowRY: [-1, 1],
  BrowLAngle: [-1, 1],
  BrowRAngle: [-1, 1],
  BrowLForm: [-1, 1], // -1 worried … 1 cheerful
  BrowRForm: [-1, 1],
  // mouth
  MouthForm: [-1, 1], // -1 frown … 1 smile
  MouthOpen: [0, 1], // "a"
  MouthI: [0, 1], // vowel shapes for expressive mouths
  MouthU: [0, 1],
  MouthE: [0, 1],
  MouthO: [0, 1],
  MouthPout: [0, 1], // puffed, sulky mouth
  Cheek: [0, 1], // blush
  // shoulders and arms
  ShoulderL: [-1, 1], // shrug: + = up
  ShoulderR: [-1, 1],
  ArmLUp: [0, 1], // 0 = relaxed arm, 1 = raised arm (used for anything above the waist)
  ArmLShoulder: [-1, 1], // rotate at the shoulder
  ArmLElbow: [-1, 1], // bend at the elbow
  ArmLWrist: [-1, 1], // turn the wrist
  HandL: [-1, 1], // hand shape
  ArmRUp: [0, 1], // her right arm holds her wand
  ArmRShoulder: [-1, 1],
  ArmRElbow: [-1, 1],
  ArmRWrist: [-1, 1],
  HandR: [-1, 1],
  WandSpin: [0, 1],
} as const;
export type PoseParam = keyof typeof POSE_PARAMS;
export const POSE_PARAM_NAMES = Object.keys(POSE_PARAMS) as PoseParam[];

export const EFFECTS = ["none", "zzz", "hearts", "sparkles", "sweat", "music", "question", "exclamation"] as const;
export type Effect = (typeof EFFECTS)[number];

// Animated performances drawn into the model by its artist (magic tricks).
export const PERFORMANCES = ["none", "magic_heart", "magic_heart_big", "magic_trick", "twirl"] as const;
export type Performance = (typeof PERFORMANCES)[number];

export const CATEGORIES = ["rest", "affection", "fun", "reaction", "greeting", "focus", "magic", "other"] as const;

export type CharacterAction = {
  name: string; // snake_case, e.g. "sleep"
  category: string;
  description: string;
  pose: { param: PoseParam; value: number }[];
  // Gentle repeating motion on top of the pose (breathing while asleep, swaying to music…).
  sway: { param: PoseParam; amplitude: number; periodSeconds: number }[];
  effect: Effect;
  performance?: Performance;
  durationSeconds: number; // 0 = hold until Mika changes it
  builtin?: boolean;
};

const both = (l: PoseParam, r: PoseParam, value: number) => [{ param: l, value }, { param: r, value }];
const closedEyes = both("EyeLOpen", "EyeROpen", 0);

export const BUILTIN_ACTIONS: CharacterAction[] = [
  {
    name: "sleep",
    category: "rest",
    description: "Falls asleep: eyes closed, head drooping, slow breathing, floating Zzz.",
    pose: [
      ...closedEyes, { param: "AngleY", value: -14 }, { param: "AngleZ", value: 10 }, { param: "MouthForm", value: 0.3 },
      { param: "MouthOpen", value: 0.1 }, ...both("BrowLY", "BrowRY", -0.2), { param: "BodyAngleZ", value: 3 },
      ...both("ShoulderL", "ShoulderR", -0.3),
    ],
    sway: [{ param: "AngleY", amplitude: 2, periodSeconds: 4 }, { param: "BodyAngleY", amplitude: 1.5, periodSeconds: 4 }],
    effect: "zzz",
    durationSeconds: 0,
    builtin: true,
  },
  {
    name: "close_eyes",
    category: "rest",
    description: "Closes her eyes peacefully, with a small smile.",
    pose: [...closedEyes, { param: "MouthForm", value: 0.6 }],
    sway: [],
    effect: "none",
    durationSeconds: 0,
    builtin: true,
  },
  {
    name: "wink",
    category: "fun",
    description: "A playful wink with her right eye.",
    pose: [{ param: "EyeROpen", value: 0 }, { param: "EyeLSmile", value: 0.4 }, { param: "MouthForm", value: 1 }, { param: "AngleZ", value: -6 }, { param: "BrowRY", value: -0.4 }],
    sway: [],
    effect: "sparkles",
    durationSeconds: 1.5,
    builtin: true,
  },
  {
    name: "salute",
    category: "greeting",
    description: "A cheerful salute: left hand raised to her forehead, chin up.",
    pose: [
      { param: "ArmLUp", value: 1 }, { param: "ArmLShoulder", value: 1 }, { param: "ArmLElbow", value: 1 },
      { param: "ArmLWrist", value: -1 }, { param: "HandL", value: 1 }, { param: "AngleY", value: 6 },
      { param: "AngleZ", value: -4 }, { param: "MouthForm", value: 1 }, ...both("EyeLForm", "EyeRForm", 0.5),
      ...both("BrowLY", "BrowRY", 0.4),
    ],
    sway: [],
    effect: "sparkles",
    durationSeconds: 3,
    builtin: true,
  },
  {
    name: "shy",
    category: "affection",
    description: "Blushes and looks down shyly.",
    pose: [
      { param: "Cheek", value: 1 }, { param: "EyeBallY", value: -0.8 }, { param: "AngleY", value: -10 },
      { param: "AngleX", value: 8 }, { param: "MouthForm", value: 0.4 }, ...both("ShoulderL", "ShoulderR", 0.5),
      ...both("BrowLForm", "BrowRForm", -0.3),
    ],
    sway: [{ param: "BodyAngleX", amplitude: 1.5, periodSeconds: 2.5 }],
    effect: "hearts",
    durationSeconds: 4,
    builtin: true,
  },
  {
    name: "bow",
    category: "greeting",
    description: "A polite bow.",
    pose: [{ param: "AngleY", value: -25 }, { param: "BodyAngleY", value: -10 }, { param: "BodyMoveY", value: -4 }, ...both("EyeLOpen", "EyeROpen", 0.3)],
    sway: [],
    effect: "none",
    durationSeconds: 1.8,
    builtin: true,
  },
  {
    name: "dance",
    category: "fun",
    description: "Dances happily, swaying side to side with her arms up.",
    pose: [...both("EyeLSmile", "EyeRSmile", 0.8), { param: "MouthForm", value: 1 }, { param: "ArmLUp", value: 1 }, { param: "ArmRUp", value: 1 }],
    sway: [
      { param: "AngleZ", amplitude: 14, periodSeconds: 1 },
      { param: "BodyRotate", amplitude: 6, periodSeconds: 1 },
      { param: "BodyMoveX", amplitude: 4, periodSeconds: 1 },
      { param: "ArmLShoulder", amplitude: 0.6, periodSeconds: 1 },
      { param: "ArmRShoulder", amplitude: 0.6, periodSeconds: 1 },
    ],
    effect: "music",
    durationSeconds: 6,
    builtin: true,
  },
  {
    name: "shrug",
    category: "reaction",
    description: "Shrugs: shoulders up, head tilted, eyebrows raised.",
    pose: [...both("ShoulderL", "ShoulderR", 1), { param: "AngleZ", value: 10 }, ...both("BrowLY", "BrowRY", 0.7), { param: "MouthForm", value: -0.2 }, { param: "MouthE", value: 0.4 }],
    sway: [],
    effect: "none",
    durationSeconds: 2,
    builtin: true,
  },
  {
    name: "pout",
    category: "reaction",
    description: "Pouts with puffed cheeks and looks away, sulking.",
    pose: [{ param: "MouthPout", value: 1 }, { param: "AngleX", value: -20 }, { param: "EyeBallX", value: -1 }, { param: "Cheek", value: 0.6 }, ...both("BrowLForm", "BrowRForm", -0.6)],
    sway: [],
    effect: "none",
    durationSeconds: 3,
    builtin: true,
  },
  {
    name: "shake_head",
    category: "reaction",
    description: "Shakes her head: no, no.",
    pose: [{ param: "MouthForm", value: -0.3 }, ...both("BrowLForm", "BrowRForm", -0.4)],
    sway: [{ param: "AngleX", amplitude: 18, periodSeconds: 0.5 }],
    effect: "none",
    durationSeconds: 1.6,
    builtin: true,
  },
  {
    name: "shocked",
    category: "reaction",
    description: "Wide-eyed shock with tiny pupils and an open mouth.",
    pose: [...both("EyeLOpen", "EyeROpen", 1.2), { param: "PupilSmall", value: 1 }, { param: "MouthO", value: 1 }, ...both("BrowLY", "BrowRY", 1), { param: "BodyMoveY", value: 2 }],
    sway: [],
    effect: "exclamation",
    durationSeconds: 2,
    builtin: true,
  },
  {
    name: "confused",
    category: "reaction",
    description: "Tilts her head, puzzled, with a question mark.",
    pose: [{ param: "AngleZ", value: 18 }, { param: "BrowLY", value: 0.6 }, { param: "BrowRY", value: -0.3 }, { param: "MouthForm", value: -0.2 }, { param: "EyeBallY", value: 0.4 }],
    sway: [],
    effect: "question",
    durationSeconds: 3,
    builtin: true,
  },
  {
    name: "magic_heart",
    category: "magic",
    description: "Draws a glowing heart in the air with her wand (an animated magic trick).",
    pose: [],
    sway: [],
    effect: "none",
    performance: "magic_heart",
    durationSeconds: 5,
    builtin: true,
  },
  {
    name: "magic_trick",
    category: "magic",
    description: "Performs a flashy magic spell with her wand (an animated magic trick).",
    pose: [],
    sway: [],
    effect: "none",
    performance: "magic_trick",
    durationSeconds: 6,
    builtin: true,
  },
  {
    name: "twirl",
    category: "fun",
    description: "Spreads her arms and twirls her wand happily (an animated move).",
    pose: [],
    sway: [],
    effect: "none",
    performance: "twirl",
    durationSeconds: 3,
    builtin: true,
  },
];

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, x));

// Shorthands for both sides at once, plus names used by older saved actions
// (from the previous character), mapped onto today's controls. `scale`
// converts old ±10 arm values to today's ±1.
const ALIASES: Record<string, { to: PoseParam[]; scale?: number }> = {
  EyeOpen: { to: ["EyeLOpen", "EyeROpen"] },
  EyeSmile: { to: ["EyeLSmile", "EyeRSmile"] },
  EyeForm: { to: ["EyeLForm", "EyeRForm"] },
  BrowY: { to: ["BrowLY", "BrowRY"] },
  BrowAngle: { to: ["BrowLAngle", "BrowRAngle"] },
  BrowForm: { to: ["BrowLForm", "BrowRForm"] },
  Shoulders: { to: ["ShoulderL", "ShoulderR"] },
  ArmsUp: { to: ["ArmLUp", "ArmRUp"] },
  ArmR: { to: ["ArmRShoulder"], scale: 0.1 },
  ArmL: { to: ["ArmLShoulder"], scale: 0.1 },
};

function expand<T extends { param: string }>(items: T[], key: "value" | "amplitude"): T[] {
  return items.flatMap((item) => {
    const alias = ALIASES[item.param];
    if (!alias) return [item];
    return alias.to.map((param) => ({ ...item, param, [key]: (item as unknown as Record<string, number>)[key] * (alias.scale ?? 1) }));
  });
}

/** Makes an action safe to render: known controls only, values in range, sane timings. */
export function sanitizeAction(a: CharacterAction): CharacterAction {
  const known = (p: string): p is PoseParam => (POSE_PARAM_NAMES as string[]).includes(p);
  const performance = (PERFORMANCES as readonly string[]).includes(a.performance ?? "none") ? (a.performance ?? "none") : "none";
  const out: CharacterAction = {
    ...a,
    name: normalizeName(a.name),
    category: a.category.trim().toLowerCase() || "other",
    description: a.description.trim().slice(0, 200),
    pose: expand(a.pose, "value").filter((p) => known(p.param) && Number.isFinite(p.value)).slice(0, 40)
      .map((p) => ({ param: p.param, value: clamp(p.value, POSE_PARAMS[p.param]) })),
    sway: expand(a.sway, "amplitude").filter((s) => known(s.param) && Number.isFinite(s.amplitude) && Number.isFinite(s.periodSeconds)).slice(0, 8)
      .map((s) => {
        const [lo, hi] = POSE_PARAMS[s.param];
        return { param: s.param, amplitude: Math.min(Math.abs(s.amplitude), (hi - lo) / 2), periodSeconds: Math.min(Math.max(s.periodSeconds, 0.3), 10) };
      }),
    effect: (EFFECTS as readonly string[]).includes(a.effect) ? a.effect : "none",
    durationSeconds: Math.min(Math.max(a.durationSeconds || 0, 0), 600),
  };
  if (performance !== "none") out.performance = performance;
  else delete out.performance;
  return out;
}

export const normalizeName = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** One line per action, grouped by category, for Claude's prompt. */
export function catalogText(actions: Pick<CharacterAction, "name" | "category" | "description">[]): string {
  const byCategory = new Map<string, string[]>();
  for (const a of actions) {
    const list = byCategory.get(a.category) ?? [];
    list.push(`${a.name}: ${a.description}`);
    byCategory.set(a.category, list);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, items]) => `[${cat}]\n${items.map((i) => `- ${i}`).join("\n")}`)
    .join("\n");
}
