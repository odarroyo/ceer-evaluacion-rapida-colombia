import Image from "next/image";
import { getOperatorBranding } from "@/lib/branding";

type IconProps = { className?: string };

export function MarkIcon({ className }: IconProps) {
  const branding = getOperatorBranding();
  return (
    <Image
      className={className}
      src={branding.operatorLogoPath}
      alt={`Identidad visual de ${branding.operatorName}`}
      width={240}
      height={72}
      priority
      unoptimized
    />
  );
}

export function PlusIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function SearchIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

export function ClipboardIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-2M8 3h8v4H8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;
}

export function AdminIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V9h12v11M9 9V5h6v4M9 13h2m2 0h2m-6 4h2m2 0h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
