package online.kandorty.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/**
 * The Google APIs emulator does not always include a Chrome/default browser.
 * Launch the Android activity itself and verify it handles both available
 * and unavailable browsers safely. Chrome Web Push must be tested on device.
 */
@RunWith(AndroidJUnit4.class)
public class AdminLaunchTest {
    @Test public void adminLauncherDoesNotCrashWhenBrowserIsUnavailable() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("online.kandorty.admin", context.getPackageName());
        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(launch);
        assertNotNull("Admin activity should start even without Chrome", activity);
        instrumentation.waitForIdleSync();
    }
}
