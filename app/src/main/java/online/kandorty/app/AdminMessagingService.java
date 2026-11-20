package online.kandorty.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Receives app-owned FCM messages independently of Chrome and WebView.
 * A real sender must use owner-authenticated device token enrollment and
 * server-side order events. Never accept client-created or public topics.
 */
public class AdminMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL = "kandorty_admin_orders_v1";

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        // Do not send tokens to unverified endpoints or log them.
        getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .edit().putString("pending_fcm_token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (!"kandorty_new_order".equals(message.getData().get("kind"))) return;

        String orderCode = message.getData().get("orderId");
        if (orderCode == null || !orderCode.matches("KD-[A-Za-z0-9_-]{4,40}")) {
            orderCode = "";
        }
        String event = message.getMessageId();
        if (event != null && event.equals(getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .getString("last_event_id", ""))) return;
        if (event != null) getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .edit().putString("last_event_id", event).apply();
        notifyOrder(orderCode);
    }

    private void notifyOrder(String orderCode) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "إشعارات الطلبات الجديدة",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("إشعارات الطلبات الجديدة من إدارة كندورتي");
            channel.enableVibration(true);
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null);
            nm.createNotificationChannel(channel);
        }

        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent tap = PendingIntent.getActivity(this, 1, launch, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.kandorty_icon)
                .setContentTitle("🔔 طلب جديد - كندورتي")
                .setContentText(orderCode.isEmpty() ? "لديك طلب جديد. افتحي إدارة الطلبات." :
                        "طلب جديد: " + orderCode)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
    }
}
