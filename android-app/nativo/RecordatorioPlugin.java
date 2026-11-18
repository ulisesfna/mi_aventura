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

    private static volatile RecordatorioPlugin abierto;

    @Override
    public void load() {
        abierto = this;
        Recordatorio.crearCanal(getContext());
    }

    /** Error del instalador de Android: avisar a la app (evento «instalacion») */
    static void avisarInstalacion(String error) {
        RecordatorioPlugin p = abierto;
        if (p == null) return;
        try {
            p.notifyListeners("instalacion", new JSObject().put("error", error));
        } catch (RuntimeException ignored) {}
    }

    // ---------------- Actualizaciones (ver Actualizar.java) ----------------

    /** { build: versión del APK, nativo: huella de la parte nativa, web: versión de la web en uso } */
    @PluginMethod
    public void version(PluginCall call) {
        call.resolve(new JSObject()
            .put("build", Actualizar.versionApk(getContext()))
            .put("nativo", Version.NATIVO)
            .put("web", Actualizar.webActual(getContext(), getBridge().getServerBasePath())));
    }

    /** La web ha arrancado bien (si no llega, la próxima vez se vuelve a la del APK) */
    @PluginMethod
    public void webOk(PluginCall call) {
        Actualizar.webOk(getContext());
        call.resolve();
    }

    /** version.json de la última versión publicada en GitHub */
    @PluginMethod
    public void buscarVersion(PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(JSObject.fromJSONObject(Actualizar.buscar()));
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    /** Descarga la web nueva ({ build, web: sha256, nativo }); queda lista para aplicarWeb o para la próxima vez */
    @PluginMethod
    public void bajarWeb(PluginCall call) {
        int build = call.getInt("build", 0);
        String sha = call.getString("web", "");
        String nativo = call.getString("nativo", "");
        new Thread(() -> {
            try {
                Actualizar.bajarWeb(getContext(), build, sha, nativo);
                call.resolve(new JSObject().put("build", build));
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    /** Pasa ya a la web descargada ({ build }): Capacitor recarga la app desde ella */
    @PluginMethod
    public void aplicarWeb(PluginCall call) {
        int build = call.getInt("build", 0);
        if (!new java.io.File(Actualizar.carpetaDe(getContext(), build), "index.html").exists()) {
            call.reject("Esa versión no está descargada");
            return;
        }
        call.resolve();
        getBridge().setServerBasePath(Actualizar.usar(getContext(), build));
    }

    /** Descarga e instala el APK nuevo ({ url }); el progreso llega como evento «descarga» { pct } */
    @PluginMethod
    public void instalarApk(PluginCall call) {
        if (!Actualizar.puedeInstalar(getContext())) {
            // Hay que permitir una vez que esta app instale actualizaciones
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getActivity().startActivity(i);
            } catch (Exception ignored) {}
            call.reject("Permite que «Mi aventura» instale aplicaciones y vuelve a pulsar Actualizar", "PERMISO");
            return;
        }
        String url = call.getString("url", "");
        new Thread(() -> {
            try {
                Actualizar.instalarApk(getContext(), url, (p) -> notifyListeners("descarga", new JSObject().put("pct", p)));
                call.resolve();
            } catch (Exception e) {
                call.reject(mensaje(e));
            }
        }).start();
    }

    private static String mensaje(Exception e) {
        if (e instanceof java.net.UnknownHostException || e instanceof java.net.SocketTimeoutException) return "Sin conexión con GitHub";
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }

    // ---------------- Recordatorio ----------------

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
