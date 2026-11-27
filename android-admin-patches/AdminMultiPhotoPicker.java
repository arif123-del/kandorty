package online.kandorty.admin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.widget.Toast;
import java.util.LinkedHashSet;
import java.util.Locale;

/**
 * Integrate into the existing ADMIN WebView MainActivity. Do NOT replace
 * the Activity or remove its Firebase/FCM, notification or other handlers.
 * Handles only <input type="file" accept="image/*" multiple>.
 */
public final class AdminMultiPhotoPicker {
    public static final int REQUEST_CODE = 9107;
    private static final int MAX_PRODUCT_IMAGES = 8;
    private final Activity activity;
    private ValueCallback<Uri[]> pendingCallback;

    public AdminMultiPhotoPicker(Activity activity) { this.activity = activity; }

    public boolean openIfMultipleImages(ValueCallback<Uri[]> callback,
            WebChromeClient.FileChooserParams params) {
        if (callback == null || !isMultipleImageRequest(params)) return false;
        cancelPending();
        pendingCallback = callback;

        // Android 13+: stay in the system gallery until user taps Add/Done.
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                int systemLimit = MediaStore.getPickImagesMaxLimit();
                if (systemLimit >= 2) {
                    Intent picker = new Intent(MediaStore.ACTION_PICK_IMAGES);
                    picker.setType("image/*");
                    picker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,
                            Math.min(MAX_PRODUCT_IMAGES, systemLimit));
                    activity.startActivityForResult(picker, REQUEST_CODE);
                    return true;
                }
            } catch (ActivityNotFoundException | SecurityException unsupported) {
                // Fallback to DocumentsUI below.
            }
        }

        // Earlier Android: long-press first item and select the others.
        Intent documents = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        documents.addCategory(Intent.CATEGORY_OPENABLE);
        documents.setType("image/*");
        documents.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        documents.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivityForResult(documents, REQUEST_CODE);
        } catch (ActivityNotFoundException | SecurityException missingPicker) {
            Toast.makeText(activity, "تعذر فتح معرض الصور", Toast.LENGTH_SHORT).show();
            cancelPending();
        }
        return true;
    }

    private static boolean isMultipleImageRequest(WebChromeClient.FileChooserParams params) {
        if (params == null || params.getMode() !=
                WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) return false;
        String[] types = params.getAcceptTypes();
        if (types == null) return false;
        for (String candidate : types) {
            if (candidate == null) continue;
            String type = candidate.trim().toLowerCase(Locale.ROOT);
            if (type.startsWith("image/") ||
                    type.equals(".jpg") || type.equals(".jpeg") ||
                    type.equals(".png") || type.equals(".webp") ||
                    type.equals(".heic") || type.equals(".heif")) return true;
        }
        return false;
    }

    // Call first in MainActivity.onActivityResult, before the old handler.
    public boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CODE) return false;
        ValueCallback<Uri[]> callback = pendingCallback;
        pendingCallback = null;
        if (callback == null) return true;
        if (resultCode != Activity.RESULT_OK || data == null) {
            callback.onReceiveValue(null);
            return true;
        }
        LinkedHashSet<Uri> result = new LinkedHashSet<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) result.add(uri);
            }
        }
        if (data.getData() != null) result.add(data.getData());
        callback.onReceiveValue(result.isEmpty() ? null : result.toArray(new Uri[0]));
        return true;
    }

    // Call from MainActivity.onDestroy.
    public void cancelPending() {
        if (pendingCallback != null) {
            pendingCallback.onReceiveValue(null);
            pendingCallback = null;
        }
    }
}
