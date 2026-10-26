import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioSampleListener,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AppState } from "react-native";
import type { CharacterHandle } from "../character/CharacterView";
import { audioUrl, callServer, transcribe } from "../chat/api";
import { runUserTurn, type ApiMessage } from "../chat/conversation";
import { loadConversation, MAX_HISTORY_MESSAGES, saveConversation, type ChatLine } from "../chat/store";
import { loadProfile } from "../lib/profile";
import { runTool, TOOL_LABELS } from "../tools";
import { Vad } from "./vad";

export type VoiceState = "off" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

// Small mono AAC files: plenty for speech recognition, quick to upload.
const RECORDING: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: "audio/webm" },
};

const POLL_MS = 100;
const PLAYBACK_START_TIMEOUT_MS = 15_000;
const PLAYBACK_MAX_MS = 120_000;

let lineSeq = 0;
const line = (from: ChatLine["from"], text: string): ChatLine => ({ id: `${Date.now()}-${lineSeq++}`, from, text });

// Hands-free conversation: listen until the user stops talking, transcribe,
// let Claude answer (running tools on the phone), play Mika's voice, then
// listen again. Mika never listens while she's talking, so she can't hear
// herself; tapping her while she talks skips to listening.
export function useVoiceConversation(character: RefObject<CharacterHandle | null>) {
  const recorder = useAudioRecorder(RECORDING);
  const player = useAudioPlayer(null);
  const [state, setStateValue] = useState<VoiceState>("off");
  const [detail, setDetail] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>("off");
  const active = useRef(false);
  const history = useRef<ApiMessage[]>([]);
  const lines = useRef<ChatLine[]>([]);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const endPlayback = useRef<(() => void) | null>(null);
  const lastMouth = useRef(0);

  const setState = (s: VoiceState) => {
    stateRef.current = s;
    setStateValue(s);
  };

  useEffect(() => {
    loadConversation().then((c) => {
      history.current = c.history;
      lines.current = c.lines;
    });
  }, []);

  // Lip sync: turn the playing voice's volume into mouth openness.
  useAudioSampleListener(player, (sample) => {
    const now = Date.now();
    if (now - lastMouth.current < 60) return;
    lastMouth.current = now;
    const frames = sample.channels[0]?.frames;
    if (!frames?.length) return;
    let sum = 0;
    for (const f of frames) sum += f * f;
    character.current?.mouth(Math.min(1, Math.sqrt(sum / frames.length) * 4));
  });

  useEffect(() => {
    let spoke = false;
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.playing && !spoke && s.duration > 0) {
        spoke = true;
        // Fallback mouth motion in case live samples aren't available.
        character.current?.speak(s.duration * 1000);
      }
      if (s.didJustFinish) {
        spoke = false;
        endPlayback.current?.();
      }
    });
    return () => sub.remove();
  }, [player, character]);

  const clearPoll = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };

  const stopRecording = async () => {
    clearPoll();
    if (recorder.isRecording) await recorder.stop();
  };

  const stop = useCallback(async (message: string | null = null) => {
    active.current = false;
    await stopRecording().catch(() => {});
    player.pause();
    endPlayback.current?.();
    character.current?.stopSpeaking();
    setState("off");
    setDetail(message);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, character]);

  const play = (path: string) =>
    new Promise<void>((resolve, reject) => {
      setState("speaking");
      const started = Date.now();
      const watchdog = setInterval(() => {
        if (!player.playing && !player.isLoaded && Date.now() - started > PLAYBACK_START_TIMEOUT_MS) {
          finish(new Error("Couldn't play Mika's voice. Check the server window for errors."));
        } else if (Date.now() - started > PLAYBACK_MAX_MS) {
          finish();
        }
      }, 500);
      const finish = (err?: Error) => {
        clearInterval(watchdog);
        endPlayback.current = null;
        character.current?.stopSpeaking();
        if (err) reject(err);
        else resolve();
      };
      endPlayback.current = () => finish();
      // Playback-only audio mode, so the voice comes out of the main speaker.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
        .then(() => {
          player.replace({ uri: audioUrl(path) });
          player.play();
        })
        .catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
    });

  const handleUtterance = async (uri: string) => {
    setState("transcribing");
    const audio = await new File(uri).arrayBuffer();
    const text = await transcribe(audio, "audio/mp4");
    if (!active.current) return;
    if (!text) return listen(); // just noise

    setState("thinking");
    character.current?.react("thinking", "think");
    const profile = await loadProfile();
    // Start fresh instead of trimming once the conversation gets very long.
    const base = history.current.length > MAX_HISTORY_MESSAGES ? [] : history.current;
    const turn = await runUserTurn(
      base,
      text,
      profile,
      { callServer, runTool, onToolStart: (name) => setDetail(`${TOOL_LABELS[name] ?? "Working"}…`) },
      { voice: true },
    );
    history.current = turn.history;
    lines.current = [...lines.current, line("user", text), line("companion", turn.reply.text)].slice(-200);
    saveConversation({ history: turn.history, lines: lines.current }).catch(() => {});
    setDetail(null);
    if (!active.current) return;

    character.current?.react(turn.reply.emotion, turn.reply.gesture);
    if (turn.audioUrl) await play(turn.audioUrl);
    else setDetail(turn.reply.text); // no voice came back; show what she meant to say
    if (active.current) await listen();
  };

  const listen = async (): Promise<void> => {
    if (!active.current) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState("listening");
    const vad = new Vad();
    clearPoll();
    poll.current = setInterval(() => {
      const event = vad.push(recorder.getStatus().metering, Date.now());
      if (event === "speech_start") setState("hearing");
      if (event === "no_speech") {
        stop("Tap the mic when you want to talk.");
      } else if (event === "speech_end") {
        clearPoll();
        recorder
          .stop()
          .then(() => {
            if (!recorder.uri) throw new Error("The recording didn't save. Try again?");
            return handleUtterance(recorder.uri);
          })
          .catch(fail);
      }
    }, POLL_MS);
  };

  const fail = (err: unknown) => {
    character.current?.react("worried", "tilt_head");
    stop(err instanceof Error ? err.message : String(err));
  };

  const start = useCallback(async () => {
    if (active.current) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setDetail("Mika needs the microphone. Allow it in iPhone Settings, then try again.");
      return;
    }
    active.current = true;
    setDetail(null);
    character.current?.react("happy", "none");
    listen().catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  /** Skip the rest of Mika's reply and listen right away. */
  const interrupt = useCallback(() => {
    if (stateRef.current !== "speaking") return;
    player.pause();
    endPlayback.current?.();
  }, [player]);

  /** Forget the conversation so far (notes, reminders and calendar stay). */
  const resetHistory = useCallback(async () => {
    history.current = [];
    lines.current = [];
    await saveConversation({ history: [], lines: [] });
  }, []);

  // Stop listening when the app leaves the screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && active.current) stop(null);
    });
    return () => sub.remove();
  }, [stop]);

  return { state, detail, start, stop: () => stop(null), interrupt, resetHistory };
}
