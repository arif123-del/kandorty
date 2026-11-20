package online.kandorty.app;

import android.Manifest;
import android.app.Activity;
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
    private static final String ADMIN_URL = "https://kandorty.online/admin.html?source=android-admin&admin_ui=20261120";
    private static final int PICK_FILE = 401;
    private static final int ASK_NOTIFICATIONS = 402;

    private WebView web;
    private ProgressBar progress;
    private TextView fcmStatus;
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

        // Use the real order notification channel for a safe one-tap sound test.
        // This never creates an order or triggers a payment.
        Button testRing = new Button(this);
        testRing.setText("🔔 اختبار الجرس");
        testRing.setTextSize(12f);
        testRing.setAllCaps(false);
        testRing.setAlpha(0.95f);
        FrameLayout.LayoutParams testRingPosition = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.LEFT);
        int dp = Math.round(getResources().getDisplayMetrics().density);
        testRingPosition.setMargins(12*dp, 0, 0, 96*dp);
        root.addView(testRing, testRingPosition);
        testRing.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        ASK_NOTIFICATIONS);
                Toast.makeText(this, "فعّلي إذن الإشعارات ثم اضغطي اختبار الجرس",
                        Toast.LENGTH_LONG).show();
                return;
            }
            boolean delivered = AdminMessagingService.showTestNotification(this);
            Toast.makeText(this, delivered
                    ? "أُرسل إشعار الاختبار. إذا لم تسمعي صوتاً، غيّري صوت قناة طلبات كندورتي من إعدادات الإشعارات."
                    : "الإشعارات محظورة. افتحي إعدادات التطبيق وفعّلي تنبيهات طلبات كندورتي.",
                    Toast.LENGTH_LONG).show();
        });
        Button checkFirebase = new Button(this);
        checkFirebase.setText("📡 فحص Firebase");
        checkFirebase.setTextSize(12f);
        checkFirebase.setAllCaps(false);
        FrameLayout.LayoutParams firebasePosition = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.LEFT);
        firebasePosition.setMargins(12*dp, 0, 0, 154*dp);
        root.addView(checkFirebase, firebasePosition);
        checkFirebase.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                showFcmStatus("إذن الإشعارات غير مفعّل");
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        ASK_NOTIFICATIONS);
                return;
            }
            if (!BuildConfig.NATIVE_FCM_CONFIGURED || FirebaseApp.getApps(this).isEmpty()) {
                showFcmStatus("Firebase غير مهيأ في نسخة التطبيق");
                return;
            }
            showFcmStatus("جاري فحص رمز الجهاز...");
            FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .edit().putString("pending_fcm_token",token)
                        .putBoolean("fcm_test_sent_20261120",false).apply();
                    lastNativePushEnrollmentAt = 0L;
                    showFcmStatus("رمز الجهاز جاهز؛ جاري فحص دخول الإدارة...");
                    registerNativePushWhenSignedIn();
                })
                .addOnFailureListener(error ->
                    showFcmStatus("فشل الحصول على رمز Firebase من خدمات Google"));
        });
        fcmStatus = new TextView(this);
        fcmStatus.setTextSize(11f);
        fcmStatus.setTextColor(0xFF202020);
        fcmStatus.setPadding(8*dp, 3*dp, 8*dp, 3*dp);
        fcmStatus.setBackgroundColor(0xEEFFFFFF);
        fcmStatus.setText("Firebase: اضغطي فحص Firebase بعد تسجيل الدخول");
        FrameLayout.LayoutParams statusPosition = new FrameLayout.LayoutParams(
                -2, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.LEFT);
        statusPosition.setMargins(12*dp, 0, 12*dp, 212*dp);
        root.addView(fcmStatus,statusPosition);
        setContentView(root);

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
        // Force a one-time cache reset when upgrading to the Discount/Photo quantity UI.
        // Clear only HTTP/WebView resource cache, never web cookies, Firebase Auth,
        // DOM storage, or the native FCM registration preferences.
        if (!getSharedPreferences("kandorty_admin_ui", MODE_PRIVATE)
                .getBoolean("refreshed_20261120", false)) {
            web.clearCache(true);
            getSharedPreferences("kandorty_admin_ui", MODE_PRIVATE)
                    .edit().putBoolean("refreshed_20261120", true).apply();
        }
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
                    // Detect stale dashboard HTML; retry exactly once using a fresh URL.
                    // Do not interact with Firebase auth or native notifications.
                    view.evaluateJavascript(
                        "(function(){return !!(document.getElementById('adminDiscountsTab')" +
                        "&&document.getElementById('adminProductQuickAccess')" +
                        "&&document.getElementById('imagePreview'));})()",
                        fresh -> {
                            if (!"true".equals(fresh)
                                    && !getSharedPreferences("kandorty_admin_ui", MODE_PRIVATE)
                                    .getBoolean("retry_missing_20261120", false)) {
                                getSharedPreferences("kandorty_admin_ui", MODE_PRIVATE)
                                        .edit().putBoolean("retry_missing_20261120", true).apply();
                                view.clearCache(true);
                                view.loadUrl(ADMIN_URL + "&reload=1");
                            }
                        });
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

        // Establish our notification channel before a background FCM arrives.
        AdminMessagingService.ensureNotificationChannel(this);

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
                        .edit().putString("pending_fcm_token", token).apply();
                nativePushHandler.postDelayed(() -> registerNativePushWhenSignedIn(), 1500);
            }).addOnFailureListener(error ->
                Toast.makeText(this, "تعذّر الحصول على رمز إشعارات Firebase. تحقّقي من الإنترنت وخدمات Google Play.",
                        Toast.LENGTH_LONG).show());
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
    private void showFcmStatus(String message) {
        runOnUiThread(() -> {
            if (fcmStatus != null) fcmStatus.setText("Firebase: " + message);
        });
    }

    private void registerNativePushWhenSignedIn() {
        if (!BuildConfig.NATIVE_FCM_CONFIGURED || web == null) {
            showFcmStatus("إعداد Firebase غير متاح");
            return;
        }
        if (web.getUrl() == null || !isTrusted(Uri.parse(web.getUrl()))
                || !web.getUrl().contains("/admin.html")) {
            showFcmStatus("افتحي صفحة إدارة كندورتي أولاً");
            return;
        }
        if (nativePushEnrollmentRunning) return;
        if (System.currentTimeMillis() - lastNativePushEnrollmentAt < 15 * 60 * 1000L) return;
        String deviceToken = getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                .getString("pending_fcm_token","");
        if (deviceToken.isEmpty()) {
            showFcmStatus("رمز Firebase غير متوفر؛ اضغطي فحص Firebase");
            return;
        }
        nativePushEnrollmentRunning = true;
        web.evaluateJavascript(
            "(function(){try{" +
            "if(typeof auth==='undefined'||!auth.currentUser)return 'NO_LOGIN';" +
            "window.__kandortyNativeFcmLoginToken='';" +
            "window.__kandortyNativeFcmLoginStatus='PENDING';" +
            "auth.currentUser.getIdToken().then(function(t){" +
                "window.__kandortyNativeFcmLoginToken=t;" +
                "window.__kandortyNativeFcmLoginStatus='READY';" +
            "}).catch(function(){window.__kandortyNativeFcmLoginStatus='AUTH_FAILED';});" +
            "return 'PENDING';}catch(e){return 'AUTH_FAILED';}})()",
            value -> {
                if ("\"NO_LOGIN\"".equals(value)) {
                    nativePushEnrollmentRunning = false;
                    showFcmStatus("سجّلي دخول بريد الإدارة داخل التطبيق ثم افحصي مجدداً");
                    return;
                }
                if (!"\"PENDING\"".equals(value)) {
                    nativePushEnrollmentRunning = false;
                    showFcmStatus("تعذّر قراءة جلسة الإدارة");
                    return;
                }
                showFcmStatus("جاري تأكيد هوية الإدارة...");
                nativePushHandler.postDelayed(() -> pollNativeLoginToken(deviceToken,0),700);
            });
    }

    private void pollNativeLoginToken(String deviceToken, int attempts) {
        if (web == null || web.getUrl() == null
                || !isTrusted(Uri.parse(web.getUrl()))
                || !web.getUrl().contains("/admin.html")) {
            nativePushEnrollmentRunning = false;
            showFcmStatus("تم تغيير الصفحة أثناء فحص Firebase");
            return;
        }
        web.evaluateJavascript(
            "(function(){const t=window.__kandortyNativeFcmLoginToken||'';" +
            "if(t){window.__kandortyNativeFcmLoginToken='';return t;}" +
            "return window.__kandortyNativeFcmLoginStatus||'PENDING';})()",
            value -> {
                String result;
                try {
                    Object parsed = new JSONTokener(value).nextValue();
                    result = parsed instanceof String ? (String) parsed : "";
                } catch (Exception ignored) { result = ""; }
                if (result.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")
                        && result.length() <= 12000) {
                    nativePushEnrollmentRunning = false;
                    showFcmStatus("جاري تسجيل الجهاز في خادم الطلبات...");
                    String idToken = result;
                    new Thread(() -> enrollDeviceOverHttps(idToken,deviceToken),
                            "kandorty-native-push-enroll").start();
                } else if ("PENDING".equals(result) && attempts < 12) {
                    nativePushHandler.postDelayed(
                            () -> pollNativeLoginToken(deviceToken,attempts+1), 850);
                } else {
                    nativePushEnrollmentRunning = false;
                    showFcmStatus("AUTH_FAILED".equals(result)
                            ? "تعذّر توثيق الدخول؛ أعيدي تسجيل الدخول"
                            : "انتهت مهلة توثيق الإدارة؛ اضغطي فحص Firebase مجدداً");
                }
            });
    }

    private void enrollDeviceOverHttps(String idToken, String deviceToken) {
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
            if (status == 200) {
                showFcmStatus("تم تسجيل الجهاز بنجاح؛ جاري اختبار وصول الإشعار...");
                lastNativePushEnrollmentAt = System.currentTimeMillis();
                boolean wasRegistered=getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .getBoolean("registration_confirmed",false);
                getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .edit().putLong("last_registration", lastNativePushEnrollmentAt)
                        .putBoolean("registration_confirmed",true).apply();
                if(!wasRegistered)runOnUiThread(() -> Toast.makeText(this,
                        "✅ تم تسجيل الجهاز لاستقبال إشعارات الطلبات", Toast.LENGTH_LONG).show());
                if(!getSharedPreferences("kandorty_native_push",MODE_PRIVATE)
                        .getBoolean("fcm_test_sent_20261120",false)) {
                    sendNativeTestPushOverHttps(idToken,deviceToken);
                }
            } else {
                showFcmStatus("فشل التسجيل: HTTP " + status +
                        (status == 403 ? " (صلاحية الإدارة مرفوضة)" : ""));
                // A user-visible status helps diagnose a 403/429 without logging
                // Firebase JWTs or per-device FCM registration tokens.
                int lastError=getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                        .getInt("last_enrollment_http_error",0);
                if(lastError!=status) {
                    getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                            .edit().putInt("last_enrollment_http_error",status).apply();
                    runOnUiThread(() -> Toast.makeText(this,
                            "تعذّر تفعيل إشعارات الخلفية (HTTP " + status + ")",
                            Toast.LENGTH_LONG).show());
                }
            }
            // Do not log JWTs or FCM tokens, including in error handling.
        } catch (Exception ignored) {
            showFcmStatus("تعذّر الاتصال بخادم تسجيل إشعارات Firebase");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** A single authorized FCM test once the device registers, no synthetic order. */
    private void sendNativeTestPushOverHttps(String idToken, String deviceToken) {
        HttpsURLConnection c = null;
        try {
            c = (HttpsURLConnection) new URL(FCM_ENROLLMENT_URL).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setInstanceFollowRedirects(false);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Origin", "https://kandorty.online");
            c.setRequestProperty("Authorization", "Bearer " + idToken);
            byte[] data = new JSONObject().put("action","test").put("token",deviceToken)
                    .toString().getBytes(StandardCharsets.UTF_8);
            c.getOutputStream().write(data);
            int status = c.getResponseCode();
            if(status == 200) {
                showFcmStatus("تم إرسال اختبار Firebase؛ افحصي إشعارات الهاتف");
                getSharedPreferences("kandorty_native_push",MODE_PRIVATE).edit()
                        .putBoolean("fcm_test_sent_20261120",true).apply();
                runOnUiThread(() -> Toast.makeText(this,
                        "✅ تم إرسال اختبار Firebase للهاتف. تحقّقي من الإشعارات والصوت.",
                        Toast.LENGTH_LONG).show());
            }else {
                showFcmStatus("فشل إرسال اختبار Firebase: HTTP " + status);
                runOnUiThread(() -> Toast.makeText(this,
                        "اختبار Firebase لم ينجح (HTTP " + status + ").",
                        Toast.LENGTH_LONG).show());
            }
        }catch (Exception e) {
            showFcmStatus("تعذّر الاتصال بخادم اختبار Firebase");
            runOnUiThread(() -> Toast.makeText(this,
                    "اختبار Firebase تعذّر بسبب اتصال الشبكة.",
                    Toast.LENGTH_LONG).show());
        }finally {
            if(c != null)c.disconnect();
        }
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
