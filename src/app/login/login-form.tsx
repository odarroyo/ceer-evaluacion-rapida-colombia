"use client";

import { useActionState } from "react";
import { login } from "@/app/login/actions";

export function LoginForm({ demo }: { demo: boolean }) {
  const initialState: { error?: string } = {};
  const [state, action, pending] = useActionState(login, initialState);
  return (
    <form action={action} className="auth-form">
      {demo && <div className="demo-banner"><strong>Modo demostración</strong><span>No usa datos reales ni requiere credenciales.</span></div>}
      <label>Correo institucional<input name="email" type="email" autoComplete="username" defaultValue={demo ? "inspector@demo.local" : ""} required={!demo} /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" defaultValue={demo ? "demostracion" : ""} required={!demo} /></label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button button-primary button-wide" disabled={pending}>{pending ? "Ingresando…" : demo ? "Entrar a la demostración" : "Ingresar"}</button>
      <p className="auth-help">Las cuentas son creadas por coordinación. Si no puede ingresar, contacte a su coordinador.</p>
    </form>
  );
}
