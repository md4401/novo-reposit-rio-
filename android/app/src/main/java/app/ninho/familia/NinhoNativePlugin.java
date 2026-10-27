package app.ninho.familia;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

/** Ponte com o app web: captura de notificações, itens compartilhados e atalhos/widget. */
@CapacitorPlugin(name = "NinhoNative")
public class NinhoNativePlugin extends Plugin {

    // Preenchidos pela MainActivity quando o app abre por "Compartilhar", atalho ou widget
    static volatile JSObject pendingShare = null;
    static volatile String pendingRoute = null;

    static void notifyLaunch(NinhoNativePlugin plugin) {
        if (plugin != null) plugin.notifyListeners("launch", new JSObject(), true);
    }

    @PluginMethod
    public void captureStatus(PluginCall call) {
        String enabled = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        ComponentName me = new ComponentName(getContext(), BankNotificationListener.class);
        JSObject result = new JSObject();
        result.put("enabled", enabled != null && enabled.contains(me.flattenToString()));
        call.resolve(result);
    }

    @PluginMethod
    public void openCaptureSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void pendingCaptures(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("items", JSArray.from(toList(BankNotificationListener.read(getContext()))));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Não foi possível ler as capturas", e);
        }
    }

    @PluginMethod
    public void ackCaptures(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids", new JSArray());
            Set<String> set = new HashSet<>();
            for (int i = 0; i < ids.length(); i++) set.add(ids.getString(i));
            BankNotificationListener.remove(getContext(), set);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível limpar as capturas", e);
        }
    }

    @PluginMethod
    public void takeShared(PluginCall call) {
        JSObject item = pendingShare;
        pendingShare = null;
        call.resolve(item == null ? new JSObject() : item);
    }

    @PluginMethod
    public void takeLaunchRoute(PluginCall call) {
        String route = pendingRoute;
        pendingRoute = null;
        JSObject result = new JSObject();
        if (route != null) result.put("route", route);
        call.resolve(result);
    }

    private static java.util.List<Object> toList(JSONArray array) throws Exception {
        java.util.List<Object> list = new java.util.ArrayList<>();
        for (int i = 0; i < array.length(); i++) list.add(array.getJSONObject(i));
        return list;
    }
}
