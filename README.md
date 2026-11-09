# Cartelera Concepción

Página: https://www2.udec.cl/~rormeno/cartelera/ (archivo `index.html`, que lee `cartelera.json` de este repositorio).

## Cómo se actualiza

GitHub Actions corre `scripts/actualizar.mjs` todos los días a las 06:17 (hora de Chile en verano). El programa lee directamente:

| Lugar | De dónde saca los datos |
|---|---|
| Teatro Biobío | Ticketplus (funciones, horas y precios) y teatrobiobio.cl (exposiciones y actividades gratis) |
| Corcudec · Teatro UdeC | Programación de corcudec.cl (fechas y horas) + Ticketplus + agenda de concepcioncultural.cl (espectáculos externos) |
| UCSC | ucsc.cl/eventos, solo cultura y extensión en Concepción |
| Casa del Arte UdeC | pinacoteca.udec.cl, exposiciones actuales y próximas |
| Alianza Francesa | afconcepcion.cl (hoy no responde a lectores fuera de Chile; ver abajo) |
| Galería de la Historia | ghconcepcion.cl |

La página muestra siempre hoy y los 6 días siguientes. Si un sitio no responde, se conserva lo último que se tenía de ese lugar y se avisa en las notas.

## Actualizar a mano

Pestaña **Actions** → **Actualizar cartelera** → **Run workflow**.

## Agregar algo que no aparece

Edita `manual.json` en GitHub (botón del lápiz) siguiendo el ejemplo. Al guardar, la cartelera se regenera sola.
