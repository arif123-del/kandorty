package online.kandorty.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.graphics.Color;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceResponse;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** WebView for the public Kandorty storefront. No payment or database logic in this app. */
public class MainActivity extends Activity {
    private static final String STORE_URL =
            "https://kandorty-stripe-release-test.aliyajan200011.workers.dev/";
    private static final String OFFLINE_URL = "file:///android_asset/index-fast-start.html";
    private static final int FILE_CHOOSER_REQUEST = 1201;
    private static final long NETWORK_WATCHDOG_MS = 500L;

    private WebView webView;
    private LinearLayout loadingOverlay;
    private ValueCallback<Uri[]> filePathCallback;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkListenerRegistered;
    private boolean offlinePageShown;
    private boolean destroyed;
    private boolean foreground;
    private final Handler connectivityWatchdog = new Handler(Looper.getMainLooper());
    private final Runnable connectionWatch = new Runnable() {
        @Override public void run() {
            if (destroyed || !foreground || webView == null) return;
            if (!hasValidatedInternet()) showOfflinePage();
            if (!destroyed && foreground) {
                connectivityWatchdog.postDelayed(this, NETWORK_WATCHDOG_MS);
            }
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Show a legible loading state instead of a blank white surface.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(webView);
        loadingOverlay = new LinearLayout(this);
        loadingOverlay.setOrientation(LinearLayout.VERTICAL);
        loadingOverlay.setGravity(Gravity.CENTER);
        loadingOverlay.setBackgroundColor(Color.WHITE);
        ProgressBar spinner = new ProgressBar(this);
        loadingOverlay.addView(spinner);
        TextView loadingLabel = new TextView(this);
        loadingLabel.setText("جارٍ فتح متجر كندورتي...");
        loadingLabel.setTextSize(17);
        loadingLabel.setTextColor(0xFF4B3035);
        loadingLabel.setGravity(Gravity.CENTER);
        loadingLabel.setPadding(16, 24, 16, 0);
        loadingOverlay.addView(loadingLabel);
        root.addView(loadingOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(93);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
                if (scheme.equals("http") || scheme.equals("https")) {
                    String host = uri.getHost();
                    if (!scheme.equals("https") || host == null || !(host.equalsIgnoreCase("kandorty-stripe-release-test.aliyajan200011.workers.dev") || host.equalsIgnoreCase("checkout.stripe.com") || host.equalsIgnoreCase("hooks.stripe.com"))) return true;
                    if (!hasValidatedInternet()) {
                        showOfflinePage();
                        return true;
                    }
                    offlinePageShown = false;
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "تعذر فتح الرابط", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            @Override public void onPageStarted(WebView view, String url,
                    android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                offlinePageShown = OFFLINE_URL.equals(url);
                if (!offlinePageShown && loadingOverlay != null) loadingOverlay.setVisibility(View.VISIBLE);
                if (!offlinePageShown && !hasValidatedInternet()) showOfflinePage();
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
                if (OFFLINE_URL.equals(url)) {
                    offlinePageShown = true;
                    return;
                }
                if (!hasValidatedInternet()) showOfflinePage();
                // Keep storefront behavior exactly as served from kandorty.online.

            }

            @Override public void onReceivedError(WebView view,
                    WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() &&
                        !OFFLINE_URL.equals(String.valueOf(request.getUrl()))) {
                    showOfflinePage();
                }
            }

            @Override public void onReceivedHttpError(WebView view,
                    WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    showOfflinePage();
                }
            }

            @Override public void onReceivedSslError(WebView view,
                    SslErrorHandler handler, SslError error) {
                // Never bypass TLS verification, especially on checkout screens.
                handler.cancel();
                if (error != null && error.getUrl() != null &&
                        error.getUrl().startsWith(STORE_URL)) showOfflinePage();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this,
                            "لا يوجد مدير ملفات", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                Toast.makeText(this, "تعذر تنزيل الملف", Toast.LENGTH_SHORT).show();
            }
        });

        startNetworkMonitoring();
        if (!hasValidatedInternet()) {
            showOfflinePage();
        } else if (savedInstanceState == null) {
            webView.loadUrl(STORE_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean hasValidatedInternet() {
        try {
            if (connectivityManager == null) {
                connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            }
            if (connectivityManager == null) return false;
            Network network = connectivityManager.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
            return caps != null &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private void showOfflinePage() {
        if (destroyed || webView == null || offlinePageShown) return;
        offlinePageShown = true;
        if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
        webView.stopLoading();
        webView.loadUrl(OFFLINE_URL);
    }

    private void checkConnectivityOnUiThread() {
        runOnUiThread(() -> {
            if (!destroyed && !hasValidatedInternet()) showOfflinePage();
        });
    }

    private void startNetworkMonitoring() {
        if (connectivityManager == null) {
            connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        }
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onLost(Network network) { checkConnectivityOnUiThread(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                checkConnectivityOnUiThread();
            }
        };
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
            networkListenerRegistered = true;
        } catch (RuntimeException ignored) {
            networkListenerRegistered = false;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        connectivityWatchdog.removeCallbacks(connectionWatch);
        connectionWatch.run();
    }

    @Override protected void onPause() {
        foreground = false;
        connectivityWatchdog.removeCallbacks(connectionWatch);
        super.onPause();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public void onBackPressed() {
        if (!hasValidatedInternet()) {
            showOfflinePage();
            return;
        }
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        foreground = false;
        connectivityWatchdog.removeCallbacks(connectionWatch);
        if (networkListenerRegistered && connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ignored) { }
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
