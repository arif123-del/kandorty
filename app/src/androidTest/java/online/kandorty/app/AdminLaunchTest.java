package online.kandorty.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AdminLaunchTest {
    @Test public void opensOwnSecureWebViewAndNotChrome() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("online.kandorty.admin", context.getPackageName());
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(launch);
        assertNotNull(activity);
        WebView w = activity.findViewById(R.id.admin_webview);
        assertNotNull("Admin should render in the app's WebView", w);
        instrumentation.waitForIdleSync();
    }
}
