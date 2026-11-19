package online.kandorty.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PaymentBackTest {
    private static final String HOME = "https://kandorty.online/";
    private static final String CHECKOUT = "https://checkout.stripe.com/test-fixture";
    private static final String RETURN = HOME + "?stripe=success&session_id=fixture";

    private WebView findWebView(View v) {
        if (v instanceof WebView) return (WebView)v;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup)v;
            for (int i=0; i<g.getChildCount(); i++) {
                WebView w = findWebView(g.getChildAt(i));
                if (w != null) return w;
            }
        }
        return null;
    }

    @Test public void returnFromBackgroundRecoversOfflinePage() throws Exception {
        android.app.Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        Context ctx = ins.getTargetContext();
        MainActivity activity = (MainActivity)ins.startActivitySync(
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        CountDownLatch offline = new CountDownLatch(1), recovered = new CountDownLatch(1);
        try {
            ins.runOnMainSync(() -> {
                WebView w = findWebView(activity.getWindow().getDecorView());
                WebViewClient actual = w.getWebViewClient();
                w.stopLoading();
                ins.callActivityOnPause(activity);
                w.setWebViewClient(new WebViewClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                        if (!HOME.equals(req.getUrl().toString())) return null;
                        return new WebResourceResponse("text/html","utf-8",new ByteArrayInputStream(
                                "<html>Home</html>".getBytes(StandardCharsets.UTF_8)));
                    }
                    @Override public void onPageStarted(WebView v,String url,Bitmap icon) {
                        actual.onPageStarted(v,url,icon);
                    }
                    @Override public void onPageFinished(WebView v,String url) {
                        actual.onPageFinished(v,url);
                        if (url.startsWith("file:///android_asset/")) offline.countDown();
                        if (offline.getCount()==0 && HOME.equals(url)) recovered.countDown();
                    }
                });
                w.loadUrl("file:///android_asset/index-fast-start.html");
            });
            assertTrue(offline.await(20,TimeUnit.SECONDS));
            ins.runOnMainSync(() -> ins.callActivityOnResume(activity));
            assertTrue(recovered.await(20,TimeUnit.SECONDS));
        } finally {
            ins.runOnMainSync(activity::finish);
        }
    }

    @Test public void acknowledgeThenSystemBackStaysHome() throws Exception {
        android.app.Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        Context ctx = ins.getTargetContext();
        MainActivity activity = (MainActivity)ins.startActivitySync(
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        UiDevice device = UiDevice.getInstance(ins);
        CountDownLatch checkoutLoaded = new CountDownLatch(1), homeLoaded = new CountDownLatch(1);
        WebView[] web = new WebView[1];
        try {
            ins.runOnMainSync(() -> {
                WebView w = findWebView(activity.getWindow().getDecorView());
                web[0] = w;
                WebViewClient actual = w.getWebViewClient();
                w.stopLoading();
                w.setWebViewClient(new WebViewClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                        String html = RETURN.equals(req.getUrl().toString())
                            ? "<script>onload=()=>{alert('✅ تم الدفع وتسجيل الطلب بنجاح.');location.replace('/')};</script>"
                            : "<html><body>Fixture</body></html>";
                        return new WebResourceResponse("text/html","utf-8",new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                    }
                    @Override public void onPageStarted(WebView v, String url, Bitmap icon) {
                        actual.onPageStarted(v,url,icon);
                    }
                    @Override public void onPageFinished(WebView v, String url) {
                        actual.onPageFinished(v,url);
                        if (CHECKOUT.equals(url)) checkoutLoaded.countDown();
                        if (HOME.equals(url) && checkoutLoaded.getCount()==0) homeLoaded.countDown();
                    }
                });
                w.loadUrl(CHECKOUT);
            });
            assertTrue("checkout loaded",checkoutLoaded.await(25,TimeUnit.SECONDS));
            ins.runOnMainSync(() -> web[0].loadUrl(RETURN));
            UiObject2 ok=device.wait(Until.findObject(By.res("android","button1")),25000);
            assertNotNull("native confirmation appeared",ok);
            ok.click();
            assertTrue("home loaded",homeLoaded.await(25,TimeUnit.SECONDS));
            device.pressBack();
            ins.waitForIdleSync();
            assertEquals(ctx.getPackageName(),device.getCurrentPackageName());
            ins.runOnMainSync(() -> {
                assertFalse(activity.isFinishing());
                assertEquals(HOME,web[0].getUrl());
                assertFalse(web[0].canGoBack());
            });
        } finally {
            ins.runOnMainSync(activity::finish);
        }
    }
}
