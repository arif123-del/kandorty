package online.kandorty.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.media.AudioAttributes;
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
    private static final String CHANNEL = "kandorty_admin_orders_v2"; // new channel: Android keeps old channel sound settings

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        // Do not send tokens to unverified endpoints or log them.
        getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .edit().putString("pending_fcm_token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        String kind = message.getData().get("kind");
        if (!"kandorty_new_order".equals(kind) && !"kandorty_push_test".equals(kind)) return;

        String orderCode = message.getData().get("orderId");
        if (orderCode == null || !orderCode.matches("KD-[A-Za-z0-9_-]{4,40}")) {
            orderCode = "";
        }
        String event = message.getMessageId();
        if (event != null && event.equals(getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .getString("last_event_id", ""))) return;
        if (event != null) getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .edit().putString("last_event_id", event).apply();
        notifyOrder(orderCode, "kandorty_push_test".equals(kind));
    }

    public static void ensureChannel(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "إشعارات كندورتي العاجلة", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("تنبيه صوتي وفوري للطلبات الجديدة في إدارة كندورتي");
        channel.enableVibration(true);
        channel.setShowBadge(true);
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attributes);
        nm.createNotificationChannel(channel);
    }

    public static void showLocalTestNotification(Context context) {
        ensureChannel(context);
        postNotification(context, "", true);
    }

    private void notifyOrder(String orderCode, boolean test) {
        ensureChannel(this);
        postNotification(this, orderCode, test);
    }

    private static void postNotification(Context context, String orderCode, boolean test) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return;
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent tap = PendingIntent.getActivity(context, 1, launch, flags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);
        b.setSmallIcon(R.drawable.kandorty_icon)
                .setContentTitle(test ? "🔔 اختبار إشعار كندورتي" : "🔔 طلب جديد - كندورتي")
                .setContentText(test ? "هذا اختبار للتنبيه الصوتي في التطبيق" :
                        (orderCode.isEmpty() ? "لديك طلب جديد. افتحي إدارة الطلبات." : "طلب جديد: " + orderCode))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        nm.notify((int)(System.currentTimeMillis() & 0x7fffffff), b.build());
    }
}
