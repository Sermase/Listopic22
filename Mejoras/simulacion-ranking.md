# Simulación del ranking: prior fijo 7 frente a alternativas

Fecha: 30/09/2026. **Solo lectura**, valoraciones públicas reales. **La fórmula NO se ha cambiado**:
sigue siendo `posición = (n·media + m·C) / (n + m)` con **C = 7 y m = 3**.

- `C` = nota de referencia hacia la que se «encoge» un elemento con pocas valoraciones.
- `m` = fuerza de esa referencia (equivale a «m valoraciones imaginarias de nota C»).
- En pantalla se muestra siempre la media real; esta posición solo ordena.

Datos: 119 valoraciones públicas · media global Listopic **7.69** · medias de Lista entre **6.92** y **9.10**.

## 1. Tus seis ejemplos

Cada celda: posición bayesiana (puesto entre los seis). Media real siempre visible aparte.

### m = 1

| Prior | 10.0 con 1 | 9.5 con 2 | 9.0 con 5 | 8.8 con 10 | 8.5 con 25 | 8.2 con 100 | ¿10 con 1 es #1? |
|---|---|---|---|---|---|---|---|
| C = 7 (actual) | 8.50 (#4) | 8.67 (#1) | 8.67 (#2) | 8.64 (#3) | 8.44 (#5) | 8.19 (#6) | no |
| C = media global (7.69) | 8.85 (#2) | 8.90 (#1) | 8.78 (#3) | 8.70 (#4) | 8.47 (#5) | 8.19 (#6) | no |
| C = Lista exigente (9.10) | 9.55 (#1) | 9.37 (#2) | 9.02 (#3) | 8.83 (#4) | 8.52 (#5) | 8.21 (#6) | **sí** |
| C = Lista suave (6.92) | 8.46 (#4) | 8.64 (#2) | 8.65 (#1) | 8.63 (#3) | 8.44 (#5) | 8.19 (#6) | no |

### m = 2

| Prior | 10.0 con 1 | 9.5 con 2 | 9.0 con 5 | 8.8 con 10 | 8.5 con 25 | 8.2 con 100 | ¿10 con 1 es #1? |
|---|---|---|---|---|---|---|---|
| C = 7 (actual) | 8.00 (#6) | 8.25 (#4) | 8.43 (#2) | 8.50 (#1) | 8.39 (#3) | 8.18 (#5) | no |
| C = media global (7.69) | 8.46 (#4) | 8.60 (#3) | 8.63 (#1) | 8.62 (#2) | 8.44 (#5) | 8.19 (#6) | no |
| C = Lista exigente (9.10) | 9.40 (#1) | 9.30 (#2) | 9.03 (#3) | 8.85 (#4) | 8.54 (#5) | 8.22 (#6) | **sí** |
| C = Lista suave (6.92) | 7.95 (#6) | 8.21 (#4) | 8.41 (#2) | 8.49 (#1) | 8.38 (#3) | 8.17 (#5) | no |

### m = 3 (actual)

| Prior | 10.0 con 1 | 9.5 con 2 | 9.0 con 5 | 8.8 con 10 | 8.5 con 25 | 8.2 con 100 | ¿10 con 1 es #1? |
|---|---|---|---|---|---|---|---|
| C = 7 (actual) | 7.75 (#6) | 8.00 (#5) | 8.25 (#3) | 8.38 (#1) | 8.34 (#2) | 8.17 (#4) | no |
| C = media global (7.69) | 8.27 (#5) | 8.42 (#3) | 8.51 (#2) | 8.54 (#1) | 8.41 (#4) | 8.19 (#6) | no |
| C = Lista exigente (9.10) | 9.32 (#1) | 9.26 (#2) | 9.04 (#3) | 8.87 (#4) | 8.56 (#5) | 8.23 (#6) | **sí** |
| C = Lista suave (6.92) | 7.69 (#6) | 7.95 (#5) | 8.22 (#3) | 8.37 (#1) | 8.33 (#2) | 8.16 (#4) | no |

### m = 5

| Prior | 10.0 con 1 | 9.5 con 2 | 9.0 con 5 | 8.8 con 10 | 8.5 con 25 | 8.2 con 100 | ¿10 con 1 es #1? |
|---|---|---|---|---|---|---|---|
| C = 7 (actual) | 7.50 (#6) | 7.71 (#5) | 8.00 (#4) | 8.20 (#2) | 8.25 (#1) | 8.14 (#3) | no |
| C = media global (7.69) | 8.08 (#6) | 8.21 (#4) | 8.35 (#3) | 8.43 (#1) | 8.37 (#2) | 8.18 (#5) | no |
| C = Lista exigente (9.10) | 9.25 (#1) | 9.21 (#2) | 9.05 (#3) | 8.90 (#4) | 8.60 (#5) | 8.24 (#6) | **sí** |
| C = Lista suave (6.92) | 7.43 (#6) | 7.66 (#5) | 7.96 (#4) | 8.17 (#2) | 8.24 (#1) | 8.14 (#3) | no |

### m = 10

| Prior | 10.0 con 1 | 9.5 con 2 | 9.0 con 5 | 8.8 con 10 | 8.5 con 25 | 8.2 con 100 | ¿10 con 1 es #1? |
|---|---|---|---|---|---|---|---|
| C = 7 (actual) | 7.27 (#6) | 7.42 (#5) | 7.67 (#4) | 7.90 (#3) | 8.07 (#2) | 8.09 (#1) | no |
| C = media global (7.69) | 7.90 (#6) | 7.99 (#5) | 8.13 (#4) | 8.25 (#2) | 8.27 (#1) | 8.15 (#3) | no |
| C = Lista exigente (9.10) | 9.18 (#1) | 9.17 (#2) | 9.07 (#3) | 8.95 (#4) | 8.67 (#5) | 8.28 (#6) | **sí** |
| C = Lista suave (6.92) | 7.20 (#6) | 7.35 (#5) | 7.61 (#4) | 7.86 (#3) | 8.05 (#2) | 8.08 (#1) | no |

## 2. Efecto en las Listas públicas reales

Posiciones que cambian respecto a la fórmula actual (C = 7, m = 3) y Listas cuyo #1 cambia.

| Variante | Posiciones que cambian | Listas con #1 distinto |
|---|---|---|
| C = media global, m = 1 | 5 de 110 | 1 de 9 |
| C = media global, m = 2 | 6 de 110 | 1 de 9 |
| C = media global, m = 3 | 6 de 110 | 1 de 9 |
| C = media global, m = 5 | 5 de 110 | 0 de 9 |
| C = media global, m = 10 | 5 de 110 | 0 de 9 |
| C = media de cada Lista, m = 1 | 5 de 110 | 1 de 9 |
| C = media de cada Lista, m = 2 | 4 de 110 | 1 de 9 |
| C = media de cada Lista, m = 3 | 2 de 110 | 0 de 9 |
| C = media de cada Lista, m = 5 | 5 de 110 | 0 de 9 |
| C = media de cada Lista, m = 10 | 5 de 110 | 0 de 9 |
| C = 7, m = 1 | 4 de 110 | 1 de 9 |
| C = 7, m = 2 | 2 de 110 | 0 de 9 |
| C = 7, m = 5 | 2 de 110 | 0 de 9 |
| C = 7, m = 10 | 2 de 110 | 0 de 9 |

## 3. Lectura

- **C = media de cada Lista queda descartado.** En una Lista exigente (media 9,10), un 10 con una sola valoración queda #1 con **cualquier** m. Contradice «una valoración no basta para encabezar».
- **C = 7 (actual) y C = media global (7,69) cumplen la regla con m ≥ 2.** Con m = 3, el 10 con 1 queda #6 (C = 7) o #5 (C = global), y el 8,8 con 10 queda #1 en ambos.
- **Diferencia entre C = 7 y C = media global:** la global es algo más generosa con las medias altas con pocas valoraciones (9,0 con 5 sube de #3 a #2). En datos reales solo cambian 6 de 110 posiciones y el #1 de 1 Lista.
- **m (fuerza):**
  - Con m = 1, un 9,5 con 2 valoraciones gana: casi no protege.
  - Con m = 10, el 8,2 con 100 gana a todos: premia demasiado el volumen.
  - **m = 3–5 es el tramo equilibrado.**
- **Hoy casi todo tiene una sola valoración**, así que cualquier variante razonable mueve pocas posiciones. La decisión importa más a medida que crezca Listopic.

## 4. Recomendación (sin aplicar)

1. **Mantener C = 7 y m = 3** mientras el conjunto de datos sea pequeño: es estable, predecible y cumple la regla.
2. Revisar cuando haya ≥ 1.000 valoraciones públicas: pasar a **C = media global de Listopic** (recalculada, p. ej., una vez al mes y congelada entre medias), con m = 3. Así la referencia refleja cómo puntúa de verdad la comunidad sin moverse a diario.
3. Cualquier cambio se enseñará antes con esta misma tabla actualizada.

Reproducible: el cálculo usa `rankPosition` de `frontend/src/lib/scoring.ts` y la misma lectura pública que la simulación de B1.
