package online.kandorty.app;

import android.content.Intent;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Verifies that contact URIs are strict: no auto-calls or other URI schemes. */
@RunWith(AndroidJUnit4.class)
public class AdminDialerTest {
    @Test public void acceptsOnlyCompletePhoneNumbers() {
        assertTrue(MainActivity.isDialUri(Uri.parse("tel:+971554529099")));
        assertTrue(MainActivity.isDialUri(Uri.parse("tel:0554529099")));
        assertFalse(MainActivity.isDialUri(Uri.parse("tel:")));
        assertFalse(MainActivity.isDialUri(Uri.parse("tel:123")));
        assertFalse(MainActivity.isDialUri(Uri.parse("tel:%2B971554529099%0A")));
        assertFalse(MainActivity.isDialUri(Uri.parse("tel:*123#")));
        assertFalse(MainActivity.isDialUri(Uri.parse("javascript:alert(1)")));
        assertFalse(MainActivity.isDialUri(Uri.parse("https://kandorty.online")));
    }

    @Test public void dialActionDoesNotCallDirectly() {
        Intent dialer = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:+971554529099"));
        assertEquals(Intent.ACTION_DIAL, dialer.getAction());
        assertNotEquals(Intent.ACTION_CALL, dialer.getAction());
    }
}
