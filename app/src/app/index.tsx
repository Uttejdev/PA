import { Link, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharacterView, type CharacterHandle } from "../character/CharacterView";
import { useVoiceConversation, type VoiceState } from "../voice/useVoiceConversation";

const LABELS: Record<VoiceState, string> = {
  starting: "Waking up…",
  paused: "Paused. Mika will wait for you.",
  listening: "Listening…",
  hearing: "I'm listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Tap Mika to interrupt",
};

// Voice-only: Mika fills the screen and listens on her own; one button pauses her.
export default function TalkScreen() {
  const character = useRef<CharacterHandle>(null);
  const insets = useSafeAreaInsets();
  const voice = useVoiceConversation(character);
  const on = !voice.paused;
  const pulse = usePulse(voice.state === "listening" || voice.state === "hearing", voice.state === "hearing");

  function newChat() {
    Alert.alert("Start a new conversation?", "Mika will forget what you've talked about. Your notes, reminders and calendar stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start over",
        style: "destructive",
        onPress: async () => {
          await voice.resetHistory();
          character.current?.react("happy", "wave");
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={newChat} hitSlop={10}>
              <Text style={styles.headerButton}>Start over</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Link href="/profile" asChild>
              <Pressable hitSlop={10}>
                <Text style={styles.headerButton}>Profile</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <View style={styles.screen}>
        <View style={styles.character}>
          <CharacterView ref={character} />
          {/* Tapping Mika while she talks skips to your turn. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={voice.interrupt} disabled={voice.state !== "speaking"} />
        </View>

        <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.label}>{voice.detail ?? LABELS[voice.state]}</Text>
          <View style={styles.buttonWrap}>
            <Animated.View style={[styles.ring, { transform: [{ scale: pulse }], opacity: on ? 1 : 0 }]} />
            <Pressable
              onPress={on ? voice.pause : voice.resume}
              disabled={voice.state === "starting"}
              style={({ pressed }) => [styles.button, !on && styles.buttonPaused, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={on ? "Pause conversation" : "Resume conversation"}
            >
              <Text style={styles.buttonIcon}>{on ? "❚❚" : "▶"}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{on ? "Pause" : "Resume"}</Text>
        </View>
      </View>
    </>
  );
}

// Breathing ring around the mic while Mika listens; bigger while you speak.
function usePulse(active: boolean, strong: boolean) {
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) {
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    const to = strong ? 1.35 : 1.15;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: to, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, strong, value]);
  return value;
}

const BUTTON = 84;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#efe9ff" },
  character: { flex: 1 },
  controls: { alignItems: "center", paddingTop: 12, gap: 14 },
  label: { fontSize: 17, color: "#5b4b8a", textAlign: "center", paddingHorizontal: 24, minHeight: 22 },
  buttonWrap: { width: BUTTON * 1.5, height: BUTTON * 1.5, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: BUTTON + 24,
    height: BUTTON + 24,
    borderRadius: (BUTTON + 24) / 2,
    backgroundColor: "rgba(124, 92, 214, 0.22)",
  },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: "#7c5cd6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5b4b8a",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonPaused: { backgroundColor: "#4caf7d" },
  pressed: { transform: [{ scale: 0.95 }] },
  buttonIcon: { fontSize: 28, color: "white", fontWeight: "700" },
  hint: { fontSize: 13, color: "#8a80a8" },
  headerButton: { color: "#5b4b8a", fontSize: 16 },
});
