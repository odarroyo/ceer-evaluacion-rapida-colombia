import Link from "next/link";
import type { ReactNode } from "react";
import type { CurrentProfile } from "@/lib/auth";
import { getOperatorBranding } from "@/lib/branding";
import { AdminIcon, ClipboardIcon, MarkIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { ProjectAttribution } from "@/components/project-attribution";
import { logout } from "@/app/login/actions";

export function AppShell({ profile, children }: { profile: CurrentProfile; children: ReactNode }) {
  const coordinator = profile.role !== "inspector";
  const branding = getOperatorBranding();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/mis-inspecciones" className="brand" aria-label={`Inicio Evaluación CEER · ${branding.operatorName}`}>
          <MarkIcon className="brand-mark" />
          <span><strong>Evaluación CEER</strong><small>{branding.operatorShortName}</small></span>
        </Link>
        <div className="profile-chip">
          <span className="avatar" aria-hidden="true">{profile.fullName.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span>
          <span className="profile-copy"><strong>{profile.fullName}</strong><small>{profile.affiliation}</small></span>
          <form action={logout}><button className="text-button" type="submit">Salir</button></form>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Navegación principal">
          <Link href="/mis-inspecciones"><ClipboardIcon /> Mis inspecciones</Link>
          <Link href="/inspecciones/nueva"><PlusIcon /> Nueva evaluación</Link>
          <Link href="/edificios"><SearchIcon /> Buscar edificación</Link>
          {coordinator && <Link href="/coordinacion"><AdminIcon /> Coordinación</Link>}
          <div className="sidebar-note"><strong>Instrumento de decisión rápida</strong><span>No sustituye un dictamen estructural detallado.</span></div>
        </aside>
        <main className="main-content">
          {children}
          <ProjectAttribution className="app-credits" />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        <Link href="/mis-inspecciones"><ClipboardIcon /><span>Inspecciones</span></Link>
        <Link href="/inspecciones/nueva" className="primary-nav"><span><PlusIcon /></span><em>Nueva</em></Link>
        <Link href="/edificios"><SearchIcon /><span>Edificios</span></Link>
      </nav>
    </div>
  );
}
