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
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AppState } from "react-native";
import type { CharacterHandle } from "../character/CharacterView";
import { audioUrl, callServer, speak, transcribe } from "../chat/api";
import { runUserTurn, type ApiMessage } from "../chat/conversation";
import { loadConversation, MAX_HISTORY_MESSAGES, saveConversation, type ChatLine } from "../chat/store";
import { serverUrl } from "../lib/config";
import { loadProfile } from "../lib/profile";
import { runTool, TOOL_LABELS } from "../tools";
import { greeting } from "./greeting";
import { Vad } from "./vad";

export type VoiceState = "starting" | "paused" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

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
const KEEP_AWAKE_TAG = "mika-conversation";

// Shows in the Expo window on the Mac, to see where a voice turn gets stuck.
const log = (msg: string) => console.log(`[voice] ${msg}`);

let lineSeq = 0;
const line = (from: ChatLine["from"], text: string): ChatLine => ({ id: `${Date.now()}-${lineSeq++}`, from, text });

// Always-on, hands-free conversation. When the app opens Mika greets you and
// starts listening; each time you stop talking she transcribes, lets Claude
// answer (running tools on the phone), speaks, and listens again. She never
// listens while she's talking, so she can't hear herself. Pause makes her
// wait; tapping her while she talks skips to your turn.
export function useVoiceConversation(character: RefObject<CharacterHandle | null>) {
  const recorder = useAudioRecorder(RECORDING);
  const player = useAudioPlayer(null);
  const [state, setStateValue] = useState<VoiceState>("starting");
  const [detail, setDetail] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>("starting");
  const active = useRef(false);
  const greeted = useRef(false);
  const pausedByBackground = useRef(false);
  const history = useRef<ApiMessage[]>([]);
  const lines = useRef<ChatLine[]>([]);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const endPlayback = useRef<(() => void) | null>(null);
  const lastMouth = useRef(0);

  const setState = (s: VoiceState) => {
    if (stateRef.current !== s) log(`state: ${s}`);
    stateRef.current = s;
    setStateValue(s);
  };

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

  const pauseInternal = async (reason: string, message: string | null) => {
    log(`pause (${reason})`);
    active.current = false;
    await stopRecording().catch(() => {});
    player.pause();
    endPlayback.current?.();
    character.current?.stopSpeaking();
    setState("paused");
    setDetail(message);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  };

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
        log(err ? `playback failed: ${err.message}` : "playback done");
        if (err) reject(err);
        else resolve();
      };
      endPlayback.current = () => finish();
      // Playback-only audio mode, so the voice comes out of the main speaker.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
        .then(() => {
          log(`playing ${path}`);
          player.replace({ uri: audioUrl(path) });
          player.play();
        })
        .catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
    });

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log(`error: ${message}`);
    character.current?.react("worried", "tilt_head");
    pauseInternal("error", `${message} Tap Resume to try again.`);
  };

  const handleUtterance = async (uri: string) => {
    setState("transcribing");
    const audio = await new File(uri).arrayBuffer();
    log(`sending ${(audio.byteLength / 1024).toFixed(0)} KB of audio`);
    const text = await transcribe(audio, "audio/mp4");
    log(`heard: ${text || "(nothing)"}`);
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
    await stopRecording();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState("listening");
    const vad = new Vad();
    let ticks = 0;
    poll.current = setInterval(() => {
      const status = recorder.getStatus();
      // Every few seconds, show what the mic hears (dB: -160 silent … 0 loud).
      if (ticks++ % 30 === 0) log(`mic: ${status.metering === undefined ? "no level" : status.metering.toFixed(0) + " dB"}`);
      const event = vad.push(status.metering, Date.now());
      if (event === "speech_start") setState("hearing");
      if (event === "no_speech") {
        // Nobody spoke for a while: throw that recording away and keep listening.
        listen().catch(fail);
      } else if (event === "speech_end") {
        clearPoll();
        recorder
          .stop()
          .then(() => {
            if (!recorder.uri) throw new Error("The recording didn't save.");
            return handleUtterance(recorder.uri);
          })
          .catch(fail);
      }
    }, POLL_MS);
  };

  const begin = async () => {
    if (active.current) return;
    const perm = await requestRecordingPermissionsAsync();
    log(`mic permission: ${perm.status}, server: ${serverUrl()}`);
    if (!perm.granted) {
      setState("paused");
      setDetail("Mika needs the microphone. Allow it in iPhone Settings → Expo Go, then tap Resume.");
      return;
    }
    active.current = true;
    setDetail(null);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    if (!greeted.current) {
      greeted.current = true;
      const profile = await loadProfile();
      character.current?.react("happy", "wave");
      try {
        await play(await speak(greeting(profile.name)));
      } catch (err) {
        // A missing greeting shouldn't stop her from listening.
        log(`greeting failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await listen();
  };

  const resume = useCallback(() => {
    pausedByBackground.current = false;
    begin().catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    pausedByBackground.current = false;
    pauseInternal("button", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Skip the rest of Mika's reply and listen right away. */
  const interrupt = useCallback(() => {
    if (stateRef.current !== "speaking") return;
    player.pause();
    endPlayback.current?.();
  }, [player]);

  /** Speak a line without listening afterwards (e.g. over a ringing alarm). */
  const say = useCallback(async (text: string) => {
    try {
      await play(await speak(text));
    } catch (err) {
      log(`say failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!active.current) setState("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Forget the conversation so far (notes, reminders and calendar stay). */
  const resetHistory = useCallback(async () => {
    history.current = [];
    lines.current = [];
    await saveConversation({ history: [], lines: [] });
  }, []);

  // Start talking as soon as the screen opens.
  useEffect(() => {
    loadConversation()
      .then((c) => {
        history.current = c.history;
        lines.current = c.lines;
      })
      .finally(() => begin().catch(fail));
    return () => {
      active.current = false;
      clearPoll();
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only a real switch away from the app pauses her ("inactive" also fires for
  // brief things like Control Center or a banner). She resumes when you return.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" && active.current) {
        pausedByBackground.current = true;
        pauseInternal("app in background", null);
      } else if (s === "active" && pausedByBackground.current) {
        pausedByBackground.current = false;
        begin().catch(fail);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, detail, paused: state === "paused", pause, resume, interrupt, say, resetHistory };
}
