import { getJson, setJson } from "./db";

// language: ISO-639-1 code of the language the user speaks to Mika.
export type Profile = { name: string; goals: string; routines: string; language: string };

export const EMPTY_PROFILE: Profile = { name: "", goals: "", routines: "", language: "en" };

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "mr", name: "Marathi" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
];

// Older saved profiles have no language yet, so fill in the defaults.
export const loadProfile = async (): Promise<Profile> => ({ ...EMPTY_PROFILE, ...(await getJson<Partial<Profile>>("profile", {})) });
export const saveProfile = (p: Profile) => setJson("profile", p);
