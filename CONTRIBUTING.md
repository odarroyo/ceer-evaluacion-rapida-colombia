# Contribuir

Gracias por mejorar Evaluación Rápida CEER para Colombia. Las personas externas
deben trabajar desde un fork, crear una rama enfocada y abrir un pull request
contra `main`.

## Antes de abrir un pull request

1. Use solo datos sintéticos. Nunca confirme cuentas, inspecciones, fotografías,
   coordenadas, contactos, credenciales, referencias de proveedores, evidencia
   diligenciada o marcas institucionales.
2. No copie, traduzca ni adapte formularios o publicaciones ATC. La referencia
   ATC-20 se limita al contexto metodológico descrito en
   `THIRD_PARTY_NOTICES`.
3. Conserve los avisos `Required Notice:` de `ATTRIBUTION.md` e identifique las
   versiones modificadas sin sugerir respaldo.
4. Agregue o actualice pruebas para comportamiento, autorización y migraciones.
5. Ejecute:

   ```bash
   npm ci --legacy-peer-deps
   npm run publication:verify
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

6. Con Docker disponible, ejecute también `npx supabase db reset` y
   `npx supabase test db`.

Las contribuciones se envían bajo PolyForm Noncommercial License 1.0.0. Al abrir
un pull request, confirma que puede aportar el cambio bajo esos términos. Las
vulnerabilidades deben reportarse de forma privada según `SECURITY.md`, nunca en
un issue público.
