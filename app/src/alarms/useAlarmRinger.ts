import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { dueOccurrence, type Alarm } from "./schedule";
import { alarmKitActive, dismissAlarm, loadAlarms, registerAlarmCategory, rescheduleAlarmNotifications, snoozeAlarm } from "./store";

export type Ringing = { alarm: Alarm; occurrence: number };

const CHECK_MS = 10_000;
const log = (msg: string) => console.log(`[alarm] ${msg}`);

// Rings alarms while the app is open: a looping chime that plays even with
// the silent switch on. When the app is closed, the scheduled notifications
// (see store.ts) do the ringing; tapping one brings you here.
export function useAlarmRinger(handlers: { onRing?: (r: Ringing) => void; onDone?: (how: "stop" | "snooze") => void } = {}) {
  // Created in an effect (not a hook) because we change its loop/volume.
  const player = useRef<AudioPlayer | null>(null);
  const [ringing, setRinging] = useState<Ringing | null>(null);
  const ringingRef = useRef<Ringing | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const ring = useCallback(
    async (r: Ringing) => {
      if (ringingRef.current?.alarm.id === r.alarm.id && ringingRef.current.occurrence === r.occurrence) return;
      log(`ringing ${r.alarm.id} (${r.alarm.label})`);
      ringingRef.current = r;
      setRinging(r);
      handlersRef.current.onRing?.(r);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }).catch(() => {});
      const p = player.current;
      if (!p) return;
      p.loop = true;
      p.volume = 1;
      await p.seekTo(0).catch(() => {});
      p.play();
    },
    [],
  );

  // Ring if an alarm is due and wasn't already stopped (fresh from the database).
  const ringIfDue = useCallback(
    async (only?: { alarmId: number; occurrence: number }) => {
      // Real iPhone alarms ring by themselves; don't ring a second time in-app.
      if (alarmKitActive()) return;
      const alarms = await loadAlarms();
      const due = dueOccurrence(alarms, Date.now());
      if (due && (!only || (only.alarmId === due.alarm.id && only.occurrence === due.occurrence))) await ring(due);
    },
    [ring],
  );

  const finish = useCallback(
    async (how: "stop" | "snooze") => {
      const r = ringingRef.current;
      player.current?.pause();
      ringingRef.current = null;
      setRinging(null);
      if (r) await (how === "stop" ? dismissAlarm(r.alarm, r.occurrence) : snoozeAlarm(r.alarm, r.occurrence));
      log(how);
      handlersRef.current.onDone?.(how);
    },
    [],
  );

  /** Quieter chime while Mika is talking over it. */
  const duck = useCallback((on: boolean) => {
    if (player.current) player.current.volume = on ? 0.2 : 1;
  }, []);

  useEffect(() => {
    player.current = createAudioPlayer(require("../../assets/sounds/alarm.wav"));
    return () => {
      player.current?.remove();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    registerAlarmCategory().catch(() => {});
    // Keep the rolling week of alarm notifications filled.
    rescheduleAlarmNotifications().catch((e) => log(`schedule failed: ${e}`));

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as { kind?: string; alarmId?: number; occurrence?: number } | undefined;
      if (data?.kind !== "alarm" || data.alarmId == null || data.occurrence == null) return;
      const target = { alarmId: data.alarmId, occurrence: data.occurrence };
      if (response!.actionIdentifier === "stop" || response!.actionIdentifier === "snooze") {
        loadAlarms().then((alarms) => {
          const alarm = alarms.find((a) => a.id === target.alarmId);
          if (!alarm) return;
          return response!.actionIdentifier === "stop" ? dismissAlarm(alarm, target.occurrence) : snoozeAlarm(alarm, target.occurrence);
        });
      } else {
        ringIfDue(target);
      }
    };
    // The app was opened by tapping an alarm notification.
    handleResponse(Notifications.getLastNotificationResponse());

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as { kind?: string; alarmId?: number; occurrence?: number };
      if (data?.kind === "alarm" && data.alarmId != null && data.occurrence != null) {
        ringIfDue({ alarmId: data.alarmId, occurrence: data.occurrence });
      }
    });
    const responded = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const timer = setInterval(() => ringIfDue().catch(() => {}), CHECK_MS);
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") ringIfDue().catch(() => {});
    });
    ringIfDue().catch(() => {});
    return () => {
      received.remove();
      responded.remove();
      clearInterval(timer);
      appState.remove();
    };
  }, [ringIfDue]);

  return { ringing, stop: () => finish("stop"), snooze: () => finish("snooze"), duck };
}

/** What Mika says when an alarm goes off. */
export function wakeUpLine(r: Ringing, name: string): string {
  const first = name.trim().split(/\s+/)[0];
  const who = first ? `, ${first}` : "";
  const d = new Date(r.occurrence);
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (r.alarm.label.startsWith("Snoozed: ")) return `Okay sleepyhead${who}, snooze is over! It's ${time}. ${r.alarm.label.slice(9)}.`;
  const hello = d.getHours() < 12 ? "Good morning" : "Hey";
  return `${hello}${who}! It's ${time}. ${r.alarm.label}. Time to get up!`;
}
