package app.ninho.familia;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lê SÓ as notificações dos apps de banco (lista fixa abaixo) e guarda título e texto no
 * próprio celular. O app envia para a conta da pessoa quando é aberto; nada sai daqui sozinho.
 * Precisa ser ligado pela pessoa em Configurações do Android → Acesso a notificações.
 */
public class BankNotificationListener extends NotificationListenerService {

    static final String PREFS = "ninho_capture";
    static final String KEY = "queue";
    private static final int MAX_ITEMS = 200;

    static final Set<String> BANKS = new HashSet<>(Arrays.asList(
        "com.nu.production", "com.itau", "com.itau.iti", "br.com.intermedium", "com.c6bank.app",
        "com.bradesco", "br.com.bb.android", "br.com.gabba.Caixa", "com.santander.app", "com.picpay",
        "com.mercadopago.wallet", "br.com.original.bank", "com.neon", "br.com.uol.ps.myaccount"
    ));

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !BANKS.contains(sbn.getPackageName())) return;
        Bundle extras = sbn.getNotification().extras;
        if (extras == null) return;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        if (text == null || !text.toString().contains("R$")) return; // só o que tem valor em reais
        try {
            JSONObject item = new JSONObject();
            item.put("key", sbn.getKey());
            item.put("packageName", sbn.getPackageName());
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text.toString());
            item.put("postedAt", sbn.getPostTime());
            append(this, item);
        } catch (Exception ignored) {
            // notificação fora do padrão: ignora
        }
    }

    static synchronized void append(Context context, JSONObject item) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray queue = new JSONArray(prefs.getString(KEY, "[]"));
        for (int i = 0; i < queue.length(); i++) {
            JSONObject other = queue.getJSONObject(i);
            if (other.optString("key").equals(item.optString("key")) && other.optString("text").equals(item.optString("text"))) return;
        }
        queue.put(item);
        while (queue.length() > MAX_ITEMS) queue.remove(0);
        prefs.edit().putString(KEY, queue.toString()).apply();
    }

    static synchronized JSONArray read(Context context) throws Exception {
        return new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
    }

    static synchronized void remove(Context context, Set<String> keys) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray queue = new JSONArray(prefs.getString(KEY, "[]"));
        JSONArray kept = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.getJSONObject(i);
            if (!keys.contains(item.optString("key") + "|" + item.optLong("postedAt"))) kept.put(item);
        }
        prefs.edit().putString(KEY, kept.toString()).apply();
    }
}
