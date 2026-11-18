package io.github.ulisesfna.miaventura;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Versión de la web que se va a usar (la descargada, si hay una lista), antes de que Capacitor la cargue
        try {
            Actualizar.alArrancar(this);
        } catch (Exception ignored) {
            // Ante cualquier problema, la web que trae el APK
        }
        // Los plugins propios se registran antes de crear la app
        registerPlugin(RecordatorioPlugin.class);
        super.onCreate(savedInstanceState);
        // Abierta tocando el recordatorio: la página lo pregunta al arrancar (consumirAbrirNuevo)
        Intent i = getIntent();
        if (i != null && i.getBooleanExtra(Recordatorio.EXTRA_NUEVO, false)) {
            i.removeExtra(Recordatorio.EXTRA_NUEVO);
            Recordatorio.abrirNuevo = true;
        }
    }
}
