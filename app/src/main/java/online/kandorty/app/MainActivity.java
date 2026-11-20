package online.kandorty.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.provider.Settings;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONTokener;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SafeBrowsingResponse;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/** Dedicated Kandorty Admin application. Does NOT launch a browser on startup. */
public class MainActivity extends Activity {
    private static final String ADMIN_URL = "https://kandorty.online/admin.html";
    private static final int PICK_FILE = 401;
    private static final int ASK_NOTIFICATIONS = 402;

    private WebView web;
    private ProgressBar progress;
    private LinearLayout offline;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler nativePushHandler = new Handler(Looper.getMainLooper());
    private long lastNativePushEnrollmentAt = 0L;
    private boolean nativePushEnrollmentRunning = false;
    private final Runnable nativePushTicker = new Runnable() {
        @Override public void run() {
            registerNativePushWhenSignedIn();
            nativePushHandler.postDelayed(this, 30000);
        }
    };
    private static final String FCM_ENROLLMENT_URL =
            "https://kandorty-stripe-release.aliyajan200011.workers.dev/admin/native-push";

    private static boolean isTrusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && ("kandorty.online".equalsIgnoreCase(uri.getHost())
                || "www.kandorty.online".equalsIgnoreCase(uri.getHost()))
                && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFFFFFFFF);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFFFFFFF);
        web = new WebView(this);
        web.setId(R.id.admin_webview);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this);
        FrameLayout.LayoutParams loading = new FrameLayout.LayoutParams(88, 88, Gravity.CENTER);
        root.addView(progress, loading);

        offline = new LinearLayout(this);
        offline.setPadding(32, 48, 32, 48);
        offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(Gravity.CENTER);
        offline.setBackgroundColor(0xFFFFFFFF);
        TextView failure = new TextView(this);
        failure.setText("تعذّر فتح إدارة كندورتي. تحقّقي من الإنترنت ثم أعيدي المحاولة.");
        failure.setGravity(Gravity.CENTER);
        failure.setTextSize(18f);
        offline.addView(failure, new LinearLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT));
        Button retry = new Button(this);
        retry.setText("إعادة المحاولة");
        retry.setOnClickListener(v -> openAdmin());
        offline.addView(retry);
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        offline.setVisibility(View.GONE);
        Button pushStatusButton = new Button(this);
        pushStatusButton.setText("🔔");
        pushStatusButton.setAllCaps(false);
        pushStatusButton.setContentDescription("فحص تنبيهات إدارة كندورتي");
        int dp = (int) getResources().getDisplayMetrics().density;
        FrameLayout.LayoutParams bellPlacement = new FrameLayout.LayoutParams(60 * dp, 50 * dp,
                Gravity.BOTTOM | Gravity.RIGHT);
        bellPlacement.rightMargin = 8 * dp;
        bellPlacement.bottomMargin = 12 * dp;
        root.addView(pushStatusButton, bellPlacement);
        pushStatusButton.setOnClickListener(v -> showPushDiagnostics());
        setContentView(root);
        AdminMessagingService.ensureChannel(this);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); // Required for Firebase Auth and existing admin.
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Android's system document picker.
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (isTrusted(uri) || "about".equals(uri.getScheme())) return false;
                // External HTTPS websites never get loaded with Kandorty admin privileges.
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
                offline.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                // Android WebView intentionally does not use the site's Chrome
                // PushManager. Keep the working in-page order sound control,
                // without prompting for unsupported browser background push.
                if (isTrusted(Uri.parse(url)) && url.contains("/admin.html")) {
                    nativePushHandler.postDelayed(() -> registerNativePushWhenSignedIn(), 4000);
                    view.evaluateJavascript(
                        "(function(){" +
                        "const b=document.getElementById('orderSoundBtn');" +
                        "if(!b)return;" +
                        "b.textContent='🔊 تفعيل صوت الطلبات داخل التطبيق';" +
                        "b.onclick=function(){" +
                        "localStorage.setItem('kandorty_order_sound_enabled_v1','1');" +
                        "if(typeof unlockOrderSound==='function'){" +
                        "unlockOrderSound(true).then(function(ok){" +
                        "if(ok && typeof playNewOrderSound==='function')playNewOrderSound(true);" +
                        "});}" +
                        "b.textContent='🔊 صوت الطلبات مُفعّل داخل التطبيق';" +
                        "};" +
                        "})();", null);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progress.setVisibility(View.GONE);
                    offline.setVisibility(View.VISIBLE);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                         FileChooserParams params) {
                if (!isTrusted(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) {
                    callback.onReceiveValue(null);
                    return true;
                }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent picker = params.createIntent();
                    startActivityForResult(picker, PICK_FILE);
                } catch (Exception error) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "تعذّر اختيار الملف", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress >= 85) progress.setVisibility(View.GONE);
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri u = Uri.parse(url);
            if (!isTrusted(u)) {
                // Don't forward the admin's cookies to other download hosts.
                if ("https".equalsIgnoreCase(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
                    catch (Exception ignored) {}
                }
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(u);
                request.setMimeType(mimeType);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                String fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "جارٍ تنزيل الملف", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "تعذّر تنزيل الملف", Toast.LENGTH_SHORT).show();
            }
        });

        // Firebase Cloud Messaging is optional at build time: the native app
        // already runs alone, but real background push needs an Android app
        // registered in the Firebase project and a secured server enrollment.
        if (BuildConfig.NATIVE_FCM_CONFIGURED && !FirebaseApp.getApps(this).isEmpty()) {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIFICATIONS);
            }
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .edit().putString("pending_fcm_token", token)
                        .putBoolean("fcm_token_ok", true).apply();
                nativePushHandler.postDelayed(() -> registerNativePushWhenSignedIn(), 1500);
            }).addOnFailureListener(error ->
                getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .edit().putBoolean("fcm_token_ok", false)
                        .putString("last_status", "fcm_token_error").apply());
        }

        openAdmin();
    }

    private void openAdmin() {
        offline.setVisibility(View.GONE);
        web.loadUrl(ADMIN_URL);
    }

    /**
     * The Firebase web Auth session lives in WebView. Read the *signed-in*
     * user's short-lived ID token only on the trusted administration origin.
     * No JS interface is exposed to arbitrary frames or remote content.
     */
    private void registerNativePushWhenSignedIn() {
        requestNativePush(false);
    }

    private void requestNativePush(boolean test) {
        if (!BuildConfig.NATIVE_FCM_CONFIGURED || web == null || web.getUrl() == null
                || !isTrusted(Uri.parse(web.getUrl()))
                || !web.getUrl().contains("/admin.html")
                || nativePushEnrollmentRunning) return;
        long now = System.currentTimeMillis();
        if (!test && now - lastNativePushEnrollmentAt < 15 * 60 * 1000L) return;
        String deviceToken = getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .getString("pending_fcm_token", "");
        if (deviceToken.isEmpty()) return;
        nativePushEnrollmentRunning = true;
        web.evaluateJavascript(
            "(function(){try{" +
            "if(typeof auth==='undefined'||!auth.currentUser)return 'NO_LOGIN';" +
            "window.__kandortyNativeFcmLoginToken='';" +
            "auth.currentUser.getIdToken().then(function(t){" +
              "window.__kandortyNativeFcmLoginToken=t;" +
            "}).catch(function(){window.__kandortyNativeFcmLoginToken='';});" +
            "return 'PENDING';}catch(e){return 'FAILED';}})()",
            result -> nativePushHandler.postDelayed(() -> {
                if (web == null || web.getUrl() == null ||
                        !isTrusted(Uri.parse(web.getUrl()))) {
                    nativePushEnrollmentRunning = false;
                    return;
                }
                web.evaluateJavascript(
                    "(function(){const t=window.__kandortyNativeFcmLoginToken||'';" +
                    "window.__kandortyNativeFcmLoginToken='';return t;})()",
                    value -> {
                        nativePushEnrollmentRunning = false;
                        String idToken;
                        try {
                            Object parsed = new JSONTokener(value).nextValue();
                            idToken = parsed instanceof String ? (String) parsed : "";
                        } catch (Exception ignored) { return; }
                        if (!idToken.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")
                                || idToken.length() > 12000) return;
                        new Thread(() -> enrollDeviceOverHttps(idToken, deviceToken, test),
                                "kandorty-native-push-enroll").start();
                    });
            }, 1300));
    }

    private void enrollDeviceOverHttps(String idToken, String deviceToken, boolean test) {
        HttpsURLConnection connection = null;
        try {
            URL endpoint = new URL(FCM_ENROLLMENT_URL);
            connection = (HttpsURLConnection) endpoint.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setInstanceFollowRedirects(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Origin", "https://kandorty.online");
            connection.setRequestProperty("Authorization", "Bearer " + idToken);
            byte[] payload = new JSONObject()
                    .put("action", "register").put("token", deviceToken)
                    .toString().getBytes(StandardCharsets.UTF_8);
            connection.getOutputStream().write(payload);
            int status = connection.getResponseCode();
            getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                    .edit().putInt("last_http_status", status)
                    .putString("last_status", status == 200 ? "registered" : "server_http_" + status)
                    .apply();
            if (status == 200) {
                lastNativePushEnrollmentAt = System.currentTimeMillis();
                getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .edit().putLong("last_registration", lastNativePushEnrollmentAt).apply();
                if (test) sendNativePushTest(idToken, deviceToken);
            }
            // Never log Firebase JWTs, FCM tokens, or customer information.
        } catch (Exception ignored) {
            getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                    .edit().putString("last_status", "network_error").apply();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void sendNativePushTest(String idToken, String deviceToken) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(FCM_ENROLLMENT_URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Origin", "https://kandorty.online");
            connection.setRequestProperty("Authorization", "Bearer " + idToken);
            byte[] payload = new JSONObject().put("action", "test").put("token", deviceToken)
                    .toString().getBytes(StandardCharsets.UTF_8);
            connection.getOutputStream().write(payload);
            int status = connection.getResponseCode();
            getSharedPreferences("kandorty_native_push", MODE_PRIVATE).edit()
                    .putInt("last_test_http", status)
                    .putString("last_status", status == 200 ? "test_sent" : "fcm_send_http_" + status)
                    .apply();
        } catch (Exception ignored) {
            getSharedPreferences("kandorty_native_push", MODE_PRIVATE).edit()
                    .putString("last_status", "fcm_send_network_error").apply();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void showPushDiagnostics() {
        android.content.SharedPreferences p = getSharedPreferences("kandorty_native_push", MODE_PRIVATE);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        boolean permitted = nm != null && nm.areNotificationsEnabled()
                && (Build.VERSION.SDK_INT < 33 ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        String device = p.getString("pending_fcm_token", "");
        String http = p.contains("last_http_status") ? String.valueOf(p.getInt("last_http_status", 0)) : "—";
        String test = p.contains("last_test_http") ? String.valueOf(p.getInt("last_test_http", 0)) : "—";
        String message = "إذن الإشعارات: " + (permitted ? "✅ مسموح" : "❌ غير مسموح") +
                "\nاتصال Firebase بالجهاز: " + (!device.isEmpty() ? "✅" : "❌") +
                "\nتسجيل الجهاز بالخادم (HTTP): " + http +
                "\nإرسال الاختبار (HTTP): " + test +
                "\nالحالة: " + p.getString("last_status", "لم يتم المحاولة") +
                "\n\nيجب تسجيل الدخول إلى حساب الإدارة داخل التطبيق. " +
                "عند الضغط على الاختبار سيحاول الربط ويرسل إشعار Firebase حقيقي.";
        new AlertDialog.Builder(this)
                .setTitle("🔔 فحص تنبيهات كندورتي")
                .setMessage(message)
                .setPositiveButton("اختبار Firebase", (dialog, which) -> {
                    lastNativePushEnrollmentAt = 0;
                    requestNativePush(true);
                    Toast.makeText(this, "جارٍ تجربة إرسال إشعار Firebase؛ افتحي الفحص مجدداً للنتيجة",
                            Toast.LENGTH_LONG).show();
                })
                .setNeutralButton("اختبار صوت الهاتف", (dialog, which) ->
                        AdminMessagingService.showLocalTestNotification(this))
                .setNegativeButton("إعدادات", (dialog, which) -> {
                    Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    try { startActivity(intent); } catch (Exception ignored) {}
                }).show();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] selected = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if (selected != null) {
                java.util.ArrayList<Uri> safe = new java.util.ArrayList<>();
                for (Uri u : selected) {
                    if (u != null && "content".equalsIgnoreCase(u.getScheme())) safe.add(u);
                }
                selected = safe.isEmpty() ? null : safe.toArray(new Uri[0]);
            }
            fileCallback.onReceiveValue(selected);
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onPause() {
        nativePushHandler.removeCallbacks(nativePushTicker);
        if (web != null) web.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            nativePushHandler.removeCallbacks(nativePushTicker);
            nativePushHandler.postDelayed(nativePushTicker, 3500);
        }
    }
    @Override protected void onDestroy() {
        nativePushHandler.removeCallbacksAndMessages(null);
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
