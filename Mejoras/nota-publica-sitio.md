# Nota pública del sitio (02/10/2026)

## Reglas

| Campo de `places/{id}` | Qué cuenta |
|---|---|
| `averageRating` · `reviewsCount` | Valoraciones **públicas** (`visibility: 'public'`) de cualquier Lista o Minilista, **sin bots**. Los críticos sí cuentan: son usuarios. |
| `criticRating` · `criticReviewsCount` | Solo las de **críticos verificados** (`publicProfiles.userType` incluye `critico`, que solo asigna un jefe). Tampoco cuentan las privadas. |

- **Las dos notas se muestran por separado; la de críticos nunca se mezcla en la general.**
  - La nota de críticos aparece en la ficha del sitio como un chip aparte.
  - Con menos de **3 críticos** (`CRITIC_MIN_SAMPLE`) se marca como **provisional**.
- Bots y críticos se leen de `publicProfiles` en el momento del cálculo. Si un usuario pasa a crítico, su nota de críticos se actualiza con la siguiente valoración del sitio (o con el script).
- **Código:**
  - servidor: `functions/modules/lib/place-rating.js` y `lib/author-roles.js`;
  - web: `frontend/src/lib/placeRating.ts`.
- **Lo usan, con la misma regla:**
  - el trigger del sitio (`recalculateAggregatesForPlace`);
  - el recuento de Developer (`adminRecountReviewCounters`);
  - el script de abajo.

## Arreglado de paso

- **`places.reviewsCount` se tocaba en dos sitios a la vez:** un incremento más el recálculo, y se desviaba ±1. Se ha quitado el incremento; ahora solo recalcula.
- **El trigger raíz antiguo (`reviews/`) tenía su propia media.** Ahora llama al mismo recálculo.
- **`adminRecountReviewCounters` contaba lo privado:**
  - en `lists.reviewCount`, las valoraciones privadas de Minilistas dentro de Listas públicas;
  - en los sitios, las privadas y las de bots.
  - Ahora usa `list-metrics` y `place-rating`.
- **`itemTags` y `hasReviewedPhoto` del sitio** solo salen de valoraciones públicas.

## Impacto en datos

- **Sitios que solo tenían valoraciones privadas o de bots:** se quedan con `reviewsCount: 0` y dejan de salir en Buscar → Sitios, que filtra `reviewsCount > 0`. El script dice cuántos son.
- **Algolia `places`:** recoge `averageRating` y `reviewsCount` nuevos en cuanto se escribe cada sitio. No hace falta reindexar a mano.

## Pasos (tras fusionar y desplegar Functions)

```
cd functions
node scripts/recalc-place-ratings.js            # simulación: tabla antes → después, privadas y bots quitadas
node scripts/recalc-place-ratings.js --apply --expect=N
```

- Deshacer: `node scripts/restore-backup.js backups/recalc-place-ratings-….json --apply`.
- Probado en el emulador:
  - una simulación, un `--expect` erróneo (no escribe), la escritura, una segunda simulación (0 cambios) y la restauración en simulación;
  - caso real del sitio p1: 7 · 9 (crítico) · 8 (crítico) · 2 (bot) · 1 (privada) → media **8**, críticos **8,5** (2, provisional).
