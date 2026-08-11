# Bitácora — registro de tiempo diario

App estática (HTML + CSS + JS puro, sin dependencias externas) para apuntar en qué inviertes el tiempo cada día, pensada para usarse desde el móvil.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser privado o público).
2. Sube estos tres archivos (`index.html`, `style.css`, `script.js`) a la raíz del repositorio.
3. Ve a **Settings → Pages**.
4. En "Build and deployment", elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
5. Guarda. En un par de minutos tendrás la app en `https://tu-usuario.github.io/tu-repo/`.

Añádela a la pantalla de inicio del móvil (Safari/Chrome → "Añadir a inicio") para que se abra como una app.

## Cómo funciona

- Todo se guarda en `localStorage` del navegador, en el dispositivo donde la uses. No hay servidor ni base de datos.
- Cada entrada tiene: tarea, hora de inicio y hora de fin.
- Los huecos del día sin registrar se cuentan automáticamente como **Desconocido** en las gráficas y el resumen.
- El botón **Exportar todo (JSON)** descarga TODOS los días guardados en un único archivo — úsalo como copia de seguridad periódica, ya que los datos solo viven en ese navegador/dispositivo.
- El botón **Importar copia** permite restaurar o fusionar un archivo exportado (los días coincidentes se sobrescriben).
- El selector de "Días guardados" y las flechas ‹ › permiten cargar cualquier día anterior.

## Notas

- Al ser 100% estático y sin dependencias de red, funciona también sin conexión una vez cargado.
- Si usas el mismo repositorio desde varios dispositivos, recuerda que los datos NO se sincronizan entre ellos (cada uno tiene su propio localStorage) — exporta/importa para pasar datos de uno a otro.
