package online.kandorty.store;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Kandorty customer shell. All shared products, prices, cart and order UI
 * come from the same published https://kandorty.online/ as the iOS shell.
 * No admin URL, staging token or payment secret is included.
 */
public final class MainActivity extends Activity {
    public static final String STOREFRONT_URL = "https://kandorty.online/";
    private static final int FILE_PICKER_REQUEST = 4001;
    private WebView webView;
    private TextView errorView;
    private ValueCallback<Uri[]> filePickerCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        errorView = new TextView(this);
        errorView.setText("تعذر الاتصال بالمتجر. اضغطي لإعادة المحاولة.");
        errorView.setGravity(Gravity.CENTER);
        errorView.setTextSize(17f);
        errorView.setVisibility(View.GONE);
        errorView.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            webView.loadUrl(STOREFRONT_URL);
        });
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
                    return false; // Includes payment checkout/return URLs. Must be tested on device.
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) {
                    // No application installed for the external URI scheme.
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req,
                                                    android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) errorView.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(STOREFRONT_URL)) {
                    errorView.setVisibility(View.GONE);
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                         FileChooserParams params) {
                if (filePickerCallback != null) filePickerCallback.onReceiveValue(null);
                filePickerCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_PICKER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    filePickerCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        webView.loadUrl(STOREFRONT_URL);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST && filePickerCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePickerCallback.onReceiveValue(result);
            filePickerCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (filePickerCallback != null) {
            filePickerCallback.onReceiveValue(null);
            filePickerCallback = null;
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
