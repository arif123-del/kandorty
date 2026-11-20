package online.kandorty.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;
import android.view.Gravity;
import androidx.browser.customtabs.CustomTabsIntent;

public class MainActivity extends Activity {
    private static final Uri ADMIN = Uri.parse("https://kandorty.online/admin.html");

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, ADMIN);
            finish();
        } catch (ActivityNotFoundException e) {
            TextView message = new TextView(this);
            message.setGravity(Gravity.CENTER);
            message.setText("لفتح إدارة كندورتي، فعّلي متصفح الإنترنت ثم أعيدي فتح التطبيق.");
            setContentView(message);
        }
    }
}
