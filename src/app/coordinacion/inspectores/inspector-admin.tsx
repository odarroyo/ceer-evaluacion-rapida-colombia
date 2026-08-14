"use client";

import { useCallback, useEffect, useState } from "react";

type Role = "inspector" | "coordinator" | "super_admin";
type Created = { email: string; fullName: string; temporaryPassword: string };
type Account = {
  id: string;
  email: string;
  fullName: string;
  affiliation: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};
type Result = {
  created?: Created[];
  error?: string;
  report?: Array<{ row: number; column: string; message: string }>;
};

const roleLabels: Record<Role, string> = {
  inspector: "Inspector",
  coordinator: "Coordinación",
  super_admin: "Superadministración",
};

export function InspectorAdmin({ currentUserId, actorRole }: { currentUserId: string; actorRole: Role }) {
  const [busy, setBusy] = useState<string>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [result, setResult] = useState<Result>();

  const loadAccounts = useCallback(async () => {
    const response = await fetch("/api/admin/inspectors", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No fue posible listar las cuentas.");
    setAccounts(payload.accounts);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/inspectors", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No fue posible listar las cuentas.");
        return payload.accounts as Account[];
      })
      .then((loadedAccounts) => setAccounts(loadedAccounts))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({ error: error instanceof Error ? error.message : "No fue posible listar las cuentas." });
        }
      });
    return () => controller.abort();
  }, []);

  async function submit(form: HTMLFormElement) {
    setBusy("create");
    setResult(undefined);
    try {
      const response = await fetch("/api/admin/inspectors", { method: "POST", body: new FormData(form) });
      const payload = await response.json();
      setResult(payload);
      if (response.ok) {
        form.reset();
        await loadAccounts();
      }
    } catch {
      setResult({ error: "No fue posible procesar las cuentas." });
    } finally {
      setBusy(undefined);
    }
  }

  async function lifecycle(account: Account, action: "deactivate" | "reactivate" | "reset_password") {
    if (action === "deactivate" && !window.confirm(`¿Desactivar la cuenta de ${account.fullName}?`)) return;
    setBusy(`${action}:${account.id}`);
    setResult(undefined);
    try {
      const response = await fetch("/api/admin/inspectors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id, action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ error: payload.error || "No fue posible cambiar la cuenta." });
      } else {
        setResult(payload.temporaryPassword ? {
          created: [{ email: account.email, fullName: account.fullName, temporaryPassword: payload.temporaryPassword }],
        } : undefined);
        await loadAccounts();
      }
    } catch {
      setResult({ error: "No fue posible cambiar la cuenta." });
    } finally {
      setBusy(undefined);
    }
  }

  function canManage(account: Account) {
    if (account.id === currentUserId) return false;
    if (actorRole === "coordinator") return account.role === "inspector";
    return actorRole === "super_admin" && account.role !== "super_admin";
  }

  return <div className="admin-columns">
    <form className="section-card admin-form" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
      <h2>Crear una cuenta</h2>
      <label>Nombre completo<input name="fullName" required /></label>
      <label>Correo institucional<input name="email" type="email" required /></label>
      <label>Afiliación / entidad<input name="affiliation" required /></label>
      <button className="button button-primary" disabled={Boolean(busy)}>{busy === "create" ? "Creando…" : "Crear inspector"}</button>
    </form>
    <form className="section-card admin-form" onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
      <h2>Cargar roster</h2>
      <p>Use XLSX o CSV con columnas <code>email</code>, <code>nombre</code> y <code>afiliacion</code>.</p>
      <label className="drop-zone compact"><input name="roster" type="file" accept=".xlsx,.csv" required /><span>↥</span><strong>Seleccionar roster</strong></label>
      <button className="button button-primary" disabled={Boolean(busy)}>Validar y crear lote</button>
    </form>
    {result?.error && <div className="notice notice-danger full"><strong>No se completó la operación</strong><span>{result.error}</span></div>}
    {result?.report && <div className="section-card full validation-report"><table><thead><tr><th>Fila</th><th>Columna</th><th>Error</th></tr></thead><tbody>{result.report.map((issue) => <tr key={`${issue.row}:${issue.column}`}><td>{issue.row}</td><td>{issue.column}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}
    {result?.created && <div className="section-card full credentials-result">
      <div className="notice notice-warning"><strong>Copie estas credenciales ahora</strong><span>Las contraseñas temporales se muestran una sola vez y deberán cambiarse al ingresar.</span></div>
      <table><thead><tr><th>Nombre</th><th>Correo</th><th>Contraseña temporal</th></tr></thead><tbody>{result.created.map((item) => <tr key={item.email}><td>{item.fullName}</td><td>{item.email}</td><td><code>{item.temporaryPassword}</code></td></tr>)}</tbody></table>
      <button className="button button-secondary button-small" type="button" onClick={() => setResult(undefined)}>Ocultar credenciales</button>
    </div>}
    <section className="section-card full account-directory">
      <div className="section-title"><div><h2>Cuentas</h2><p>Desactivación, reactivación y contraseñas de reemplazo quedan auditadas.</p></div><button className="button button-secondary button-small" type="button" disabled={Boolean(busy)} onClick={() => loadAccounts().catch(() => setResult({ error: "No fue posible actualizar la lista." }))}>Actualizar</button></div>
      <div className="account-table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><strong>{account.fullName}</strong><small>{account.email}<br />{account.affiliation}</small></td><td>{roleLabels[account.role]}</td><td><span className={`account-status ${account.active ? "active" : "inactive"}`}>{account.active ? "Activa" : "Inactiva"}</span>{account.mustChangePassword && <small>Cambio de clave pendiente</small>}</td><td><div className="account-actions">{canManage(account) && account.active && <><button className="button button-secondary button-small" type="button" disabled={Boolean(busy)} onClick={() => lifecycle(account, "reset_password")}>Nueva clave</button><button className="button button-danger button-small" type="button" disabled={Boolean(busy)} onClick={() => lifecycle(account, "deactivate")}>Desactivar</button></>}{canManage(account) && !account.active && <button className="button button-primary button-small" type="button" disabled={Boolean(busy)} onClick={() => lifecycle(account, "reactivate")}>Reactivar y emitir clave</button>}{!canManage(account) && <small>Sin acciones disponibles</small>}</div></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
