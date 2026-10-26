import type { CharacterAction, Effect, PoseParam } from "../actions/library";
import { learnAction } from "../actions/store";

type LearnInput = {
  name: string;
  category: string;
  description: string;
  pose: { param: string; value: number }[];
  sway: { param: string; amplitude: number; period_seconds: number }[];
  effect: string;
  duration_seconds: number;
};

export async function learnCharacterAction(input: LearnInput) {
  const action = await learnAction({
    name: input.name,
    category: input.category,
    description: input.description,
    pose: input.pose.map((p) => ({ param: p.param as PoseParam, value: p.value })),
    sway: input.sway.map((s) => ({ param: s.param as PoseParam, amplitude: s.amplitude, periodSeconds: s.period_seconds })),
    effect: input.effect as Effect,
    durationSeconds: input.duration_seconds,
  } satisfies CharacterAction);
  return { saved: true, name: action.name, category: action.category, note: `Perform it by setting action to "${action.name}".` };
}
