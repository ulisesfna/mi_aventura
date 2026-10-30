"""Paso 2 de la compilación del APK: adapta el proyecto Android que crea `npx cap add android`.

· Copia el código nativo del recordatorio (carpeta nativo/) y lo registra en el manifiesto.
· Permisos: notificaciones, alarmas exactas, arranque del móvil, batería.
· Icono (el atardecer de Mi aventura), icono de notificación y pantalla de carga.
· Android 8 como mínimo y número de versión = número de compilación (BUILD).
"""
import glob
import json
import os
import re
import shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(AQUI, 'android', 'app')
MAIN = os.path.join(APP, 'src', 'main')
RES = os.path.join(MAIN, 'res')
with open(os.path.join(AQUI, 'capacitor.config.json'), encoding='utf-8') as f:
    APP_ID = json.load(f)['appId']
BUILD = int(os.environ.get('BUILD') or 1)

CIELO_ARRIBA, CIELO_ABAJO, MAR, SOL = '#FFF7B267', '#FFD35A35', '#FF1F6F78', '#FFFFF3DA'
PAPEL = '#FFFBF7F0'


def leer(ruta):
    with open(ruta, encoding='utf-8') as f:
        return f.read()


def escribir(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(texto)


def cambiar(ruta, patron, nuevo, obligatorio=True):
    texto = leer(ruta)
    texto2, n = re.subn(patron, nuevo, texto, count=1)
    if obligatorio and n == 0:
        raise SystemExit(f'{ruta}: no se encontró {patron!r}')
    escribir(ruta, texto2)


def rect(x, y, w, h, r=0):
    """Rectángulo (con esquinas redondeadas) como trazado de VectorDrawable"""
    if not r:
        return f'M{x},{y}h{w}v{h}h{-w}z'
    return (f'M{x + r},{y}h{w - 2 * r}a{r},{r} 0 0 1 {r},{r}v{h - 2 * r}a{r},{r} 0 0 1 {-r},{r}'
            f'h{-(w - 2 * r)}a{r},{r} 0 0 1 {-r},{-r}v{-(h - 2 * r)}a{r},{r} 0 0 1 {r},{-r}z')


# ---------------- Código nativo ----------------

paquete = os.path.join(MAIN, 'java', *APP_ID.split('.'))
os.makedirs(paquete, exist_ok=True)
for java in glob.glob(os.path.join(AQUI, 'nativo', '*.java')):
    shutil.copy2(java, paquete)  # MainActivity.java sustituye a la de la plantilla

# ---------------- Manifiesto ----------------

manifiesto = os.path.join(MAIN, 'AndroidManifest.xml')
permisos = '''    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
</manifest>'''
receptor = f'''        <receiver android:name="{APP_ID}.RecordatorioReceiver" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" />
            </intent-filter>
        </receiver>
    </application>'''
cambiar(manifiesto, r'</application>', receptor)
cambiar(manifiesto, r'</manifest>\s*$', permisos)

# ---------------- Icono de la app (adaptable): sol poniéndose sobre el mar ----------------
# Lienzo de 108 dp; el dibujo cabe en la zona segura (círculo de 66 dp en el centro)

HORIZONTE, RADIO = 64, 24
sol = f'M{54 - RADIO},{HORIZONTE}a{RADIO},{RADIO} 0 0 1 {2 * RADIO},0z'
reflejos = [('#BFFFF3DA', rect(32, 69, 44, 3.4, 1.7)), ('#80FFF3DA', rect(41, 75.5, 26, 3, 1.5)), ('#4DFFF3DA', rect(49, 81.5, 10, 2.6, 1.3))]
frente = [(SOL, sol)] + reflejos


def caminos(lista, sangria='    '):
    return '\n'.join(f'{sangria}<path android:fillColor="{c}" android:pathData="{d}" />' for c, d in lista)


def cielo(alto):
    return f'''    <path android:pathData="M0,0h108v{alto}h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="0" android:startY="0" android:endX="0" android:endY="{alto}">
                <item android:offset="0" android:color="{CIELO_ARRIBA}" />
                <item android:offset="1" android:color="{CIELO_ABAJO}" />
            </gradient>
        </aapt:attr>
    </path>
    <path android:fillColor="{MAR}" android:pathData="M0,{HORIZONTE}h108v{108 - HORIZONTE}h-108z" />'''


CABECERA = '''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">'''

escribir(os.path.join(RES, 'drawable', 'ic_aventura_fondo.xml'), f'{CABECERA}\n{cielo(HORIZONTE)}\n</vector>\n')
escribir(os.path.join(RES, 'drawable', 'ic_aventura_frente.xml'), f'{CABECERA}\n{caminos(frente)}\n</vector>\n')
# Icono completo con esquinas redondeadas (para la pantalla de carga)
escribir(os.path.join(RES, 'drawable', 'ic_aventura_entero.xml'), f'''{CABECERA}
    <group>
        <clip-path android:pathData="{rect(0, 0, 108, 108, 24)}" />
{cielo(HORIZONTE)}
{caminos(frente, '        ')}
    </group>
</vector>
''')
adaptable = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_aventura_fondo" />
    <foreground android:drawable="@drawable/ic_aventura_frente" />
</adaptive-icon>
'''
for nombre in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    escribir(os.path.join(RES, 'mipmap-anydpi-v26', nombre), adaptable)

# Icono de la barra de notificaciones (blanco: Android solo usa la silueta)
escribir(os.path.join(RES, 'drawable', 'ic_stat_aventura.xml'), f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M5,13a7,7 0 0 1 14,0z{rect(2.5, 14.5, 19, 1.8, 0.9)}{rect(6, 17.5, 12, 1.6, 0.8)}{rect(9, 20.3, 6, 1.5, 0.75)}" />
</vector>
''')

# Pantalla de carga: papel con el icono en el centro (en lugar del logo de Capacitor)
for png in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    os.remove(png)
escribir(os.path.join(RES, 'drawable', 'splash.xml'), f'''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="{PAPEL}" /></item>
    <item android:drawable="@drawable/ic_aventura_entero" android:gravity="center" android:width="128dp" android:height="128dp" />
</layer-list>
''')

# ---------------- Tema: sin dibujar bajo la barra de estado (Android 15) ----------------

estilos = os.path.join(RES, 'values', 'styles.xml')
for estilo in ('AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch'):
    cambiar(estilos, r'(<style name="' + re.escape(estilo) + r'"[^>]*>)',
            r'\1\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'
            r'\n        <item name="android:statusBarColor">' + CIELO_ABAJO + '</item>')

# ---------------- Versión y Android mínimo ----------------

cambiar(os.path.join(AQUI, 'android', 'variables.gradle'), r'minSdkVersion\s*=\s*\d+', 'minSdkVersion = 26')
gradle = os.path.join(APP, 'build.gradle')
cambiar(gradle, r'versionCode\s+\d+', f'versionCode {BUILD}')
cambiar(gradle, r'versionName\s+"[^"]*"', f'versionName "1.{BUILD}"')

# Firma: siempre con la misma llave (si cambia, Android no deja actualizar encima)
llave = os.environ.get('KEYSTORE_FILE')
if llave:
    firma = f'''android {{
    signingConfigs {{
        debug {{
            storeFile file({json.dumps(llave)})
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }}
    }}'''
    cambiar(gradle, r'android\s*\{', firma.replace('\\', '\\\\'))

print('Proyecto Android adaptado (versión', BUILD, ')')
