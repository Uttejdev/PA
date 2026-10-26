import Constants from "expo-constants";

const SERVER_PORT = 8787;

// Where the Claude proxy (the server/ folder) is running.
// - Set EXPO_PUBLIC_SERVER_URL in app/.env to point somewhere specific.
// - Otherwise we reuse the Mac's address that Expo Go already connects to
//   (e.g. 192.168.1.20:8081) and swap in the server port.
export function serverUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:${SERVER_PORT}`;
}
