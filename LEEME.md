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

## Copias de seguridad

Los recuerdos se guardan **solo en el dispositivo** donde los apuntas. Desde ⋯ → «Descargar copia de seguridad» obtienes un `.json` que puedes guardar en la nube o restaurar en otro dispositivo. El punto naranja del menú te avisa si llevas más de un mes sin hacer copia.

«Ver como texto» exporta todo en el formato de siempre (`*negrita*`, `_cursiva_`, `==resaltado==`, `[viaje: Nombre]`), y ese mismo texto se puede volver a importar.

## Atajos (ordenador)

- `N`: añadir recuerdo hoy
- `/`: buscar
- `Enter` en un plan: nuevo plan · `Ctrl+Enter`: guardar
