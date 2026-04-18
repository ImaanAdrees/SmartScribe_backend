import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendExpoPushNotifications(pushTokens, message) {
  if (!Array.isArray(pushTokens) || pushTokens.length === 0) return;
  const messages = pushTokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: 'default',
      body: message.body,
      title: message.title,
      data: message.data || {},
      priority: 'high',
    }));
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('[ExpoPush] Error sending push notification:', error);
    }
  }
  return tickets;
}
