import { Link, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharacterView, type CharacterHandle } from "../character/CharacterView";
import { callServer } from "../chat/api";
import { runUserTurn, type ApiMessage } from "../chat/conversation";
import {
  clearConversation,
  loadConversation,
  MAX_HISTORY_MESSAGES,
  saveConversation,
  type ChatLine,
} from "../chat/store";
import { loadProfile } from "../lib/profile";
import { runTool, TOOL_LABELS } from "../tools";

let lineSeq = 0;
const line = (from: ChatLine["from"], text: string): ChatLine => ({ id: `${Date.now()}-${lineSeq++}`, from, text });

export default function ChatScreen() {
  const character = useRef<CharacterHandle>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  // Stack header = status bar inset + 44pt nav bar on iOS.
  const headerHeight = useSafeAreaInsets().top + 44;
  const [history, setHistory] = useState<ApiMessage[]>([]);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const busy = status !== null;

  useEffect(() => {
    loadConversation().then((c) => {
      setHistory(c.history);
      setLines(c.lines.length ? c.lines : [line("companion", "Hi! I'm Mika. Tell me about your day, or ask me to plan something.")]);
    });
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const shown = [...lines, line("user", text)];
    setLines(shown);
    setStatus("Mika is thinking…");
    character.current?.react("thinking", "none");

    // Start fresh instead of trimming once the conversation gets very long.
    const base = history.length > MAX_HISTORY_MESSAGES ? [] : history;
    try {
      const profile = await loadProfile();
      const { history: next, reply } = await runUserTurn(base, text, profile, {
        callServer,
        runTool,
        onToolStart: (name) => setStatus(`${TOOL_LABELS[name] ?? "Working"}…`),
      });
      const finalLines = [...shown, line("companion", reply.text)];
      setHistory(next);
      setLines(finalLines);
      character.current?.react(reply.emotion, reply.gesture);
      character.current?.speak(Math.min(reply.text.length * 55, 8000));
      await saveConversation({ history: next, lines: finalLines });
    } catch (err) {
      setLines([...shown, line("status", err instanceof Error ? err.message : String(err))]);
      character.current?.react("worried", "tilt_head");
    } finally {
      setStatus(null);
    }
  }

  function newChat() {
    Alert.alert("Start a new chat?", "Mika will forget this conversation. Your notes, reminders and calendar stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "New chat",
        style: "destructive",
        onPress: async () => {
          await clearConversation();
          setHistory([]);
          setLines([line("companion", "Fresh start! What's on your mind?")]);
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
            <Pressable onPress={newChat} hitSlop={10} disabled={busy}>
              <Text style={styles.headerButton}>New chat</Text>
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
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <View style={styles.characterArea}>
          <CharacterView ref={character} />
        </View>
        <View style={styles.chatArea}>
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.messages}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {lines.map((l) => (
              <View key={l.id} style={[styles.bubble, bubbleStyle[l.from]]}>
                <Text style={[styles.bubbleText, l.from === "user" && styles.userText]}>{l.text}</Text>
              </View>
            ))}
            {status && (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color="#7a6f9b" />
                <Text style={styles.statusText}>{status}</Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Message Mika…"
              placeholderTextColor="#9d94b8"
              multiline
              onSubmitEditing={send}
              submitBehavior="submit"
              returnKeyType="send"
            />
            <Pressable style={[styles.send, (busy || !input.trim()) && styles.sendDisabled]} onPress={send} disabled={busy}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf8ff" },
  characterArea: { flex: 1 },
  chatArea: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#d9d0f0" },
  messages: { padding: 12, gap: 8 },
  bubble: { maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  bubbleText: { fontSize: 16, lineHeight: 21, color: "#2c2640" },
  userText: { color: "white" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  statusText: { color: "#7a6f9b", fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8, backgroundColor: "white" },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: "#f2eefc",
    fontSize: 16,
    color: "#2c2640",
  },
  send: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "#7c5cd6", justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "white", fontWeight: "600", fontSize: 16 },
  headerButton: { color: "#5b4b8a", fontSize: 16 },
});

const bubbleStyle = StyleSheet.create({
  user: { alignSelf: "flex-end", backgroundColor: "#7c5cd6" },
  companion: { alignSelf: "flex-start", backgroundColor: "#ece6fb" },
  status: { alignSelf: "center", backgroundColor: "#fff1e6" },
});
