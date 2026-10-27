import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { nextOccurrences, type Alarm } from "../alarms/schedule";
import { alarmKitActive, deleteAlarm, describeAlarm, loadAlarms, onAlarmsChanged, setAlarmEnabled } from "../alarms/store";

// See, switch off and delete alarms. New ones are set by asking Mika.
export default function AlarmsScreen() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refresh = () =>
      loadAlarms().then((a) => {
        setAlarms(a);
        setNow(Date.now());
      });
    refresh();
    return onAlarmsChanged(refresh);
  }, []);

  const confirmDelete = (a: Alarm) =>
    Alert.alert("Delete alarm?", `${a.label} (${describeAlarm(a)})`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteAlarm(a.id) },
    ]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={alarms}
      keyExtractor={(a) => String(a.id)}
      ListHeaderComponent={
        <Text style={styles.hint}>
          {alarmKitActive()
            ? "Ask Mika to set one, like “wake me up at 7 on weekdays”. These are real iPhone alarms: they ring on the lock screen, in silent mode and Focus, even when the app is closed."
            : "Ask Mika to set one, like “wake me up at 7 on weekdays”. Alarms ring loudest with the app open (it works in silent mode too); when the app is closed you get alarm notifications instead. Real iPhone alarms need Mika's own build (see README)."}
        </Text>
      }
      ListEmptyComponent={<Text style={styles.empty}>No alarms yet.</Text>}
      renderItem={({ item }) => {
        const next = nextOccurrences(item, now)[0];
        return (
          <Pressable style={styles.row} onLongPress={() => confirmDelete(item)}>
            <View style={styles.rowText}>
              <Text style={[styles.time, !item.enabled && styles.off]}>{describeAlarm(item)}</Text>
              <Text style={styles.label}>
                {item.label}
                {item.enabled && next ? ` · next ${new Date(next).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
              </Text>
            </View>
            <Switch value={item.enabled} onValueChange={(v) => setAlarmEnabled(item.id, v)} />
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#faf8ff" },
  content: { padding: 16, gap: 10 },
  hint: { color: "#7a6f9b", fontSize: 14, marginBottom: 8, lineHeight: 20 },
  empty: { color: "#7a6f9b", fontSize: 16, textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2dbf5",
  },
  rowText: { flex: 1, gap: 2 },
  time: { fontSize: 20, fontWeight: "600", color: "#2c2640" },
  off: { color: "#b3abc9" },
  label: { fontSize: 14, color: "#5b4b8a" },
  delete: { color: "#e0566b", fontSize: 15 },
});
