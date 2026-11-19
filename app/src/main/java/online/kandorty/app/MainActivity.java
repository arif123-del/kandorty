package online.kandorty.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.webkit.JsResult;
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
            "https://kandorty.online/";
    private static final String OFFLINE_URL = "file:///android_asset/index-fast-start.html";
    private static final int FILE_CHOOSER_REQUEST = 1201;
    private static final long NETWORK_WATCHDOG_MS = 500L;
    private static final long LOAD_TIMEOUT_MS = 18000L;
    private boolean paymentReturnPage;
    private boolean clearingCheckoutHistory;
    private boolean keepHomeOnNextBack;
    private boolean mainPageFinished = false;
    private final Handler pageTimeoutHandler = new Handler(Looper.getMainLooper());
    private Runnable pageTimeout;

    private WebView webView;
    private LinearLayout loadingOverlay;
    private ValueCallback<Uri[]> filePathCallback;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkListenerRegistered;
    private boolean offlinePageShown;
    private boolean destroyed;
    private boolean foreground;
    private boolean retryOfflinePage;
    private long disconnectedSince = -1;
    private boolean recoverOnResume;
    private long resumeRetryUntil;
    // Initialized after all state fields are declared to avoid illegal forward references.
    private void initPageTimeout() {
        pageTimeout = () -> {
            if (!destroyed && foreground && !mainPageFinished && !offlinePageShown
                    && !hasValidatedInternet()) showOfflinePage();
            else if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
        };
    }
    private final Handler connectivityWatchdog = new Handler(Looper.getMainLooper());
    private final Runnable connectionWatch = new Runnable() {
        @Override public void run() {
            if (destroyed || !foreground || webView == null) return;
            updateConnectivity();
            if (!destroyed && foreground) {
                connectivityWatchdog.postDelayed(this, NETWORK_WATCHDOG_MS);
            }
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        initPageTimeout();
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            clearingCheckoutHistory = savedInstanceState.getBoolean("clearingCheckoutHistory");
            keepHomeOnNextBack = savedInstanceState.getBoolean("keepHomeOnNextBack");
        }
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
                    if (request.isForMainFrame() && !hasValidatedInternet()) {
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
                Uri page = Uri.parse(url);
                paymentReturnPage = isStorePage(page)
                        && "success".equals(page.getQueryParameter("stripe"));
                offlinePageShown = OFFLINE_URL.equals(url);
                pageTimeoutHandler.removeCallbacks(pageTimeout);
                if (!offlinePageShown) {
                    mainPageFinished = false;
                    pageTimeoutHandler.postDelayed(pageTimeout, LOAD_TIMEOUT_MS);
                    if (loadingOverlay != null) loadingOverlay.setVisibility(View.VISIBLE);
                    if (!hasValidatedInternet()) updateConnectivity();
                }
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageTimeoutHandler.removeCallbacks(pageTimeout);
                if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
                if (OFFLINE_URL.equals(url)) {
                    offlinePageShown = OFFLINE_URL.equals(view.getUrl());
                    return;
                }
                mainPageFinished = true;
                if (!hasValidatedInternet()) updateConnectivity();
                if (clearingCheckoutHistory && STORE_URL.equals(url) && url.equals(view.getUrl())) {
                    view.clearHistory();
                    clearingCheckoutHistory = false;
                }

            }

            @Override public void onReceivedError(WebView view,
                    WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() &&
                        !OFFLINE_URL.equals(String.valueOf(request.getUrl()))) {
                    if (!foreground) {
                        recoverOnResume = true;
                        return;
                    }
                    if (android.os.SystemClock.elapsedRealtime() < resumeRetryUntil
                            && STORE_URL.equals(request.getUrl().toString())
                            && hasValidatedInternet()) {
                        resumeRetryUntil = 0;
                        view.post(() -> { if (foreground && !destroyed) view.loadUrl(STORE_URL); });
                        return;
                    }
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

            @Override public boolean onRenderProcessGone(WebView view,
                    android.webkit.RenderProcessGoneDetail detail) {
                pageTimeoutHandler.removeCallbacks(pageTimeout);
                if (!destroyed) view.post(() -> recreate());
                return true;
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
            @Override public boolean onJsAlert(WebView view, String url, String message,
                    JsResult result) {
                if (!isStorePage(Uri.parse(url))
                        || !isOrderConfirmation(message, paymentReturnPage)) {
                    return super.onJsAlert(view, url, message, result);
                }
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setCancelable(false)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> {
                            clearingCheckoutHistory = true;
                            keepHomeOnNextBack = true;
                            result.confirm();
                            view.post(() -> {
                                if (!destroyed && clearingCheckoutHistory) view.loadUrl(STORE_URL);
                            });
                        })
                        .show();
                return true;
            }

            @Override public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    if (filePathCallback != null) filePathCallback.onReceiveValue(null);
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
        if (savedInstanceState == null) {
            webView.loadUrl(STORE_URL);
        } else {
            if (webView.restoreState(savedInstanceState) == null) webView.loadUrl(STORE_URL);
        }
    }

    private static boolean isStorePage(Uri page) {
        return "https".equalsIgnoreCase(page.getScheme())
                && ("kandorty.online".equalsIgnoreCase(page.getHost())
                    || "www.kandorty.online".equalsIgnoreCase(page.getHost()))
                && (page.getPort() == -1 || page.getPort() == 443);
    }

    private static boolean isOrderConfirmation(String message, boolean paymentReturnPage) {
        if (message == null) return false;
        return message.startsWith("✅ تم الدفع وتسجيل الطلب بنجاح.")
                || message.startsWith("✅ Payment and order registration succeeded.")
                || (paymentReturnPage && (message.startsWith("تم تسجيل الطلب. رقم الطلب:")
                    || message.startsWith("Order registered:")));
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
        mainPageFinished = true;
        pageTimeoutHandler.removeCallbacks(pageTimeout);
        if (loadingOverlay != null) loadingOverlay.setVisibility(View.GONE);
        webView.stopLoading();
        webView.loadUrl(OFFLINE_URL);
    }

    private void updateConnectivity() {
        if (!foreground || destroyed || webView == null) return;
        if (!hasValidatedInternet()) {
            retryOfflinePage = true;
            long now = android.os.SystemClock.elapsedRealtime();
            if (disconnectedSince < 0) disconnectedSince = now;
            if (!mainPageFinished && now - disconnectedSince >= LOAD_TIMEOUT_MS) showOfflinePage();
            return;
        }
        disconnectedSince = -1;
        if (recoverOnResume || (retryOfflinePage && OFFLINE_URL.equals(webView.getUrl()))) {
            recoverOnResume = false;
            retryOfflinePage = false;
            offlinePageShown = false;
            webView.loadUrl(STORE_URL);
        } else if (!offlinePageShown && mainPageFinished) {
            retryOfflinePage = false;
        }
    }

    private void checkConnectivityOnUiThread() {
        runOnUiThread(this::updateConnectivity);
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
        resumeRetryUntil = android.os.SystemClock.elapsedRealtime() + 6000;
        retryOfflinePage = true;
        disconnectedSince = -1;
        if (!mainPageFinished && !offlinePageShown) {
            pageTimeoutHandler.removeCallbacks(pageTimeout);
            pageTimeoutHandler.postDelayed(pageTimeout, LOAD_TIMEOUT_MS);
        }
        connectivityWatchdog.removeCallbacks(connectionWatch);
        connectionWatch.run();
    }

    @Override protected void onPause() {
        foreground = false;
        pageTimeoutHandler.removeCallbacks(pageTimeout);
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
        outState.putBoolean("clearingCheckoutHistory", clearingCheckoutHistory);
        outState.putBoolean("keepHomeOnNextBack", keepHomeOnNextBack);
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public void onBackPressed() {
        if (!hasValidatedInternet()) {
            showOfflinePage();
            return;
        }
        if (clearingCheckoutHistory) return;
        if (keepHomeOnNextBack && webView != null && STORE_URL.equals(webView.getUrl())) {
            keepHomeOnNextBack = false;
            webView.clearHistory();
            return;
        }
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        foreground = false;
        connectivityWatchdog.removeCallbacks(connectionWatch);
        pageTimeoutHandler.removeCallbacks(pageTimeout);
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
