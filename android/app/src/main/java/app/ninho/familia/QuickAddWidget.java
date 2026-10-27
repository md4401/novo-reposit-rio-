package app.ninho.familia;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Widget da tela inicial: "+ Despesa" e "Nia" abrem o app direto na tela certa. */
public class QuickAddWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            views.setOnClickPendingIntent(R.id.widget_add, open(context, "nova", 1));
            views.setOnClickPendingIntent(R.id.widget_nia, open(context, "nia", 2));
            views.setOnClickPendingIntent(R.id.widget_title, open(context, "inicio", 3));
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent open(Context context, String route, int code) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("ninho_route", route);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
