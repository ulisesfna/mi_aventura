package io.github.ulisesfna.miaventura;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import org.json.JSONException;
import org.json.JSONObject;

/** Puente entre la app (JavaScript) y el recordatorio nativo. En JS: Capacitor.registerPlugin('Recordatorio') */
@CapacitorPlugin(name = "Recordatorio", permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "avisos") })
public class RecordatorioPlugin extends Plugin {

    @Override
    public void load() {
        Recordatorio.crearCanal(getContext());
    }

    /** Con la app ya abierta, tocar el aviso llega aquí: avisar a la página para abrir el editor */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.getBooleanExtra(Recordatorio.EXTRA_NUEVO, false)) {
            intent.removeExtra(Recordatorio.EXTRA_NUEVO);
            Recordatorio.abrirNuevo = false;
            notifyListeners("abrirNuevo", new JSObject());
        }
    }

    @PluginMethod
    public void programar(PluginCall call) {
        long at = call.getDouble("at", 0.0).longValue();
        JSONObject a = null;
        if (at > 0) {
            a = new JSONObject();
            try {
                a.put("at", at);
                a.put("dias", call.getInt("dias", 3));
                a.put("cadaDias", call.getInt("cadaDias", 3));
                a.put("titulo", call.getString("titulo", "Mi aventura"));
                a.put("plantilla", call.getString("plantilla", "Llevas %d días sin apuntar nada."));
            } catch (JSONException e) {
                call.reject("Datos del recordatorio no válidos");
                return;
            }
        }
        Recordatorio.programar(getContext(), a);
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void descartar(PluginCall call) {
        Recordatorio.descartar(getContext());
        call.resolve();
    }

    @PluginMethod
    public void probar(PluginCall call) {
        Recordatorio.probar(
            getContext(),
            call.getInt("segundos", 0),
            call.getString("titulo", "Mi aventura"),
            call.getString("texto", "Así te llegará el recordatorio")
        );
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    /** ¿Se abrió la app tocando el aviso? (solo responde que sí una vez) */
    @PluginMethod
    public void consumirAbrirNuevo(PluginCall call) {
        JSObject r = new JSObject();
        r.put("nuevo", Recordatorio.abrirNuevo);
        Recordatorio.abrirNuevo = false;
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        String tipo = call.getString("tipo", "app");
        Intent i;
        if ("exactas".equals(tipo) && Build.VERSION.SDK_INT >= 31) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
        } else if ("bateria".equals(tipo)) {
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
        } else if ("avisos".equals(tipo)) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(i);
        } catch (Exception e) {
            // Algunas capas (MIUI…) no tienen esa pantalla: abrir la ficha de la app
            Intent ficha = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            ficha.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(ficha);
        }
        call.resolve();
    }

    private JSObject estadoActual() {
        Context ctx = getContext();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        PowerManager pm = ctx.getSystemService(PowerManager.class);
        JSObject r = new JSObject();
        r.put("notificaciones", nm.areNotificationsEnabled());
        r.put("exactas", Recordatorio.exactasPermitidas(ctx));
        r.put("bateria", pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        r.put("siguiente", Recordatorio.siguiente(ctx));
        r.put("android", Build.VERSION.SDK_INT);
        r.put("fabricante", Build.MANUFACTURER);
        return r;
    }
}
