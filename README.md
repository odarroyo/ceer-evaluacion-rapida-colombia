# Evaluación Rápida CEER para Colombia

Aplicación web institucionalmente neutral desarrollada originalmente por CEER
para documentar evaluaciones rápidas de edificaciones después de un sismo.

Repositorio original:
[`ceer-evaluacion-rapida-colombia`](https://github.com/odarroyo/ceer-evaluacion-rapida-colombia).

La metodología tiene como referencia conceptual los procedimientos ATC-20 del
Applied Technology Council. La interfaz y el instrumento digital son una obra
CEER: no reproducen ni sustituyen los formularios oficiales ATC-20.

## Capacidades

- Autenticación nominal con Supabase y cambio forzado de contraseña temporal.
- Historial por inspector y directorio sanitizado de edificaciones.
- Priorización calculada en el servidor y cambios justificados y auditados.
- Ubicación GPS o referencia manual y hasta cinco fotografías comprimidas sin EXIF.
- Reintentos idempotentes, detección de duplicados e importación/exportación XLSX.
- Administración auditada de cuentas y contraseñas temporales de reemplazo.
- RLS de PostgreSQL y Storage, instantáneas inmutables y respaldo cifrado de fotos.

El piloto es en línea. No promete sincronización PWA ni operación desconectada.
El repositorio no distribuye un formulario o plantilla ATC-20. Cada institución
debe diseñar y revisar jurídicamente cualquier libro de importación que utilice.

## Desarrollo local

Se recomienda Node.js 22 o posterior.

```bash
npm ci --legacy-peer-deps
npm run dev
```

Sin valores de Supabase, la aplicación funciona en modo de demostración no
persistente. Para staging, copie `.env.example` a `.env.local` —que está
ignorado— y use únicamente datos sintéticos. La configuración parcial se rechaza
con HTTP 503.

Las pruebas opcionales en dispositivos confiables pueden ejecutarse con
`npm run dev:lan` o `npm run dev:mobile:tunnel`. El uso normal de staging debe
hacerse sobre la dirección HTTPS persistente descrita en `docs/STAGING.md`.

## Adopción institucional y marca del operador

El proyecto no está vinculado a una agencia operadora. Las organizaciones y los
usos permitidos se definen en la licencia PolyForm Noncommercial 1.0.0. Entre
ellos están instituciones educativas, de investigación pública, seguridad o
salud pública, ambientales, benéficas y gubernamentales, independientemente de
su fuente de financiación.

Una implementación autorizada puede configurar:

```dotenv
NEXT_PUBLIC_OPERATOR_NAME=Entidad operadora
NEXT_PUBLIC_OPERATOR_SHORT_NAME=Operador
NEXT_PUBLIC_OPERATOR_LOGO_PATH=/branding/operador.svg
```

La identidad operadora no reemplaza la autoría CEER ni implica respaldo de CEER
o del Applied Technology Council. Deben conservarse los avisos de
`ATTRIBUTION.md`; las modificaciones deben identificarse como tales.

## Verificación

```bash
npm run publication:verify
npm run lint
npm run typecheck
npm test
npm run build
```

Con Docker disponible:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Consulte `docs/ACCEPTANCE.md`, `docs/PUBLICATION_BOUNDARY.md` y
`CONTRIBUTING.md` antes de proponer o publicar cambios.

## Licencia y derechos de terceros

El software original de CEER se ofrece bajo PolyForm Noncommercial 1.0.0; vea
`LICENSE`, `NOTICE` y `ATTRIBUTION.md`. Es código fuente disponible y modificable
para los fines permitidos, pero no es una licencia de código abierto aprobada
por OSI porque limita los usos comerciales.

La licencia CEER no concede derechos sobre formularios, publicaciones, nombres
o marcas del Applied Technology Council, datos gubernamentales, marcas de
instituciones operadoras ni dependencias de terceros. Vea
`THIRD_PARTY_NOTICES` y `docs/RIGHTS_CHECKLIST.md`.

Nunca confirme la visibilidad pública de una historia Git que contenga
plantillas ATC eliminadas, secretos, datos de staging, fotografías, respaldos,
evidencia operativa o identificadores de proyectos de proveedores.
