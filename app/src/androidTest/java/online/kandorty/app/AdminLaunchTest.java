package online.kandorty.app;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AdminLaunchTest {
    @Test public void launcherOpensAdminPage() throws Exception {
        Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        Context ctx = ins.getTargetContext();
        assertEquals("online.kandorty.admin", ctx.getPackageName());
        IntentFilter filter = new IntentFilter(Intent.ACTION_VIEW);
        filter.addDataScheme("https");
        filter.addDataAuthority("kandorty.online", null);
        filter.addDataPath("/admin.html", android.os.PatternMatcher.PATTERN_LITERAL);
        Instrumentation.ActivityMonitor monitor = ins.addMonitor(filter, null, true);
        try {
            Intent start = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            assertNotNull(start);
            ctx.startActivity(start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            for (int n = 0; n < 150 && monitor.getHits() == 0; n++) Thread.sleep(100);
            assertEquals(1, monitor.getHits());
        } finally {
            ins.removeMonitor(monitor);
        }
    }
}
