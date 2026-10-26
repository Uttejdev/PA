import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildCharacterHtml } from "./characterHtml";
import type { Emotion, Gesture } from "./mapping";

export type CharacterHandle = {
  react: (emotion: Emotion, gesture: Gesture) => void;
  speak: (ms: number) => void;
  stopSpeaking: () => void;
  /** Live mouth openness 0..1 from the voice's volume (lip sync). */
  mouth: (level: number) => void;
};

type Props = { onError?: (message: string) => void };

// Renders the Live2D character (pixi-live2d-display) inside a WebView, since
// Live2D has no React Native renderer. We talk to the page by
// injecting small JS calls; it reports back with postMessage.
export const CharacterView = forwardRef<CharacterHandle, Props>(function CharacterView({ onError }, ref) {
  const webview = useRef<WebView<object>>(null);
  const html = useMemo(() => buildCharacterHtml(), []);

  const call = (js: string) => webview.current?.injectJavaScript(`window.companion && ${js}; true;`);

  useImperativeHandle(ref, () => ({
    react: (emotion, gesture) => call(`window.companion.react(${JSON.stringify({ emotion, gesture })})`),
    speak: (ms) => call(`window.companion.speak(${Math.round(ms)})`),
    stopSpeaking: () => call("window.companion.stopSpeaking()"),
    mouth: (level) => call(`window.companion.mouth(${level.toFixed(2)})`),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "error") onError?.(msg.message);
      if (msg.type === "ready") console.log("[character] ready", msg.model, msg.license);
    } catch {
      // ignore non-JSON messages
    }
  };

  return (
    <View style={styles.container}>
      {/* Explicit <object>: the default generic (undefined) makes the props type `never`. */}
      <WebView<object>
        ref={webview}
        source={{ html, baseUrl: "https://localhost/" }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        // The page is transparent; the container's background shows through.
        containerStyle={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#efe9ff" },
  webview: { flex: 1, backgroundColor: "transparent" },
});
