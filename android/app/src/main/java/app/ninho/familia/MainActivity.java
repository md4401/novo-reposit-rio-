package app.ninho.familia;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginHandle;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    private static final long MAX_SHARED_BYTES = 6L * 1024 * 1024;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(NinhoNativePlugin.class);
        super.onCreate(savedInstanceState);
        // O WebView não baixa arquivos: entrega o download (ex.: APK novo) ao navegador.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, length) -> {
            if (url == null || !url.startsWith("https://")) return; // só downloads seguros
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                // sem navegador instalado: nada a fazer
            }
        });
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
    }

    /** Guarda o que chegou (compartilhar, atalho, widget) para o app web buscar. */
    private void handle(Intent intent) {
        if (intent == null) return;
        String route = intent.getStringExtra("ninho_route");
        if (route != null && route.matches("[a-z-]{1,30}")) NinhoNativePlugin.pendingRoute = route;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            JSObject item = new JSObject();
            String type = intent.getType() == null ? "" : intent.getType();
            if (type.startsWith("image/")) {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                String data = readAsDataUrl(uri, type);
                if (data != null) {
                    item.put("type", "image");
                    item.put("dataUrl", data);
                }
            } else {
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text != null) {
                    item.put("type", "text");
                    item.put("text", text.toString().substring(0, Math.min(3000, text.length())));
                }
            }
            if (item.has("type")) {
                NinhoNativePlugin.pendingShare = item;
                NinhoNativePlugin.pendingRoute = "compartilhar";
            }
        }
        PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("NinhoNative");
        if (handle != null) NinhoNativePlugin.notifyLaunch((NinhoNativePlugin) handle.getInstance());
    }

    private String readAsDataUrl(Uri uri, String type) {
        if (uri == null) return null;
        try (InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) return null;
            byte[] buffer = new byte[64 * 1024];
            int n;
            long total = 0;
            while ((n = in.read(buffer)) > 0) {
                total += n;
                if (total > MAX_SHARED_BYTES) return null;
                out.write(buffer, 0, n);
            }
            String mime = type.matches("image/(jpeg|png|webp)") ? type : "image/jpeg";
            return "data:" + mime + ";base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
