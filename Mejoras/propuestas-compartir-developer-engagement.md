# Propuestas — Compartir en redes, Developer y Engagement

Fecha: 2026-07-07 · Rama: `claude/premium-business-version-r18qeh`
Estado: **la mayoría ya está implementada** (ver "IMPLEMENTADO" abajo). Quedan como propuestas de futuro los puntos marcados como pendientes.

---

## ✅ IMPLEMENTADO en esta tanda

**Match de sabor (arreglado el bug del 39%).** Nuevo `frontend/src/utils/tasteMatch.ts` con tests: ahora **solo hay porcentaje si ambos habéis valorado los mismos lugares**. Sin sitios en común → sin match (antes contaba "categorías", seguidores y actividad, de ahí el 39% con una pizza que no probaste). La base es la similitud de notas en lo común, con confianza creciente según nº de coincidencias (1 solo sitio ≤ ~63%) y plus si coincidís en el MISMO plato. Se aplica en el carrusel de Home y en el % de los perfiles. Toggle en Developer → Otros.

**Compartir en redes:**
- **Open Graph dinámico** (`functions/modules/ssr-meta.js` + rewrite `/s/**` en `firebase.json`): al compartir un lugar/lista/plato la URL usa `/s/...`, que sirve a los bots de WhatsApp/Telegram/Twitter un HTML con título, foto y nota reales, y redirige al instante a la app para las personas. Fin del "Listopic — Comparte listas" genérico en todos los links.
- **Textos con gancho por entidad** (`frontend/src/utils/shareTexts.ts`): reseña → "⭐ 8,7 · Tarta de queso en Casa Paca. Mi reseña en Listopic:"; lista → "📋 …, votada por la comunidad:"; etc.
- **Tarjetas nuevas** (`frontend/src/components/ShareCardModern.tsx`): se acabaron las 8 variantes con html2canvas (1.900 líneas, datos desencuadrados). Ahora **2 variantes** (Story 9:16 y Post 1:1) dibujadas en `<canvas>` con layout determinista: foto a sangre, nota gigante en burbuja, título auto-ajustado a 2-3 líneas, barras de criterios y pie con autor + marca. Sin desencuadres.

**Engagement:**
- **Match de sabor** (arriba).
- **Duelo de la semana** (`WeeklyDuelBanner` + colección `duels`): banner en Home con dos platos rivales y votación de la comunidad (un voto por usuario, cambiable). Se crea/finaliza en Developer → Propuestas Pro. Flag `showWeeklyDuel` en Developer → Otros.
- **Pasaporte de sabores** (`components/profile/TastePassport.tsx`): sellos bronce/plata/oro por categoría según sitios distintos reseñados, en el perfil propio. Flag `showTastePassport` en Developer → Otros.

**Backups:**
- Manual (pestaña Developer → Backups) **y automático semanal** (`weeklyFirestoreBackup`, lunes 04:00, con retención de 8 copias).

---

## Estado inicial (referencia)

Estado: propuestas para decidir. Los backups y los impulsos gratis ya están implementados (ver checklist al final).

---

## 1. Compartir en redes (links, textos y tarjetas)

### Diagnóstico (código revisado)

| Problema | Causa | Dónde |
|---|---|---|
| Cualquier link compartido en WhatsApp/Telegram/Twitter se ve igual: "Listopic — Comparte y descubre listas", sin foto del lugar | Las etiquetas Open Graph son **estáticas** en `frontend/index.html`; al ser una SPA, los bots no ejecutan JS | `index.html` líneas 59-60 |
| Las tarjetas de imagen quedan desencuadradas y "feuchas" | `ShareCard.tsx` son **1.900 líneas con 8 variantes** de estilos inline calibrados a mano y renderizados con `html2canvas`, que no respeta bien fuentes, sombras ni `object-fit`; cada dato nuevo descuadra las 8 variantes | `frontend/src/components/ShareCard.tsx` |
| El texto compartido es pobre: `"{texto} {url}"` | No hay plantillas por tipo de entidad | `ShareModal.tsx` línea 345 |

### Propuesta (en orden de impacto)

1. **Open Graph dinámico (el 80 % del valor).** Función `ssrMeta` en Cloud Functions + rewrite de Hosting para `/place/**`, `/list/**` y `/group/**`: si el user-agent es un bot (WhatsApp, Telegram, Twitter, Facebook, Google), sirve un HTML mínimo con `og:title` (nombre del lugar/lista), `og:description` (nota media + nº reseñas + ciudad), `og:image` (foto del lugar) y redirect para humanos. Sin tocar la SPA. Resultado: cada link compartido lleva su foto y su título real.
2. **Tarjetas: menos variantes, mejor motor.** Reducir de 8 variantes a **2 bien acabadas** (story 9:16 y cuadrada 1:1) y migrar de `html2canvas` a **SVG renderizado a canvas** (mismo enfoque que los marcadores del mapa): layout determinista, sin desencuadres, tipografía embebida. La nota grande, la foto a sangre, el radar solo si hay ≥3 criterios. Borrar el código de las 6 variantes restantes (~1.200 líneas menos).
3. **Textos por entidad.** Plantillas cortas con gancho: reseña → `"⭐ 8,7 · Tarta de queso en Casa Paca. Mi reseña en Listopic:"`; lista → `"Los 12 mejores ramen de Madrid, votados por la comunidad:"`; lugar → nota + nº reseñas. Un solo módulo `shareTexts.ts`.
4. (Opcional, más adelante) `og:image` generada al vuelo con la nota y foto — la misma función `ssrMeta` puede servir una imagen compuesta.

## 2. Developer: revisión de pestañas

Hoy hay 20 pestañas. Auditoría rápida:

- **Sanas y en uso**: Consola, Planes, Propuestas Pro, Backups (nueva), Solicitudes negocio, Gestor negocios, Listas/Lugares/Reseñas/Tags/Usuarios, Audit, Marca & SEO, Gamificación, Reportes, API usage.
- **Candidatas a revisar/quitar** (decisión tuya):
  - `Proyectos`: si es un tablón de notas manual, mejor vivir en `Mejoras/*.md` del repo.
  - `Mantenimiento → tarjeta de consolidación de reseñas`: la migración root→listas terminó (auditoría 2026-07-04: 0 docs); puede quedar solo el recuento como red de seguridad y quitar el resto.
  - `Otros` (flags sueltos de UI): fusionar con Marca & SEO en una sola pestaña "Configuración".
- **Imperdibles que faltan** (propuesta):
  1. **Panel de salud** (primera pestaña): usuarios activos 7d, reseñas/día, lugares nuevos, errores recientes de functions — hoy no hay forma rápida de saber si la app "respira".
  2. **Backups automáticos**: programar el export semanal (misma función, `onSchedule`) + retención (borrar >8 semanas).
  3. **Moderación centralizada**: los reportes ya existen, pero unificar reportes + propuestas + claims en una bandeja única "Pendiente de mí" con contador en el sidebar.

## 3. Engagement: tres ideas novedosas (elegir una y hacerla bien)

Lo genérico (retos, rankings, badges) ya está en el roadmap. Estas tres son diferenciales y encajan con lo que Listopic ya tiene (criterios, listas, geo):

1. **"Match de sabor"** 🧬 — % de afinidad entre dos usuarios calculado con las notas por criterio en lugares comunes ("Tú y @ana coincidís al 87 %"). Se muestra en perfiles y chats, y genera la mejor recomendación posible: "A la gente con tu paladar le encanta X a 400 m". Es social, presumible (se comparte solo) y usa datos que nadie más tiene (criterios, no estrellas planas).
2. **"El Duelo de la semana"** ⚔️ — cada semana, en cada ciudad, dos platos rivales de la misma categoría (elegidos por datos: parecida nota, muchos votos) y la comunidad vota visitando y reseñando. El plato ganador luce corona una semana. Barato de construir (una colección + un banner en Home) y crea hábito semanal + reseñas nuevas.
3. **"Pasaporte de barrio"** 🗺️ — el mapa personal se convierte en un pasaporte con sellos por barrio/categoría (ya hay heatmap en ideas): "Te faltan 2 sitios para el sello de Malasaña". Con tarjeta compartible del pasaporte (enlaza con el rediseño de share cards).

Mi recomendación: **Match de sabor** — es lo que más "engancha y presume", y ningún competidor lo tiene con criterios reales.

---

## 4. Checklist de pruebas de TODO lo hecho en este chat

Antes de nada, desplegar: `git pull` + `firebase deploy --only functions,firestore:rules,storage:rules`.

**Planes (Developer → Planes):**
- [ ] Dar Business Pro a un local (indefinido y con caducidad) y quitárselo. Chips de procedencia.
- [ ] Dar/quitar premium a un usuario (campo `premium` en su doc).
- [ ] Regalar impulsos a un negocio (chip amarillo con el saldo) y retirarlos (número negativo).

**Gestión del negocio (local Pro):**
- [ ] Pestañas Imagen/Elementos/Patrocinado/Estadísticas abren; sin Pro sale el paywall (con nota de que los datos se conservan).
- [ ] Imagen: guardar portada URL + color + texto → se ven en la página pública del lugar.
- [ ] Elementos: aparecen los platos de la comunidad (la primera carga puede autocurar el lugar); crear secciones y ordenarlas; ficha con precio/sección/alérgenos/descripción; "Vista previa de la carta"; añadir elemento nuevo.
- [ ] Reseñas por elemento visibles; proponer fusión/renombre/mover reseña → aprobar en Developer → Propuestas Pro → el cambio se aplica y llega notificación.
- [ ] Patrocinado: crear oferta (borrador no se publica; activa sí, en la página del lugar); solicitar campaña home; solicitar plato destacado con impulsos (el precio usa €/km·semana y descuenta el saldo de regalo).
- [ ] Estadísticas: totales, gráfico mensual, top platos.

**Página pública del lugar:**
- [ ] Portada personalizada + texto; tarjeta Ofertas "Patrocinado"; La Carta por secciones con precios, alérgenos, notas de la comunidad y "Actualizada el {fecha}"; al quitar el Pro todo lo comercial desaparece (y vuelve al reactivar); las fusiones aprobadas se mantienen sin Pro.

**Patrocinio visible:**
- [ ] Activar una campaña home → tarjeta en la Home. Activar un plato destacado → carrusel "Platos destacados cerca de ti" en Home y en la lista vinculada (requiere ubicación dentro del radio; cada tarjeta con su cartelito). Chincheta dorada con "P" en los mapas para lugares con publicidad activa.
- [ ] Developer → Propuestas Pro: editar la fórmula de precios y comprobar que la cotización del negocio cambia.

**Backups (Developer → Backups):**
- [ ] "Crear copia ahora" → aparece en la lista con tamaño y fecha → descargar el JSON.

**Convivencia manual/Stripe (cuando actives Stripe):**
- [ ] El webhook no debe degradar un plan manual; checkout requiere secrets configurados.
