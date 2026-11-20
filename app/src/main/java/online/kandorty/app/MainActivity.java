package online.kandorty.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/**
 * Use the normal Chrome browser rather than a Custom Tab.
 *
 * Kandorty's existing background Web Push subscription belongs to Chrome.
 * In a Custom Tab, permission prompts and background subscription can fail
 * or be isolated by browser policy. Opening the regular Chrome profile makes
 * the admin shortcut use the same authorized site and notification settings
 * that have already been enabled at kandorty.online.
 *
 * This is a browser-backed notification bridge, not native Android FCM.
 */
public class MainActivity extends Activity {
    private static final Uri ADMIN = Uri.parse("https://kandorty.online/admin.html");
    private static final String CHROME_PACKAGE = "com.android.chrome";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);

        // Full Chrome, NOT CustomTabsIntent: Web Push is owned by Chrome.
        Intent chrome = new Intent(Intent.ACTION_VIEW, ADMIN);
        chrome.addCategory(Intent.CATEGORY_BROWSABLE);
        chrome.setPackage(CHROME_PACKAGE);

        try {
            startActivity(chrome);
            finish();
            return;
        } catch (ActivityNotFoundException ignored) {
            // Chrome may be missing/disabled. Honor the phone's default browser.
        }

        Intent defaultBrowser = new Intent(Intent.ACTION_VIEW, ADMIN);
        defaultBrowser.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(defaultBrowser);
            finish();
        } catch (ActivityNotFoundException error) {
            TextView message = new TextView(this);
            message.setGravity(Gravity.CENTER);
            message.setText("لتفعيل إشعارات طلبات كندورتي، ثبّتي Chrome وافتحي لوحة الإدارة ثم اسمحي بالإشعارات.");
            setContentView(message);
        }
    }
}
