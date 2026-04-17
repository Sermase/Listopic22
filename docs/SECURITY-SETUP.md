# Guía de configuración de seguridad — Listopic

Esta guía acompaña al commit "chore(cleanup+security): ..." y recoge todos los
pasos manuales que tú tienes que hacer en Google Cloud / Firebase para que las
reglas, rate-limits y secretos entren en vigor correctamente.

Hazlos en el orden indicado.

---

## 0) Checklist rápida

| Paso | Qué hace | Urgencia |
|-----|----------|----------|
| 1 | **Rotar la Google Places API key** | 🔴 URGENTE (la anterior estuvo expuesta) |
| 2 | Registrar la clave nueva en **Secret Manager** | 🔴 |
| 3 | Desplegar las nuevas reglas de Firestore y Storage | 🔴 |
| 4 | Desplegar Cloud Functions con los cambios | 🔴 |
| 5 | Asignar custom claim `admin=true` a las cuentas `jefe` | 🟡 (mejora rendimiento de Storage rules) |
| 6 | Borrar el campo legacy en Firestore | 🟡 |
| 7 | Restringir la nueva API key a tus dominios/bundles | 🟡 |

---

## 1) Rotar la Google Places API key

La clave antigua (`config/serverSecrets.googlePlacesApiKey` en Firestore)
**estuvo legible por cualquier usuario anónimo** por culpa de la regla
`allow read: if true` en `config/{configId}`. Debes considerarla comprometida.

### En Google Cloud Console

1. Entra a https://console.cloud.google.com/apis/credentials (proyecto `listopic`).
2. Busca la API key que usas para Google Places / Geocoding.
3. Pulsa **Regenerate key** (o **Delete** y crea una nueva si prefieres rotar
   también el ID). Anota el nuevo valor.
4. En la misma pantalla de la API key:
   - **Application restrictions**: "HTTP referrers" con tus dominios:
     `https://listopic.es/*`, `https://listopic.web.app/*`, y localhost
     en dev.
   - **API restrictions**: marca "Restrict key" y selecciona solo:
     Places API, Geocoding API, Maps JavaScript API.

### En Firebase (Secret Manager)

Asegúrate de tener Firebase CLI v13+:

```bash
firebase --version
```

Registra el secret (te pedirá el valor):

```bash
firebase functions:secrets:set GOOGLE_PLACES_API_KEY
```

Opcional, para verificar:

```bash
firebase functions:secrets:access GOOGLE_PLACES_API_KEY
```

---

## 2) Desplegar reglas y funciones

### Reglas

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

Esto publica:
- `firestore.rules` (bloquea lectura pública de `config/serverSecrets`, añade
  `adminAuditLog` y `businessClaims`).
- `firestore.indexes.json` (corregido, más índices nuevos).
- `storage.rules` (ownership en list-images, branding y badges solo para `jefe`,
  deny por defecto).

### Cloud Functions

Las funciones que usan la API de Google Places se han declarado con
`secrets: [GOOGLE_PLACES_API_KEY]`. En el primer deploy Firebase te pedirá
confirmación para enlazar el secret. Responde **"y"**.

```bash
firebase deploy --only functions
```

Si en tu entorno local usas `.env` con `GOOGLE_PLACES_API_KEY=...`, ya no hace
falta: Secret Manager tiene prioridad. Puedes mantenerlo para el emulador.

---

## 3) (Opcional pero recomendado) Custom claim `admin`

Las nuevas reglas de Storage comprueban `request.auth.token.admin == true`
antes de hacer una lectura de Firestore. Si pones el custom claim en las
cuentas `jefe`, Storage no necesita consultar Firestore en cada escritura
(ahorras lecturas y latencia).

Opción A — script one-off en local:

```bash
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });

(async () => {
  const uid = 'UID_DE_TU_CUENTA_JEFE';   // <— cámbialo
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log('OK:', uid);
  process.exit(0);
})();
"
```

(Necesitas `GOOGLE_APPLICATION_CREDENTIALS` apuntando a tu service account key.)

Opción B — función callable de administración que solo puedes invocar tú
mismo. Si quieres, en una próxima iteración la añado al panel DeveloperPage.

Tras asignarlo, **el usuario tiene que cerrar sesión y volver a entrar** para
que el cliente reciba el token con el claim nuevo.

---

## 4) Borrar el secreto antiguo de Firestore

Una vez confirmado que Secret Manager funciona (puedes probar cualquier
función de geocoding y verificar que responde), elimina el campo legacy:

En Firebase Console → Firestore → colección `config` → doc `serverSecrets`
→ borra el campo `googlePlacesApiKey` (o borra el documento entero si no
contiene nada más útil).

Alternativa vía CLI:

```bash
firebase firestore:delete config/serverSecrets
```

---

## 5) Rotación en el repo

La clave de Firebase que ves en `frontend/src/firebase.ts` es **pública por
diseño** (Firebase Web SDK la necesita en cliente). Lo que tiene que
protegerte es:

1. Firestore rules (ya las acabas de desplegar).
2. Storage rules (ya las acabas de desplegar).
3. Restricciones por dominio en la API key de Google Cloud Console:
   - `firebase` → `APIs & Services` → `Credentials` → localiza la "Browser key"
     generada por Firebase y añade restricciones de dominio HTTP referrer
     (`listopic.es`, `listopic.web.app`, `localhost`).

---

## 6) Rate-limits que ahora están activos

Los siguientes endpoints están limitados por UID (o IP si no hay auth):

| Función | Límite | Ventana |
|---|---|---|
| `placesNearbyRestaurants` | 60 | 60 s |
| `placesTextSearch` | 60 | 60 s |
| `getPlaceDetailsFromGoogle` | 60 | 60 s |
| `reverseGeocode` | 60 | 60 s |
| `refreshPlaceMainImage` | 30 | 60 s |
| `getGroupsForPlace` | 120 | 60 s |
| `groupedReviews` | 120 | 60 s |
| `resolveChatParticipants` | 30 | 60 s |
| `syncPlaceStatusFromGoogle` | 30 | 60 s |
| Reportes (collection `reports`) | 15 | 3600 s |

Se guardan contadores en Firestore en la colección `rateLimits/`. Puedes
inspeccionarla si quieres ver si alguien está chocando con los límites.

**Coste estimado**: ~1 lectura + ~1 escritura por petición limitada. Si más
adelante hay tráfico masivo, mueve los contadores a Memorystore/Redis.

---

## 7) Verificación post-deploy

Ejecuta esta lista después del despliegue:

1. [ ] Abrir la app anónima (sin login) e intentar leer `config/serverSecrets`
   desde la consola del navegador → debe dar `permission-denied`.
2. [ ] Subir una imagen a `list-images/UNA_LISTA_QUE_NO_ES_MIA/...` desde un
   usuario normal → debe dar `unauthorized`.
3. [ ] Probar `/place/...` en la app y verificar que la búsqueda cercana
   de Google sigue funcionando.
4. [ ] Ejecutar una función admin (p.ej. tab "Mantenimiento" de DeveloperPage)
   como usuario NO jefe → debe fallar.
5. [ ] Comprobar en Firestore que aparecen documentos en `rateLimits/` tras
   navegar un rato.
6. [ ] Comprobar en Firestore que las acciones admin empiezan a dejar
   entradas en `adminAuditLog/` (las iré añadiendo progresivamente).

---

## 8) Siguientes pasos en seguridad (pendientes, no en este commit)

- **Roles granulares**: `moderator` / `admin` / `superadmin` en lugar de un
  único `jefe` monolítico.
- **Audit logging completo**: envolver todos los `admin*` onCall con
  `writeAuditLog(...)` antes de retornar.
- **CAPTCHA/app check**: App Check de Firebase para diferenciar tráfico
  legítimo de bots en endpoints expuestos (HTTP onRequest).
- **Cifrado de mensajes de chat** (mejora RGPD para datos privados).

Todo esto está registrado en `Mejoras/mejoras-pendientes.md`.

---

## 9) Activar Sentry (opcional)

1. Crea un proyecto en https://sentry.io (plataforma: **React**).
2. Copia el DSN que Sentry te muestra al crear el proyecto
   (formato `https://<key>@o<org>.ingest.sentry.io/<id>`).
3. Añade la variable en tu archivo `.env` local (o en el panel de CI/hosting):
   ```
   VITE_SENTRY_DSN=https://...
   ```
4. Reconstruye la app (`npm run build`). Sin la variable, Sentry permanece
   completamente desactivado y no genera ningún error ni petición de red.
