import type { Metadata, Viewport } from "next";
import { getOperatorBranding } from "@/lib/branding";
import { getAppMode } from "@/lib/environment";
import "./globals.css";

const branding = getOperatorBranding();

export const metadata: Metadata = {
  title: { default: `Evaluación CEER · ${branding.operatorName}`, template: `%s · Evaluación CEER · ${branding.operatorShortName}` },
  description: "Evaluación rápida de seguridad de edificaciones post-sismo.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3d4b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = getAppMode();
  return <html lang="es"><body>{mode === "staging" && <div className="staging-banner" role="status"><strong>Ambiente de pruebas</strong><span>Solo datos sintéticos</span></div>}{children}</body></html>;
}
