package io.github.ulisesfna.miaventura;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONException;
import org.json.JSONObject;

/** Recibe la hora del recordatorio y el reinicio del móvil */
public class RecordatorioReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent.getAction();
        if (accion == null) return;
        if (!Recordatorio.DISPARAR.equals(accion)) {
            // Arranque del móvil, app actualizada o permiso de alarmas exactas concedido
            Recordatorio.reprogramar(ctx);
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
