package app.ninho.familia;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Atualiza o próprio APK: baixa a versão nova do site do ninho, confere o arquivo e abre o
 * instalador do Android (fora da Play Store o Android sempre pede a confirmação da pessoa).
 * Só aceita APK do mesmo endereço do app, com o SHA-256 publicado e a MESMA assinatura do app
 * instalado — um arquivo trocado no caminho nunca chega ao instalador.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        if (url == null || sha256 == null || sha256.length() != 64) {
            call.reject("Dados da atualização incompletos", "BAD_INPUT");
            return;
        }
        Uri target = Uri.parse(url);
        Uri app = Uri.parse(getBridge().getServerUrl());
        if (!"https".equals(target.getScheme()) || target.getHost() == null || !target.getHost().equals(app.getHost())) {
            call.reject("Endereço de atualização não permitido", "BAD_URL");
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            File apk = new File(dir, "ninho-update.apk");
            try {
                dir.mkdirs();
                download(url, apk);
                if (!sha256.equalsIgnoreCase(sha256Of(apk))) {
                    apk.delete();
                    call.reject("O arquivo baixado não confere. Tente de novo.", "BAD_HASH");
                    return;
                }
                if (!sameSigner(apk)) {
                    apk.delete();
                    call.reject("Esta versão tem outra assinatura: desinstale o ninho e instale de novo.", "SIGNATURE_MISMATCH");
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                apk.delete();
                call.reject("Não foi possível baixar a atualização. Confira a internet.", "DOWNLOAD_FAILED");
            }
        }).start();
    }

    private void download(String url, File out) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(false); // redirecionamento poderia levar a outro endereço
        if (connection.getResponseCode() != 200) throw new Exception("HTTP " + connection.getResponseCode());
        long total = connection.getContentLengthLong();
        try (InputStream in = connection.getInputStream(); FileOutputStream file = new FileOutputStream(out)) {
            byte[] buffer = new byte[64 * 1024];
            long done = 0;
            int lastPercent = -1;
            int n;
            while ((n = in.read(buffer)) > 0) {
                file.write(buffer, 0, n);
                done += n;
                if (done > 80L * 1024 * 1024) throw new Exception("Arquivo grande demais");
                int percent = total > 0 ? (int) (done * 100 / total) : -1;
                if (percent != lastPercent) {
                    lastPercent = percent;
                    JSObject progress = new JSObject();
                    progress.put("percent", percent);
                    notifyListeners("progress", progress);
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256Of(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) digest.update(buffer, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    @SuppressWarnings("deprecation")
    private boolean sameSigner(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        String name = getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageInfo update = pm.getPackageArchiveInfo(apk.getPath(), PackageManager.GET_SIGNING_CERTIFICATES);
            PackageInfo installed = pm.getPackageInfo(name, PackageManager.GET_SIGNING_CERTIFICATES);
            if (update == null || update.signingInfo == null || !name.equals(update.packageName)) return false;
            return Arrays.equals(update.signingInfo.getApkContentsSigners(), installed.signingInfo.getApkContentsSigners());
        }
        PackageInfo update = pm.getPackageArchiveInfo(apk.getPath(), PackageManager.GET_SIGNATURES);
        PackageInfo installed = pm.getPackageInfo(name, PackageManager.GET_SIGNATURES);
        if (update == null || update.signatures == null || !name.equals(update.packageName)) return false;
        Signature[] a = update.signatures;
        Signature[] b = installed.signatures;
        return Arrays.equals(a, b);
    }
}
