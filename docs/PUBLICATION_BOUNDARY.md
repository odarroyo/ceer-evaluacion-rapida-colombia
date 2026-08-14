# Publicación por lista permitida

La copia pública se construye únicamente con archivos versionados dentro de estos límites:

- metadatos y documentación general en la raíz;
- `.github/`, `docs/`, `public/`, `scripts/`, `src/`, `supabase/`, `test-fixtures/` y `tests/`;
- `.env.example` como único archivo de variables de entorno;
- recursos sintéticos diseñados expresamente para pruebas.

Quedan fuera los entornos reales, `.env*`, referencias de proyectos, `.vercel`, `supabase/.temp`, logos institucionales, certificados, respaldos, salidas, cachés, evidencia operativa diligenciada, rutas locales y cualquier formulario o plantilla derivada de ATC. La imagen de prueba incluida es sintética y no contiene datos de campo.

`npm run publication:verify` comprueba los nombres versionados, busca marcadores privados conocidos y rechaza artefactos de formulario ATC antes de cada publicación. Este control complementa, pero no reemplaza, el análisis completo de secretos con Gitleaks ni la revisión humana de derechos.
