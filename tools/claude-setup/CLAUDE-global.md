# Reglas globales de Ser (todas las apps IstariCore)

> Copiar en `~/.claude/CLAUDE.md`. Se aplica a TODOS los proyectos.
> Lo específico de cada app va en el `CLAUDE.md` de su repo.

## Cómo trabajamos
1. Inspecciona el código y la arquitectura antes de tocar nada.
2. Propón un plan corto con los archivos afectados y espera aprobación si el cambio es grande.
3. Implementa por pasos pequeños.
4. Verifica: `tsc --noEmit`, tests y `npm run build`.
5. Si hay interfaz, ábrela con Playwright (móvil y escritorio) y revisa la consola.
6. Informa en breve: qué cambió, qué queda pendiente, qué riesgos hay.

No digas "terminado" solo porque compila.

## Seguridad (innegociable)
- Nunca desplegar ni tocar reglas de Firebase de producción sin permiso explícito, salvo que el `CLAUDE.md` del proyecto lo autorice (Listopic lo hace, con condiciones).
- Nunca borrar datos de producción sin aprobación.
- Las pruebas usan el emulador de Firebase o una cuenta de test, nunca usuarios reales.
- Nunca subir secretos (`.env`, claves de API) al repo.
- Preguntar antes de cualquier operación destructiva o de actualizar dependencias mayores.
- Conservar las funcionalidades existentes.

## Stack por defecto (apps web NUEVAS)
- React + Vite + TypeScript, npm.
- Tailwind 4 + shadcn/ui como base de componentes.
- Motion (`motion/react`) para transiciones y microinteracciones.
- Iconos Lucide.
- Firebase, con la cuenta IstariCore compartida entre apps (un login, datos separados por app).
- E2E con Playwright contra los emuladores de Firebase (el modelo es `e2e/` de Listopic).
- Pensar en móvil primero (Capacitor si va a tienda).

En apps que ya existen, manda su sistema actual: extiéndelo en vez de meter otro encima.
No añadas librerías nuevas sin justificar qué problema resuelven.

## Diseño (cuando haya frontend)
Referencia: Apple, Stripe, Linear, Raycast. Producto comercial, no prototipo.

Prioriza:
- Tipografía cuidada y jerarquía clara.
- Espaciado generoso y consistente (tokens, no valores sueltos).
- Color sobrio, buen contraste, profundidad sutil.
- Animaciones cortas y con propósito (150–300 ms), respetando `prefers-reduced-motion`.
- Estados vacíos, de carga y de error diseñados, no olvidados.

Evita:
- La estética genérica de "app hecha por IA".
- Degradados y glassmorphism por defecto.
- Animaciones continuas o decorativas sin función.
- Dashboards sobrecargados.

Magic UI y similares: solo puntualmente y cuando aporten (un contador en estadísticas, sí; un botón de guardar con efectos, no).

## Código
- Simple y mantenible antes que elegante. Nada de sobreingeniería.
- Reutiliza componentes existentes antes de crear nuevos.
- Comentarios mínimos.
- Consulta documentación actual (Context7) antes de usar APIs de librerías que cambian a menudo.
