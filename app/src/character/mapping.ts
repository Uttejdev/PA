// Keep these lists in sync with server/src/schema.ts.
export const EMOTIONS = ["happy", "worried", "thinking", "excited", "calm", "sad", "surprised"] as const;
export const GESTURES = ["nod", "wave", "tilt_head", "cheer", "think", "none"] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Gesture = (typeof GESTURES)[number];

// VRM expression presets available on every VRM model:
// happy, angry, sad, relaxed, surprised, neutral (+ blink and mouth shapes).
export type ExpressionWeights = Partial<Record<"happy" | "angry" | "sad" | "relaxed" | "surprised", number>>;

// How each Claude emotion shows on the character's face.
export const EMOTION_EXPRESSIONS: Record<Emotion, ExpressionWeights> = {
  happy: { happy: 0.8 },
  excited: { happy: 1, surprised: 0.25 },
  calm: { relaxed: 0.6 },
  thinking: { relaxed: 0.25 },
  worried: { sad: 0.5, surprised: 0.15 },
  sad: { sad: 0.85 },
  surprised: { surprised: 0.9 },
};

// Resting face between replies.
export const IDLE_EXPRESSION: ExpressionWeights = { relaxed: 0.2 };

export function normalizeEmotion(value: unknown): Emotion {
  return (EMOTIONS as readonly unknown[]).includes(value) ? (value as Emotion) : "calm";
}

export function normalizeGesture(value: unknown): Gesture {
  return (GESTURES as readonly unknown[]).includes(value) ? (value as Gesture) : "none";
}
