import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// Show reminder notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: "#5b4b8a", headerStyle: { backgroundColor: "#efe9ff" } }}>
        <Stack.Screen name="index" options={{ title: "Mika" }} />
        <Stack.Screen name="profile" options={{ title: "About you", presentation: "modal" }} />
      </Stack>
    </>
  );
}
