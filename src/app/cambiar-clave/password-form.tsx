"use client";

import { useActionState } from "react";
import { changeInitialPassword } from "@/app/cambiar-clave/actions";

export function PasswordForm() {
  const initialState: { error?: string } = {};
  const [state, action, pending] = useActionState(changeInitialPassword, initialState);
  return <form action={action} className="auth-form">
    <label>Nueva contraseña<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label>
    <label>Confirmar contraseña<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="button button-primary button-wide" disabled={pending}>{pending ? "Guardando…" : "Activar mi cuenta"}</button>
  </form>;
}
