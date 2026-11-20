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
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token ->
                    getSharedPreferences("kandorty_native_push", MODE_PRIVATE)
                            .edit().putString("pending_fcm_token", token).apply());
        }

        openAdmin();
    }

    private void openAdmin() {
        offline.setVisibility(View.GONE);
        web.loadUrl(ADMIN_URL);
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
        if (web != null) web.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
