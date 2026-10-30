package io.github.ulisesfna.miaventura;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import java.util.Calendar;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Recordatorio con las alarmas del propio móvil: llega a su hora aunque la app esté cerrada,
 * sin internet ni servidor.
 *
 * La app manda { at (ms), dias, cadaDias, titulo, plantilla } cada vez que apuntas algo.
 * A esa hora se muestra el aviso y, si sigues sin apuntar nada, se repite cada `cadaDias` días.
 * Se guarda en SharedPreferences para volver a programarlo tras reiniciar el móvil.
 */
final class Recordatorio {

    static final String DISPARAR = "io.github.ulisesfna.miaventura.RECORDAR";
    static final String EXTRA_NUEVO = "mi-aventura:nuevo";
    static final String CANAL = "aventura-recordatorio";
    static final int ID = 1;
    static final int ID_PRUEBA = 2;

    private static final String PREFS = "recordatorio";
    private static final int COLOR = 0xFFD35A35;

    /** La app se abrió desde el aviso: al arrancar, ir directamente al editor de hoy */
    static volatile boolean abrirNuevo = false;

    private Recordatorio() {}

    static void crearCanal(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(CANAL, "Recordatorio", NotificationManager.IMPORTANCE_DEFAULT);
        c.setDescription("Aviso cuando pasan varios días sin apuntar nada");
        ctx.getSystemService(NotificationManager.class).createNotificationChannel(c);
    }

    // ---------------- Guardado ----------------

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject leer(Context ctx) {
        String s = prefs(ctx).getString("aviso", null);
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    private static void guardar(Context ctx, JSONObject a) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (a == null) e.remove("aviso");
        else e.putString("aviso", a.toString());
        e.apply();
    }

    /** Hora del próximo aviso (0 si no hay) */
    static long siguiente(Context ctx) {
        JSONObject a = leer(ctx);
        return a == null ? 0 : a.optLong("at");
    }

    // ---------------- Programar ----------------

    private static PendingIntent pendiente(Context ctx, int codigo, JSONObject a) {
        Intent i = new Intent(ctx, RecordatorioReceiver.class)
            .setAction(DISPARAR)
            .putExtra("aviso", a == null ? "{}" : a.toString());
        return PendingIntent.getBroadcast(ctx, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean exactasPermitidas(Context ctx) {
        if (Build.VERSION.SDK_INT < 31) return true;
        return ctx.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static void poner(Context ctx, int codigo, JSONObject a) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        long cuando = a.optLong("at");
        PendingIntent pi = pendiente(ctx, codigo, a);
        try {
            if (exactasPermitidas(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
        }
    }

    /** Sustituye el recordatorio programado por uno nuevo, o lo quita si a == null */
    static void programar(Context ctx, JSONObject a) {
        ctx.getSystemService(AlarmManager.class).cancel(pendiente(ctx, ID, null));
        guardar(ctx, a);
        if (a != null && a.optLong("at") > System.currentTimeMillis()) poner(ctx, ID, a);
    }

    /** Tras reiniciar el móvil o actualizar la app, Android borra las alarmas: volver a ponerla */
    static void reprogramar(Context ctx) {
        crearCanal(ctx);
        JSONObject a = leer(ctx);
        if (a == null) return;
        if (a.optLong("at") <= System.currentTimeMillis()) {
            // El móvil estaba apagado a la hora del aviso: avisar ya y seguir la cadena
            disparar(ctx, a);
        } else {
            poner(ctx, ID, a);
        }
    }

    /** Ha llegado la hora: avisar y dejar programado el siguiente por si sigues sin apuntar nada */
    static void disparar(Context ctx, JSONObject a) {
        mostrar(ctx, ID, a.optString("titulo", "Mi aventura"), texto(a));
        int cada = Math.max(1, a.optInt("cadaDias", 3));
        int dias = a.optInt("dias", cada);
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(a.optLong("at"));
        long ahora = System.currentTimeMillis();
        do {
            c.add(Calendar.DAY_OF_MONTH, cada);
            dias += cada;
        } while (c.getTimeInMillis() <= ahora);
        JSONObject sig = copia(a);
        try {
            sig.put("at", c.getTimeInMillis());
            sig.put("dias", dias);
        } catch (JSONException ignored) {}
        guardar(ctx, sig);
        poner(ctx, ID, sig);
    }

    static String texto(JSONObject a) {
        String p = a.optString("plantilla", "Llevas %d días sin apuntar nada.");
        return p.replace("%d", String.valueOf(a.optInt("dias", 3)));
    }

    private static JSONObject copia(JSONObject a) {
        try {
            return new JSONObject(a.toString());
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    // ---------------- Mostrar ----------------

    private static int icono(Context ctx) {
        int r = ctx.getResources().getIdentifier("ic_stat_aventura", "drawable", ctx.getPackageName());
        return r != 0 ? r : android.R.drawable.ic_popup_reminder;
    }

    private static PendingIntent abrirApp(Context ctx, int codigo) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) i = new Intent(ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        i.putExtra(EXTRA_NUEVO, true);
        return PendingIntent.getActivity(ctx, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void mostrar(Context ctx, int id, String titulo, String texto) {
        crearCanal(ctx);
        Notification n = new Notification.Builder(ctx, CANAL)
            .setSmallIcon(icono(ctx))
            .setColor(COLOR)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(new Notification.BigTextStyle().bigText(texto))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setShowWhen(true)
            .setContentIntent(abrirApp(ctx, id))
            .setAutoCancel(true)
            .addAction(new Notification.Action.Builder((Icon) null, "Apuntar ahora", abrirApp(ctx, 100 + id)).build())
            .build();
        ctx.getSystemService(NotificationManager.class).notify(id, n);
    }

    /** Quita el aviso de la barra (al apuntar algo ya no tiene sentido) */
    static void descartar(Context ctx) {
        ctx.getSystemService(NotificationManager.class).cancel(ID);
    }

    /** Aviso de prueba: ahora mismo (segundos = 0) o dentro de unos segundos, para probarlo con la app cerrada */
    static void probar(Context ctx, int segundos, String titulo, String texto) {
        if (segundos <= 0) {
            mostrar(ctx, ID_PRUEBA, titulo, texto);
            return;
        }
        JSONObject a = new JSONObject();
        try {
            a.put("prueba", true);
            a.put("at", System.currentTimeMillis() + segundos * 1000L);
            a.put("titulo", titulo);
            a.put("texto", texto);
        } catch (JSONException ignored) {}
        poner(ctx, ID_PRUEBA, a);
    }
}
