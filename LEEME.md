# Mi aventura

Diario de recuerdos: los días que hiciste algo distinto, igual que en las notas del móvil pero más cómodo.

## Cómo se marcan los días

| Antes (notas)        | Ahora                                              |
|----------------------|----------------------------------------------------|
| **Negrita**          | Plan en negrita con una luna 🌙 → *hasta tarde*      |
| *Cursiva* (examen)   | Etiqueta rosa con birrete → *examen*                |
| *Cursiva* (viaje)    | Días agrupados en un bloque verde azulado → *viaje* (puedes ponerle nombre) |
| Resaltado            | Fondo de rotulador amarillo → *destacado*           |
| `+` entre planes     | Igual: escribe `plan + otro plan` y se separan solos |

Las marcas van por plan, como antes: en un mismo día puede haber un examen por la mañana y un plan hasta tarde por la noche.

## Usarla en el ordenador

Haz doble clic en `index.html` y ya funciona. Los recuerdos se guardan en ese navegador.

## Usarla en el móvil

La app tiene que estar en una web (https) para instalarla en el móvil:

1. Entra en <https://app.netlify.com/drop> y arrastra esta carpeta (o súbela a GitHub Pages).
2. Abre la dirección que te dé desde el móvil.
3. En iPhone: Compartir → «Añadir a pantalla de inicio». En Android: menú ⋮ → «Instalar aplicación».

Funciona sin conexión. La primera vez, importa tu `.docx` desde el menú ⋯ → «Desde un documento Word».

## Recordatorio

En ⋯ → «Recordatorio» puedes activar un aviso si pasan 3 días sin apuntar nada (por ejemplo, si lo último lo apuntaste un lunes, avisa el jueves). Si sigues sin apuntar, se repite cada 3 días. Solo avisa entre las 9:00 y las 22:00, y al tocarlo se abre el editor de hoy.

Para que llegue con la app cerrada:

- Usa Chrome en Android e **instala la app** (menú ⋮ → «Instalar aplicación»). Chrome solo despierta en segundo plano a las apps instaladas.
- Chrome decide cuándo hacer la comprobación (un par de veces al día), así que el aviso puede llegar unas horas más tarde. Si el móvil tiene ahorro de batería agresivo, quita la restricción a Chrome.
- El permiso de notificaciones es común a todas tus apps de `github.io`.
- Si no llega, abre ⋯ → «Recordatorio» → «Diagnóstico»: dice qué falla (permiso, instalación, versión antigua o que Android no ha despertado a la app).

## App de Android (APK)

Igual que el Calendario: GitHub fabrica la app sola cada vez que subes cambios y la deja en **Releases**. Dentro de la APK el recordatorio es una **alarma del propio móvil**: llega a su hora (por defecto a las 20:00) aunque la app esté cerrada, sin depender de Chrome.

Enlace fijo de descarga: **`https://github.com/TU-USUARIO/TU-REPOSITORIO/releases/latest/download/MiAventura.apk`** (en la versión web también aparece en ⋯ → «App de Android»).

**Preparación (una sola vez)**

1. Sube a GitHub todo como siempre, **incluida la carpeta `android-app`**. No subas copias de seguridad (`mi-aventura-*.json`): el repositorio es público y contienen tus recuerdos.
2. **La llave de firma:** en el repositorio → **Settings → Secrets and variables → Actions → New repository secret** → *Name*: **`APK_KEYSTORE`** → *Secret*: pega el contenido de **`llave-apk/APK_KEYSTORE.txt`** (la misma llave del Calendario) → **Add secret**.
3. **El fabricante:** **Add file → Create new file** → nombre exacto **`.github/workflows/apk.yml`** → pega el contenido de **`android-app/apk.yml`** → **Commit changes**.
4. Pestaña **Actions**: «App Android (APK)» tarda ~5 minutos. Con ✅, el APK está en **Releases**. Si sale ❌, abre el paso en rojo y haz una captura.

**Pasar a la app (tus recuerdos no se mueven solos)**

1. En la versión web: ⋯ → **Descargar copia de seguridad**.
2. Descarga e instala `MiAventura.apk` (permite instalar desde Chrome; si Play Protect avisa → *Más detalles* → **Instalar de todas formas**).
3. Abre la app → **Restaurar copia** → elige el archivo del paso 1.
4. ⋯ → **Recordatorio**: actívalo, acepta las notificaciones y pulsa **Probar con la app cerrada** (cierra la app; al minuto llega el aviso). En Xiaomi, quita el ahorro de batería con el botón que aparece.
5. Desactiva el recordatorio en la versión web y desinstálala del móvil, para no apuntar en dos sitios ni recibir dos avisos.

**Actualizar:** sube los cambios a GitHub. En ~5 minutos hay APK nuevo, la app avisa («Hay una versión nueva → Descargar») y se instala encima **conservando tus recuerdos**.

**Copias en la app:** «Descargar copia de seguridad» abre el menú *Compartir* de Android: guárdala en Drive, en Archivos o mándatela por correo.

## Copias de seguridad

Los recuerdos se guardan **solo en el dispositivo** donde los apuntas. Desde ⋯ → «Descargar copia de seguridad» obtienes un `.json` que puedes guardar en la nube o restaurar en otro dispositivo. El punto naranja del menú te avisa si llevas más de un mes sin hacer copia.

«Ver como texto» exporta todo en el formato de siempre (`*negrita*`, `_cursiva_`, `==resaltado==`, `[viaje: Nombre]`), y ese mismo texto se puede volver a importar.

## Atajos (ordenador)

- `N`: añadir recuerdo hoy
- `/`: buscar
- `Enter` en un plan: nuevo plan · `Ctrl+Enter`: guardar
