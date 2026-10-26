// Mika's visual actions: held poses built from the character's controls.
// Built-ins ship with the app; Claude can design and save new ones, which
// are stored by category (see store.ts) and reused next time.

// The controls an action may set, with their safe ranges. Angles add to the
// idle motion; everything else is blended over the normal face.
export const POSE_PARAMS = {
  AngleX: [-30, 30], // head turn left/right
  AngleY: [-30, 30], // head up/down
  AngleZ: [-30, 30], // head tilt
  BodyAngleX: [-10, 10],
  BodyAngleY: [-10, 10],
  BodyAngleZ: [-10, 10],
  EyeLOpen: [0, 1.2], // 0 closed, 1 open
  EyeROpen: [0, 1.2],
  EyeSmile: [0, 1],
  EyeBallX: [-1, 1], // look left/right
  EyeBallY: [-1, 1], // look down/up
  BrowY: [-1, 1],
  BrowForm: [-1, 1],
  MouthForm: [-1, 1], // frown … smile
  MouthOpen: [0, 1],
  Cheek: [0, 1], // blush
  ArmsUp: [0, 1], // 1 = hands in front of the chest instead of behind the back
  ArmR: [-10, 10],
  ArmL: [-10, 10],
  HandR: [-10, 10],
  HandL: [-10, 10],
} as const;
export type PoseParam = keyof typeof POSE_PARAMS;
export const POSE_PARAM_NAMES = Object.keys(POSE_PARAMS) as PoseParam[];

export const EFFECTS = ["none", "zzz", "hearts", "sparkles", "sweat", "music", "question", "exclamation"] as const;
export type Effect = (typeof EFFECTS)[number];

export const CATEGORIES = ["rest", "affection", "fun", "reaction", "greeting", "focus", "other"] as const;

export type CharacterAction = {
  name: string; // snake_case, e.g. "sleep"
  category: string;
  description: string;
  pose: { param: PoseParam; value: number }[];
  // Gentle repeating motion on top of the pose (breathing while asleep, swaying to music…).
  sway: { param: PoseParam; amplitude: number; periodSeconds: number }[];
  effect: Effect;
  durationSeconds: number; // 0 = hold until Mika changes it
  builtin?: boolean;
};

export const BUILTIN_ACTIONS: CharacterAction[] = [
  {
    name: "sleep",
    category: "rest",
    description: "Falls asleep: eyes closed, head drooping, slow breathing, floating Zzz.",
    pose: [
      { param: "EyeLOpen", value: 0 }, { param: "EyeROpen", value: 0 }, { param: "AngleY", value: -14 },
      { param: "AngleZ", value: 10 }, { param: "MouthForm", value: 0.3 }, { param: "MouthOpen", value: 0.1 },
      { param: "BrowY", value: -0.2 }, { param: "BodyAngleZ", value: 3 },
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
    pose: [{ param: "EyeLOpen", value: 0 }, { param: "EyeROpen", value: 0 }, { param: "MouthForm", value: 0.6 }],
    sway: [],
    effect: "none",
    durationSeconds: 0,
    builtin: true,
  },
  {
    name: "wink",
    category: "fun",
    description: "A playful wink with one eye.",
    pose: [{ param: "EyeROpen", value: 0 }, { param: "EyeSmile", value: 0.4 }, { param: "MouthForm", value: 1 }, { param: "AngleZ", value: -6 }],
    sway: [],
    effect: "sparkles",
    durationSeconds: 1.5,
    builtin: true,
  },
  {
    name: "shy",
    category: "affection",
    description: "Blushes and looks down shyly.",
    pose: [
      { param: "Cheek", value: 1 }, { param: "EyeBallY", value: -0.8 }, { param: "AngleY", value: -10 },
      { param: "AngleX", value: 8 }, { param: "MouthForm", value: 0.4 }, { param: "ArmsUp", value: 1 },
      { param: "ArmR", value: -10 }, { param: "ArmL", value: -10 }, { param: "HandR", value: 10 }, { param: "HandL", value: 10 },
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
    pose: [{ param: "AngleY", value: -25 }, { param: "BodyAngleY", value: -10 }, { param: "EyeLOpen", value: 0.3 }, { param: "EyeROpen", value: 0.3 }],
    sway: [],
    effect: "none",
    durationSeconds: 1.8,
    builtin: true,
  },
  {
    name: "dance",
    category: "fun",
    description: "Sways happily side to side to music.",
    pose: [{ param: "EyeSmile", value: 0.8 }, { param: "MouthForm", value: 1 }, { param: "ArmsUp", value: 1 }, { param: "ArmR", value: 10 }, { param: "ArmL", value: 10 }],
    sway: [
      { param: "AngleZ", amplitude: 14, periodSeconds: 1 },
      { param: "BodyAngleZ", amplitude: 8, periodSeconds: 1 },
      { param: "AngleX", amplitude: 10, periodSeconds: 2 },
    ],
    effect: "music",
    durationSeconds: 6,
    builtin: true,
  },
  {
    name: "shake_head",
    category: "reaction",
    description: "Shakes her head: no, no.",
    pose: [{ param: "MouthForm", value: -0.3 }, { param: "BrowForm", value: -0.4 }],
    sway: [{ param: "AngleX", amplitude: 18, periodSeconds: 0.5 }],
    effect: "none",
    durationSeconds: 1.6,
    builtin: true,
  },
  {
    name: "look_away",
    category: "reaction",
    description: "Turns her head and eyes away, pouting a little.",
    pose: [{ param: "AngleX", value: -25 }, { param: "EyeBallX", value: -1 }, { param: "MouthForm", value: -0.4 }, { param: "Cheek", value: 0.5 }],
    sway: [],
    effect: "none",
    durationSeconds: 3,
    builtin: true,
  },
  {
    name: "confused",
    category: "reaction",
    description: "Tilts her head, puzzled, with a question mark.",
    pose: [{ param: "AngleZ", value: 18 }, { param: "BrowForm", value: -0.5 }, { param: "BrowY", value: 0.4 }, { param: "MouthForm", value: -0.2 }, { param: "EyeBallY", value: 0.4 }],
    sway: [],
    effect: "question",
    durationSeconds: 3,
    builtin: true,
  },
];

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, x));

/** Makes an action safe to render: known controls only, values in range, sane timings. */
export function sanitizeAction(a: CharacterAction): CharacterAction {
  const known = (p: string): p is PoseParam => (POSE_PARAM_NAMES as string[]).includes(p);
  return {
    ...a,
    name: normalizeName(a.name),
    category: a.category.trim().toLowerCase() || "other",
    description: a.description.trim().slice(0, 200),
    pose: a.pose.filter((p) => known(p.param) && Number.isFinite(p.value)).slice(0, 24)
      .map((p) => ({ param: p.param, value: clamp(p.value, POSE_PARAMS[p.param]) })),
    sway: a.sway.filter((s) => known(s.param) && Number.isFinite(s.amplitude) && Number.isFinite(s.periodSeconds)).slice(0, 6)
      .map((s) => {
        const [lo, hi] = POSE_PARAMS[s.param];
        return { param: s.param, amplitude: Math.min(Math.abs(s.amplitude), (hi - lo) / 2), periodSeconds: Math.min(Math.max(s.periodSeconds, 0.3), 10) };
      }),
    effect: (EFFECTS as readonly string[]).includes(a.effect) ? a.effect : "none",
    durationSeconds: Math.min(Math.max(a.durationSeconds || 0, 0), 600),
  };
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
