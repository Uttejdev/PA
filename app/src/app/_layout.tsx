import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// Show reminders even while the app is open. Alarms are rung by the app
// itself when it's open (see useAlarmRinger), so their banner stays quiet.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const isAlarm = n.request.content.data?.kind === "alarm";
    return { shouldShowBanner: !isAlarm, shouldShowList: true, shouldPlaySound: !isAlarm, shouldSetBadge: false };
  },
});

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: "#5b4b8a", headerStyle: { backgroundColor: "#efe9ff" } }}>
        <Stack.Screen name="index" options={{ title: "Mika" }} />
        <Stack.Screen name="profile" options={{ title: "About you", presentation: "modal" }} />
        <Stack.Screen name="alarms" options={{ title: "Alarms", presentation: "modal" }} />
      </Stack>
    </>
  );
}
