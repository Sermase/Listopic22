# Guía de configuración de seguridad — Listopic

Esta guía acompaña al commit "chore(cleanup+security): ..." y recoge todos los
pasos manuales que tú tienes que hacer en Google Cloud / Firebase para que las
reglas, rate-limits y secretos entren en vigor correctamente.

Hazlos en el orden indicado.

---

## 0) Checklist rápida

| Paso | Qué hace | Urgencia | Tiempo |
|-----|----------|----------|--------|
| 1 | **Rotar la Google Places API key** | 🔴 URGENTE (la anterior estuvo expuesta) | 5 min |
| 2 | Registrar la clave nueva en **Secret Manager** | 🔴 | 2 min |
| 3 | Desplegar las nuevas reglas de Firestore y Storage | 🔴 | 3 min |
| 4 | Desplegar Cloud Functions con los cambios | 🔴 | 8 min (build) |
| 5 | Asignar custom claim `admin=true` a las cuentas `jefe` | 🟡 (mejora rendimiento de Storage rules) | 5 min |
| 6 | Borrar el campo legacy en Firestore | 🟡 | 1 min |
| 7 | Restringir la nueva API key a tus dominios/bundles | 🟡 | 3 min |

**Tiempo total estimado**: 30-40 min si todo va bien.

---

## Pre-requisitos (haz esto ANTES de empezar)

Desde la raíz del repo (`/home/user/Listopic22`):

```bash
# 1. Comprueba que tienes el CLI de Firebase v13 o superior
firebase --version

# 2. Comprueba que estás logueado en la cuenta correcta
firebase login:list

# 3. Comprueba que estás apuntando al proyecto correcto
firebase projects:list
firebase use --add   # si no está seleccionado "listopic"

# 4. Comprueba que gcloud está instalado (lo usaremos para el claim admin)
gcloud --version || echo "INSTALAR: https://cloud.google.com/sdk/docs/install"

# 5. Asegúrate de estar en la rama con los cambios
git checkout claude/code-review-analysis-DQFrd
git pull origin claude/code-review-analysis-DQFrd
```

Si algún comando falla, arréglalo antes de seguir.

---

## 1) Rotar la Google Places API key

La clave antigua (`config/serverSecrets.googlePlacesApiKey` en Firestore)
**estuvo legible por cualquier usuario anónimo** por culpa de la regla
`allow read: if true` en `config/{configId}`. Debes considerarla comprometida.

### 1a) Crear la nueva clave en Google Cloud Console

1. Abre: https://console.cloud.google.com/apis/credentials?project=listopic
   (sustituye `listopic` por el ID real de tu proyecto si es distinto).
2. Busca en la tabla la API key que usa Google Places / Geocoding. Debería
   llamarse algo como **"Server key"** o **"Places API key"**. Si no
   distingues cuál es, pincha en cada una y mira la sección **"API restrictions"**:
   la buena tendrá Places/Geocoding.
3. Dos opciones:
   - **Recomendado**: crea una nueva → botón **"+ CREATE CREDENTIALS" → "API key"**.
     Luego borra la antigua (**"DELETE"**) para que no se pueda volver a usar.
   - Alternativa rápida: clic en la clave → **"REGENERATE KEY"**. (Nota: esto
     invalida la antigua inmediatamente.)
4. **COPIA el valor de la nueva clave ahora mismo** (empieza por `AIza...`).
   La guardarás en un `.txt` temporal o mejor en Secret Manager en el siguiente paso.

### 1b) Restringir la clave (hazlo YA, no lo dejes para luego)

Todavía en Cloud Console → clic en la clave nueva → **"EDIT API KEY"**:

- **Application restrictions** → marca **"HTTP referrers (web sites)"** y añade:
  ```
  https://listopic.es/*
  https://*.listopic.es/*
  https://listopic.web.app/*
  https://listopic.firebaseapp.com/*
  http://localhost:5173/*
  http://localhost:3000/*
  ```
  (Ajusta a tus dominios reales. Los `localhost` son para desarrollo.)

- **API restrictions** → marca **"Restrict key"** y selecciona SOLO:
  - Places API
  - Geocoding API
  - Maps JavaScript API
  - (opcional) Places API (New) si migras a la v2

- **SAVE**.

### 1c) Verificación

```bash
# Prueba que la clave nueva funciona desde curl (sustituye YOUR_NEW_KEY):
curl "https://maps.googleapis.com/maps/api/geocode/json?address=Madrid&key=YOUR_NEW_KEY"
```
Debe devolver `"status": "OK"` y un resultado. Si dice `REQUEST_DENIED` revisa
las restricciones.

---

## 2) Registrar la clave en Secret Manager

Desde la raíz del repo:

```bash
firebase functions:secrets:set GOOGLE_PLACES_API_KEY
```

Te pedirá **"Enter a value for GOOGLE_PLACES_API_KEY"**. Pega la clave nueva
(no se verá mientras escribes — es normal). Pulsa Enter.

La salida será algo como:
```
✔ Created a new secret version projects/<PROJECT>/secrets/GOOGLE_PLACES_API_KEY/versions/1
```

### Verificación

```bash
firebase functions:secrets:access GOOGLE_PLACES_API_KEY
```
Debe devolver el valor completo. Si no, algo falló: revisa que `firebase login`
tenga permisos de **"Secret Manager Admin"**.

---

## 3) Desplegar reglas e índices

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

**Qué esperar:**
- Firestore rules → `✔ Deploy complete!` en ~10 s.
- Firestore indexes → puede tardar **5-15 min** construyéndose en background.
  El comando vuelve antes; puedes comprobar estado en:
  https://console.firebase.google.com/project/listopic/firestore/indexes
- Storage rules → `✔ Deploy complete!` en ~5 s.

**Si falla** con `Invalid argument` en reglas, es un typo del commit. Pégame
el error y lo arreglo. No uses `--force`.

---

## 4) Desplegar Cloud Functions

```bash
firebase deploy --only functions
```

**Qué esperar:**
- Compilación local primero (~1 min).
- Preguntará **"Allow functions to access GOOGLE_PLACES_API_KEY? (y/N)"** → responde **`y`**.
  Te lo preguntará una sola vez (o una por función si es la primera). Si ya
  tienes otras secrets enlazadas, solo pedirá las nuevas.
- Despliegue 7-10 min según cuántas funciones cambien.

**Si falla el build** (`TypeError` o módulo no encontrado), lo más probable es
que `node_modules` en `functions/` esté desactualizado:
```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

**Si una función concreta falla** al desplegar (p.ej. `placesNearbyRestaurants`
por timeout de cold start), redéspliega solo esa:
```bash
firebase deploy --only functions:placesNearbyRestaurants
```

---

## 5) Custom claim `admin` a las cuentas jefe

Esto es **opcional pero muy recomendado**: sin el claim, cada escritura en
Storage hace una lectura extra de Firestore. Con él, se resuelve todo en el token.

### 5a) Obtener el UID de tu cuenta jefe

Abre https://console.firebase.google.com/project/listopic/authentication/users
y localiza tu usuario. Copia el **UID** (formato tipo `abc123XYZ...`).

### 5b) Asignar el claim

**Opción recomendada — gcloud + Node inline** (sin service account key en disco):

```bash
# Paso 1: autenticarse con credenciales de aplicación (una sola vez por máquina)
gcloud auth application-default login

# Paso 2: script one-off (cambia el UID)
cd /home/user/Listopic22/functions
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
(async () => {
  const uid = 'PEGA_AQUI_EL_UID_JEFE';
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  const u = await admin.auth().getUser(uid);
  console.log('✔ Claims actualizados para', u.email || u.uid, '→', u.customClaims);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"
```

**Opción alternativa con service account key** (si prefieres):
1. Genera una service account key en https://console.cloud.google.com/iam-admin/serviceaccounts
   → selecciona la cuenta **firebase-adminsdk** → **"KEYS" → "ADD KEY" → "JSON"**.
2. Guárdala FUERA del repo (p.ej. `~/listopic-admin-key.json`) y añade a tu
   `.bashrc`/`.zshrc`:
   ```
   export GOOGLE_APPLICATION_CREDENTIALS=~/listopic-admin-key.json
   ```
3. Ejecuta el mismo script node del paso anterior.
4. **Elimina la key** cuando termines (riesgo de fuga).

### 5c) Activarlo en el cliente

⚠️ **El usuario afectado tiene que hacer logout + login** para que el nuevo
token llegue al navegador. El token se refresca automáticamente cada hora, pero
forzarlo es más rápido.

### 5d) Verificación

Desde la consola del navegador estando logueado como jefe:
```js
firebase.auth().currentUser.getIdTokenResult().then(r => console.log(r.claims))
```
Debe mostrar `{ admin: true, ... }`.

---

## 6) Borrar el secreto legacy de Firestore

Solo cuando hayas verificado que Cloud Functions usa Secret Manager:

```bash
# 6a) Probar que una función de geocoding sigue funcionando desde la app.
# Abre la app, busca un sitio, etc. Revisa logs:
firebase functions:log --only reverseGeocode | head -20
```
Debe aparecer el resultado de la búsqueda. Si en los logs ves:
```
getGooglePlacesApiKey: usando valor LEGACY en Firestore
```
significa que Secret Manager no se enlazó bien — revisa el paso 4 antes de borrar nada.

Una vez OK:

```bash
# 6b) Borrar el documento entero si NO tiene nada más útil:
firebase firestore:delete config/serverSecrets
# (te preguntará confirmación, responde 'y')
```

Si el doc tiene más campos que necesitas conservar, hazlo en la consola web:
Firebase Console → Firestore → `config/serverSecrets` → borra SOLO el campo
`googlePlacesApiKey`.

---

## 7) Restricciones adicionales de API keys (también la de Firebase Web)

La clave que ves en `frontend/src/firebase.ts` (formato `AIza...`) es **pública
por diseño** — el Firebase Web SDK la necesita. Pero conviene restringirla:

1. https://console.cloud.google.com/apis/credentials?project=listopic
2. Localiza la "Browser key (auto created by Firebase)".
3. **"EDIT API KEY"** → **Application restrictions** → **HTTP referrers**:
   mismos dominios que en 1b.
4. **API restrictions** → SOLO las APIs que el web SDK necesita:
   Firebase Installations API, Identity Toolkit API, Token Service API,
   Cloud Firestore API, Firebase Dynamic Links API, Firebase Cloud Messaging API.
5. SAVE.

---

## 8) Rate-limits que ahora están activos

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

## 9) Verificación post-deploy (checklist final)

Hazlo justo después de terminar los pasos 1-7:

- [ ] **Secrets**: `firebase functions:secrets:access GOOGLE_PLACES_API_KEY` devuelve la key nueva.
- [ ] **Rules deployed**: en https://console.firebase.google.com/project/listopic/firestore/rules
  ves las reglas nuevas (fecha de publicación reciente).
- [ ] **Config bloqueado**: abre la app en modo incógnito (sin login) y ejecuta en consola:
  ```js
  firebase.firestore().doc('config/serverSecrets').get().catch(e => console.log('OK bloqueado:', e.code))
  ```
  Debe imprimir `OK bloqueado: permission-denied`.
- [ ] **Storage IDOR bloqueado**: como usuario normal, intenta subir una imagen a
  `list-images/ID_DE_LISTA_QUE_NO_ES_TUYA/test.png`. Debe fallar con `unauthorized`.
- [ ] **Places funciona**: busca un sitio en la app, confirma que aparecen resultados.
- [ ] **Admin funciona** como jefe: abre `/developer`, comprueba que puedes entrar.
- [ ] **Admin bloqueado** como NO jefe: loguéate con una cuenta normal, ve a `/developer`
  → debe mostrar "No autorizado" o redirigir.
- [ ] **Rate-limits registran**: después de usar la app un rato, mira
  `rateLimits/` en Firestore y deberías ver documentos con `count` > 0.
- [ ] **Audit log**: ejecuta una acción admin (p.ej. recalcular una lista) y comprueba
  que aparece en la colección `adminAuditLog/` con `actorUid` y `action`.
- [ ] **No hay regresiones**: navegación general, login, crear reseña, subir foto — todo
  sigue funcionando.

---

## 10) Troubleshooting común

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Failed to load the GOOGLE_PLACES_API_KEY secret` en logs | Función desplegada sin enlazar secret | Redéspliega con `firebase deploy --only functions:NOMBRE` y responde `y` al prompt |
| `getGooglePlacesApiKey: usando valor LEGACY` en logs | Secret Manager no se está leyendo | Revisa que la función tiene `secrets: [GOOGLE_PLACES_API_KEY]` en su `onCall({...})` |
| `permission-denied` al escribir en Storage siendo jefe | El custom claim no se propagó | Logout + login para refrescar token |
| `ReferenceError: writeAuditLog is not defined` | Deploy antiguo en caché | `firebase deploy --only functions --force` |
| La app deja de buscar sitios tras el deploy | La API key nueva aún no tiene Places API habilitada | Cloud Console → APIs & Services → Library → **Enable** Places API |
| `REQUEST_DENIED` desde curl con la key nueva | HTTP referrer restrictions bloquean `curl` | Normal: desde curl no hay referrer. Usa `--referer https://listopic.es` |
| CI de GitHub Actions rompe tras deploy | Service account sin `Secret Manager Secret Accessor` | IAM → añade role al SA usado por CI |

---

## 11) Siguientes pasos en seguridad (pendientes, no en este commit)

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
