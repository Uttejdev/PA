import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { EMPTY_PROFILE, loadProfile, saveProfile, type Profile } from "../lib/profile";

// Sent to Claude with every message so Mika's replies are personal.
export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      setLoaded(true);
    });
  }, []);

  const set = (key: keyof Profile) => (value: string) => setProfile((p) => ({ ...p, [key]: value }));

  async function save() {
    await saveProfile(profile);
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Your name</Text>
        <TextInput style={styles.input} value={profile.name} onChangeText={set("name")} placeholder="What should Mika call you?" editable={loaded} />

        <Text style={styles.label}>Goals</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={profile.goals}
          onChangeText={set("goals")}
          placeholder="e.g. Run a 10k by March, read 12 books this year, ship my app"
          multiline
          editable={loaded}
        />

        <Text style={styles.label}>Routines</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={profile.routines}
          onChangeText={set("routines")}
          placeholder="e.g. Wake 7am, gym Tue/Thu evenings, deep work 9-12, bed by 11"
          multiline
          editable={loaded}
        />

        <Text style={styles.hint}>Stored only on this phone, and sent to Claude with each message so Mika knows you.</Text>

        <Pressable style={styles.save} onPress={save} disabled={!loaded}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf8ff" },
  content: { padding: 16, gap: 6 },
  label: { marginTop: 12, fontSize: 15, fontWeight: "600", color: "#5b4b8a" },
  input: { backgroundColor: "white", borderRadius: 12, padding: 12, fontSize: 16, color: "#2c2640", borderWidth: 1, borderColor: "#e2dbf5" },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  hint: { marginTop: 12, color: "#7a6f9b", fontSize: 13 },
  save: { marginTop: 20, backgroundColor: "#7c5cd6", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveText: { color: "white", fontWeight: "600", fontSize: 17 },
});
