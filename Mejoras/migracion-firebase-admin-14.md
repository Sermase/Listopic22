# Migración a firebase-admin 14 y firebase-functions 7.4 (02/10/2026)

| Paquete | Antes (lock) | Ahora |
|---|---|---|
| `firebase-admin` | 13.10.0 | **14.5.0** |
| `firebase-functions` | 7.2.5 | **7.4.0** |
| Node (`engines`) | 22 | 22 (la v14 exige ≥ 22) |

Commits:
- `e1ae1d3`: dependencias y código de `modules/`;
- el siguiente de cierre: `index.js`, scripts, guarda de tests.

Ninguno de los dos mezcla cambios de producto.

## Cambios de ruptura y cómo se han adaptado

Fuente: [notas de versión del Admin SDK](https://firebase.google.com/support/release-notes/admin/node).

| # | Cambio (versión) | ¿Nos afecta? | Adaptación |
|---|---|---|---|
| 1 | **Se elimina la API con espacio de nombres** (14.0): `admin.firestore()`, `admin.auth()`, `admin.storage()`, `admin.messaging()` y `admin.firestore.FieldValue/FieldPath/Timestamp/GeoPoint` pasan a ser `undefined`. La raíz `firebase-admin` solo exporta la parte de «app». | **Sí**: 11 módulos y 10 scripts. | Imports modulares: `getFirestore`, `FieldValue`, `FieldPath`, `Timestamp` y `GeoPoint` de `firebase-admin/firestore`; `getAuth` de `/auth`; `getStorage` de `/storage`; `getMessaging` de `/messaging`; `initializeApp` de `/app`. También en `test_fcm.js`, que estaba roto con la v14. |
| 2 | **Node 18 y 20 sin soporte** (14.0). | Ya estábamos en 22. | Ninguna. |
| 3 | **Se elimina la API Instance ID** (14.0). | No se usaba. | — |
| 4 | **FCM: se eliminan los tipos** `MessagingPayload`, `MessagingOptions`, `DataMessagePayload` y `NotificationMessagePayload` (14.0). | No: solo usamos `sendEachForMulticast`. | — |
| 5 | **Errores rehechos en todo el SDK** (14.0). | Podía romper en silencio la limpieza de tokens FCM caducados (`error.code === "messaging/registration-token-not-registered"`) y el `auth/uid-already-exists` del E2E. | Comprobado contra el SDK instalado: los dos códigos se mantienen. |
| 6 | **FCM:** `token` y `MulticastMessage` pasan a obsoletos (14.1). Siguen funcionando. | Avisos, sin ruptura. | — |
| 7 | **FCM:** la suscripción a temas pasa a la API v1 (14.5). | No usamos temas. | — |
| 8 | `firebase-functions` 7.2.5 → 7.4.0. | Sin rupturas; admite `firebase-admin ^14`. | Se quita un `require("firebase-functions")` raíz (API v1) que no se usaba en `algolia.js`. |

**Guarda:** `functions/test/admin-modular.test.js` falla si vuelve a aparecer `admin.firestore()`, `require('firebase-admin')` o `firebase-functions` v1 en cualquier fichero de `functions/`.

## Verificación (02/10/2026)

- **Carga en el emulador:** las 119 Functions exportadas (71 callables, 36 de Firestore, 8 HTTP y 4 programadas).
  - 115 se inicializan.
  - Las 4 programadas se omiten porque no hay emulador de Pub/Sub. Por eso sus manejadores se ejecutaron aparte, contra Firestore y Storage, y salieron ✅: `expireManualPlans`, `cleanupAnalyticsMarkers`, `refreshStalePlacePhotos` y `weeklyFirestoreBackup` (que deja la copia en Storage).
  - 0 `TypeError` / `ReferenceError` / `is not a function` en los logs.
- **Tests:**

  | Suite | Resultado |
  |---|---|
  | Functions | 107/107 (con la guarda) |
  | Reglas | 61/61 |
  | Web | 215/215 |
  | E2E | 15/15 (siembra y reindexa con las Functions reales) |
  | Lint de Functions | 12 avisos (antes 13) |

- **Smoke (19/19)** de lo que toca cada API:

  | API | Probado |
  |---|---|
  | **Auth** | `verifyIdToken` (HTTP `groupedReviews`); `getUser` + `setCustomUserClaims` (`adminProvisionJefeClaim`, claim escrito); `assertJefeAccess` deniega a un no-jefe; `deleteUser` (`deleteOwnAccount`, y la cuenta ya no existe: `auth/user-not-found`). |
  | **Firestore** | `FieldValue` (seguir usuario y Lista, reporte, contadores), `FieldPath.documentId` (reindexado de Algolia y `groupedReviews`), `Timestamp` (plan Business), transacción + `increment` (chat), triggers de valoración (gamificación y contadores de Lista). |
  | **Storage** | `adminExportFirestoreBackup` escribe el JSON y se vuelve a leer; copia semanal; scripts de portadas y caché. |
  | **Messaging** | Seguir a alguien dispara `sendEachForMulticast` y se procesa su respuesta. El envío falla, como se espera: token falso y el emulador no tiene FCM. |
  | **Scripts** | Los 10 de `functions/scripts/` y `test_fcm.js` contra el emulador. |

## `npm audit` (functions)

Quedan 2 moderadas, ninguna alta ni crítica. Son la misma: `uuid@9.0.1` (GHSA-w5hq-g745-h8pq), a través de `firebase-admin → @google-cloud/storage@8.2.0 → gaxios@6.7.1`.
- **No hay arreglo compatible.** `@google-cloud/storage` 8.2.0 es la última y exige `gaxios ^6`; `gaxios` 6.7.1 es la última 6.x y exige `uuid ^9`. El «fix available» de npm no cambia nada (probado con `--dry-run`).
- **No es explotable aquí.** El fallo está en `uuid` v3/v5/v6 con el parámetro `buf`, y `gaxios` solo llama a `uuid.v4()` sin `buf`.
- Se cerrará cuando `@google-cloud/storage` pase a `gaxios` 7. No se fuerza un `overrides` contra el rango que declara la librería.

## Rollback si algo falla en producción

El código modular **también funciona con firebase-admin 13**: probado en una copia con 13.10.0, la del lock anterior; 107/107 tests y las 119 Functions cargan. Volver atrás es cambiar solo dependencias, sin tocar código:

```
git checkout e1ae1d3^ -- functions/package.json functions/package-lock.json
cd functions && npm ci && npm test
firebase deploy --only functions --project listopic
```

Después, `git commit` de esos dos archivos. Avisos:
- El commit `e5c1ce9` (parches de seguridad) queda dentro del rollback: `e1ae1d3^` es justo ese commit, así que no se pierde.
- **Emergencia para una sola Function**, sin desplegar: consola de Cloud Run → servicio de esa Function → «Gestionar tráfico» → 100 % a la revisión anterior. El siguiente `firebase deploy` lo vuelve a sobrescribir.
- **Qué vigilar tras desplegar** (Logs de Functions, primeras horas):
  - `is not a function` / `Cannot read properties of undefined`;
  - `Error sending FCM push`: lo normal es que no aparezca, salvo con tokens caducados;
  - fallos de `adminExportFirestoreBackup` o `weeklyFirestoreBackup` (lunes 04:00).
