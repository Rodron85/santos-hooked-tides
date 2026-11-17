package uk.santoshooked.tides;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

/**
 * Opens the app full screen in Chrome (not Samsung Internet, whose dark mode repaints the colours).
 * If Chrome isn't installed, the phone's default browser is used.
 */
public class MainActivity extends Activity {
    private static final String URL = "https://santos-hooked-tides.ronnieandrodrigues.workers.dev/";
    private static final String[] CHROMES = { "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.google.android.apps.chrome" };
    private TwaLauncher launcher;
    private boolean launched;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri uri = getIntent() != null && getIntent().getData() != null ? getIntent().getData() : Uri.parse(URL);
        launcher = new TwaLauncher(this, pickChrome());
        CustomTabColorSchemeParams dark = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(0xFF161616).setNavigationBarColor(0xFF161616).build();
        TrustedWebActivityIntentBuilder builder = new TrustedWebActivityIntentBuilder(uri)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .setDefaultColorSchemeParams(dark)
                .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_DARK, dark);
        launcher.launch(builder, null, null, () -> launched = true);
    }

    private String pickChrome() {
        PackageManager pm = getPackageManager();
        for (String p : CHROMES) {
            try {
                if (pm.getApplicationInfo(p, 0).enabled) return p;
            } catch (PackageManager.NameNotFoundException ignored) { }
        }
        return null; // fall back to the default browser
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        if (launched) finish(); // coming back from the app: close this launcher screen
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (launcher != null) launcher.destroy();
    }
}
