package com.ajithsuryathati.shifttracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.content.res.Configuration;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FirebaseConfig")
public class FirebaseConfigPlugin extends Plugin {

    @PluginMethod
    public void isPushRuntimeConfigured(PluginCall call) {
        int googleAppIdResId = getContext().getResources().getIdentifier(
            "google_app_id",
            "string",
            getContext().getPackageName()
        );

        boolean configured = false;
        if (googleAppIdResId != 0) {
            String googleAppId = getContext().getString(googleAppIdResId);
            configured = googleAppId != null && !googleAppId.trim().isEmpty();
        }

        JSObject result = new JSObject();
        result.put("configured", configured);
        call.resolve(result);
    }

    @PluginMethod
    public void isTvDevice(PluginCall call) {
        int uiModeType = getContext().getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK;
        boolean isTv = uiModeType == Configuration.UI_MODE_TYPE_TELEVISION;

        JSObject result = new JSObject();
        result.put("tv", isTv);
        call.resolve(result);
    }

    @PluginMethod
    public void openAppNotificationSettings(PluginCall call) {
        Intent intent = createAppNotificationSettingsIntent();
        boolean opened = tryOpenIntent(intent);

        JSObject result = new JSObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationChannelSettings(PluginCall call) {
        String channelId = call.getString("channelId");
        if (channelId == null || channelId.trim().isEmpty()) {
            call.reject("channelId is required.");
            return;
        }

        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId);
        } else {
            intent = createAppNotificationSettingsIntent();
        }

        boolean opened = tryOpenIntent(intent);

        JSObject result = new JSObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    private Intent createAppNotificationSettingsIntent() {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra("app_package", getContext().getPackageName())
                .putExtra("app_uid", getContext().getApplicationInfo().uid);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
        }

        return intent;
    }

    private boolean tryOpenIntent(Intent intent) {
        if (tryStartIntent(intent)) {
            return true;
        }

        Intent fallbackIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.parse("package:" + getContext().getPackageName()));

        return tryStartIntent(fallbackIntent);
    }

    private boolean tryStartIntent(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                return false;
            }

            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                getContext().startActivity(intent);
            }
            return true;
        } catch (Exception ex) {
            return false;
        }
    }
}
