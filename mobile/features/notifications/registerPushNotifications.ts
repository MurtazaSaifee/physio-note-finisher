import * as Notifications from "expo-notifications";

export async function registerPushNotifications(): Promise<{
  token: string | null;
  status: string;
}> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, status: finalStatus };
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return { token: tokenData.data, status: finalStatus };
  } catch {
    return { token: null, status: finalStatus };
  }
}

export async function createAndroidNotificationChannel(): Promise<void> {
  if (typeof Notifications.setNotificationChannelAsync === "function") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Appointment Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3F527A",
    });
  }
}

export async function scheduleLocalReminderFallback(input: {
  title: string;
  body: string;
  scheduledAt: Date;
}): Promise<string | null> {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: true,
      },
      trigger: {
        date: input.scheduledAt,
      } as Notifications.NotificationTriggerInput,
    });
    return identifier;
  } catch {
    return null;
  }
}
