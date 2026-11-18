package io.github.ulisesfna.miaventura;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONException;
import org.json.JSONObject;

/** Recibe la hora del recordatorio, el reinicio del móvil y la respuesta del instalador de Android */
public class RecordatorioReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent.getAction();
        if (accion == null) return;
        if (Actualizar.INSTALADA.equals(accion)) {
            // Respuesta del instalador de Android (confirmar, error o cancelada)
            Actualizar.resultado(ctx, intent);
            return;
        }
        if (!Recordatorio.DISPARAR.equals(accion)) {
            // Arranque del móvil, app actualizada o permiso de alarmas exactas concedido
            Recordatorio.reprogramar(ctx);
            if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) Actualizar.trasActualizar(ctx);
            return;
        }
        JSONObject a;
        try {
            String txt = intent.getStringExtra("aviso");
            a = new JSONObject(txt == null ? "{}" : txt);
        } catch (JSONException e) {
            return;
        }
        if (a.optBoolean("prueba")) {
            Recordatorio.mostrar(ctx, Recordatorio.ID_PRUEBA, a.optString("titulo", "Mi aventura"), a.optString("texto", ""));
            return;
        }
        // Se usa el guardado (no el de la alarma) por si la app lo ha cambiado o quitado entretanto
        JSONObject guardado = Recordatorio.leer(ctx);
        if (guardado != null) Recordatorio.disparar(ctx, guardado);
    }
}
