/// <reference types="jest" />
import { BUILTIN_ACTIONS, catalogText, POSE_PARAMS, sanitizeAction, type CharacterAction } from "../actions/library";

describe("built-in actions", () => {
  it("are already safe and uniquely named", () => {
    const names = BUILTIN_ACTIONS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const a of BUILTIN_ACTIONS) expect(sanitizeAction(a)).toEqual(a);
  });

  it("include sleep", () => {
    const sleep = BUILTIN_ACTIONS.find((a) => a.name === "sleep")!;
    expect(sleep.pose).toEqual(expect.arrayContaining([{ param: "EyeLOpen", value: 0 }, { param: "EyeROpen", value: 0 }]));
    expect(sleep.effect).toBe("zzz");
    expect(sleep.durationSeconds).toBe(0);
  });
});

describe("sanitizeAction", () => {
  it("clamps values, drops unknown controls and fixes names", () => {
    const wild = {
      name: "Big Stretch!",
      category: "  Rest ",
      description: "stretches",
      pose: [{ param: "AngleZ", value: 99 }, { param: "Tail", value: 1 }, { param: "Cheek", value: NaN }],
      sway: [{ param: "AngleX", amplitude: -500, periodSeconds: 0.01 }],
      effect: "fireworks",
      durationSeconds: 9999,
    } as unknown as CharacterAction;
    const safe = sanitizeAction(wild);
    expect(safe.name).toBe("big_stretch");
    expect(safe.category).toBe("rest");
    expect(safe.pose).toEqual([{ param: "AngleZ", value: POSE_PARAMS.AngleZ[1] }]);
    expect(safe.sway).toEqual([{ param: "AngleX", amplitude: 30, periodSeconds: 0.3 }]);
    expect(safe.effect).toBe("none");
    expect(safe.durationSeconds).toBe(600);
  });
});

it("lists actions grouped by category for Claude", () => {
  const text = catalogText([
    { name: "sleep", category: "rest", description: "Falls asleep." },
    { name: "dance", category: "fun", description: "Dances." },
    { name: "close_eyes", category: "rest", description: "Closes eyes." },
  ]);
  expect(text).toBe("[fun]\n- dance: Dances.\n[rest]\n- sleep: Falls asleep.\n- close_eyes: Closes eyes.");
});

it("translates shorthand and older control names", () => {
  const old = sanitizeAction({
    name: "old_salute",
    category: "greeting",
    description: "from the previous character",
    pose: [{ param: "ArmsUp", value: 1 }, { param: "ArmR", value: 10 }, { param: "EyeSmile", value: 0.5 }],
    sway: [{ param: "BrowY", amplitude: 0.2, periodSeconds: 1 }],
    effect: "none",
    durationSeconds: 2,
  } as unknown as CharacterAction);
  expect(old.pose).toEqual([
    { param: "ArmLUp", value: 1 }, { param: "ArmRUp", value: 1 }, { param: "ArmRShoulder", value: 1 },
    { param: "EyeLSmile", value: 0.5 }, { param: "EyeRSmile", value: 0.5 },
  ]);
  expect(old.sway.map((s) => s.param)).toEqual(["BrowLY", "BrowRY"]);
});
