import { MarkIcon } from "@/components/icons";
import { LoginForm } from "@/app/login/login-form";
import { isSupabaseConfigured } from "@/lib/environment";
import { getOperatorBranding } from "@/lib/branding";
import { ProjectAttribution } from "@/components/project-attribution";

export default function LoginPage() {
  const branding = getOperatorBranding();
  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <MarkIcon className="hero-mark" />
          <p className="eyebrow light">{branding.operatorName}</p>
          <h1>Evaluación post-sismo, clara y trazable.</h1>
          <p>Instrumento digital CEER para documentar observaciones y priorizar decisiones rápidas en campo.</p>
          <div className="hero-tags"><span>Rápido</span><span>Seguro</span><span>Auditable</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Acceso de personal autorizado</p>
          <h2>Bienvenido</h2>
          <p>Ingrese con la cuenta asignada por coordinación.</p>
          <LoginForm demo={!isSupabaseConfigured()} />
        </div>
        <ProjectAttribution className="attribution" />
      </section>
    </main>
  );
}
