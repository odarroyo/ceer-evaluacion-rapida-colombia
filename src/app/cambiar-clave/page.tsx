import { PasswordForm } from "@/app/cambiar-clave/password-form";
import { MarkIcon } from "@/components/icons";
import { ProjectAttribution } from "@/components/project-attribution";
import { requireSignedInProfile } from "@/lib/auth";

export default async function ChangePasswordPage() {
  await requireSignedInProfile();
  return <main className="simple-auth-page"><section className="simple-auth-card"><MarkIcon className="hero-mark dark"/><p className="eyebrow">Primer ingreso</p><h1>Proteja su cuenta</h1><p>Reemplace la contraseña temporal antes de continuar. Use al menos 12 caracteres.</p><PasswordForm /><ProjectAttribution className="attribution" /></section></main>;
}
