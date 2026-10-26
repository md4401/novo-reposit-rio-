package app.ninho.familia;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // O WebView não baixa arquivos: entrega o download (ex.: APK novo) ao navegador.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimetype, length) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                // sem navegador instalado: nada a fazer
            }
        });
    }
}
