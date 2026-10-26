// Keep these lists in sync with server/src/schema.ts.
export const EMOTIONS = ["happy", "worried", "thinking", "excited", "calm", "sad", "surprised"] as const;
export const GESTURES = ["nod", "wave", "tilt_head", "cheer", "think", "none"] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Gesture = (typeof GESTURES)[number];

// Face poses as Live2D parameter values. These are Cubism's standard
// parameter IDs, so they work on most Live2D models, not just the sample.
//   MouthForm: -1 frown … 1 smile      EyeSmile: 0 … 1 (happy squint)
//   EyeOpen:   multiplier on the eyes (1 = normal, blinking still works)
//   BrowY:     -1 down … 1 raised      BrowForm: -1 worried … 1 cheerful
//   Cheek:     blush 0 … 1            MouthOpen: resting openness 0 … 1
export type FacePose = Partial<{
  MouthForm: number;
  EyeSmile: number;
  EyeOpen: number;
  BrowY: number;
  BrowForm: number;
  Cheek: number;
  MouthOpen: number;
  EyeBallY: number;
}>;

// How each Claude emotion shows on the character's face.
export const EMOTION_FACES: Record<Emotion, FacePose> = {
  happy: { MouthForm: 1, EyeSmile: 0.6, Cheek: 0.4, BrowY: 0.3, BrowForm: 0.5 },
  excited: { MouthForm: 1, EyeSmile: 0.3, EyeOpen: 1.15, Cheek: 0.8, BrowY: 0.7, BrowForm: 0.6, MouthOpen: 0.3 },
  calm: { MouthForm: 0.5, EyeSmile: 0.3, EyeOpen: 0.9 },
  thinking: { MouthForm: -0.2, BrowForm: -0.3, BrowY: 0.2, EyeBallY: 0.6 },
  worried: { MouthForm: -0.6, BrowForm: -0.9, BrowY: -0.2, EyeOpen: 0.95 },
  sad: { MouthForm: -1, BrowForm: -1, BrowY: -0.6, EyeOpen: 0.7 },
  surprised: { MouthForm: 0, EyeOpen: 1.2, BrowY: 1, MouthOpen: 0.55 },
};

// Resting face between replies.
export const IDLE_FACE: FacePose = { MouthForm: 0.6, EyeSmile: 0.1 };

export function normalizeEmotion(value: unknown): Emotion {
  return (EMOTIONS as readonly unknown[]).includes(value) ? (value as Emotion) : "calm";
}

export function normalizeGesture(value: unknown): Gesture {
  return (GESTURES as readonly unknown[]).includes(value) ? (value as Gesture) : "none";
}
