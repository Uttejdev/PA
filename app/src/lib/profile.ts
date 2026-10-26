import { getJson, setJson } from "./db";

export type Profile = { name: string; goals: string; routines: string };

export const EMPTY_PROFILE: Profile = { name: "", goals: "", routines: "" };

export const loadProfile = () => getJson<Profile>("profile", EMPTY_PROFILE);
export const saveProfile = (p: Profile) => setJson("profile", p);
