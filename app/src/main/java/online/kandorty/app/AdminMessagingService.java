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
    public static final String CHANNEL = "kandorty_admin_orders_v2";

    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        // Do not send tokens to unverified endpoints or log them.
        getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .edit().putString("pending_fcm_token", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        String kind = message.getData().get("kind");
        if ("kandorty_push_test".equals(kind)) {
            showTestNotification(this);
            return;
        }
        if (!"kandorty_new_order".equals(kind)) return;

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

    /** Initialize before first FCM message, so Android can ring even with the app closed. */
    public static void ensureNotificationChannel(Context app) {
        NotificationManager nm=(NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE);
        if(nm==null || Build.VERSION.SDK_INT<26)return;
        NotificationChannel channel=new NotificationChannel(CHANNEL,
                "طلبات كندورتي الجديدة",NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("صوت وتنبيه عند وصول طلب جديد حتى عند إغلاق التطبيق");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0,380,180,380,180,380});
        AudioAttributes audio=new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),audio);
        nm.createNotificationChannel(channel);
    }

    /** Local sound/permission diagnostic: no order is created and no customer data is read. */
    public static boolean showTestNotification(Context app) {
        if (Build.VERSION.SDK_INT >= 33 &&
                app.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
        ensureNotificationChannel(app);
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL);
            if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        Notification.Builder alert = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(app, CHANNEL)
                : new Notification.Builder(app);
        alert.setSmallIcon(R.drawable.kandorty_icon)
                .setContentTitle("🔔 اختبار جرس كندورتي")
                .setContentText("هذا اختبار لصوت الطلبات، وليس طلباً حقيقياً.")
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setPriority(Notification.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        nm.notify(17401, alert.build());
        return true;
    }

    private void notifyOrder(String orderCode) {
        ensureNotificationChannel(this);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

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
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setPriority(Notification.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
    }
}
