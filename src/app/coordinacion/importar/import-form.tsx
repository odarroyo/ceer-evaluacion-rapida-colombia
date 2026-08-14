"use client";

import { useState } from "react";

type ImportResponse = { imported?: number; batchId?: string; report?: Array<{ row: number; column: string; message: string }>; error?: string };

export function ImportForm() {
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse>();
  async function upload() {
    if (!file) return;
    setBusy(true); setResult(undefined);
    const body = new FormData(); body.set("workbook", file);
    try { const response = await fetch("/api/imports/rapid", { method: "POST", body }); setResult(await response.json()); }
    catch { setResult({ error: "No fue posible cargar el archivo." }); }
    finally { setBusy(false); }
  }
  return <div className="import-panel"><label className="drop-zone"><input type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0])} /><span>↥</span><strong>{file?.name ?? "Seleccione el libro XLSX"}</strong><small>Máximo 10 MB y 1.000 filas. No incluya fotos.</small></label><button type="button" className="button button-primary" disabled={!file || busy} onClick={upload}>{busy ? "Validando todo el lote…" : "Validar e importar"}</button>{result?.imported !== undefined && <div className="notice notice-success"><strong>Lote importado</strong><span>{result.imported} fila{result.imported === 1 ? "" : "s"} registrada{result.imported === 1 ? "" : "s"} en una transacción.</span></div>}{result?.error && <div className="notice notice-danger"><strong>Lote rechazado</strong><span>{result.error}</span></div>}{result?.report && result.report.length > 0 && <div className="validation-report"><h3>Informe de validación</h3><table><thead><tr><th>Fila</th><th>Columna</th><th>Problema</th></tr></thead><tbody>{result.report.map((issue, index) => <tr key={`${issue.row}-${issue.column}-${index}`}><td>{issue.row}</td><td>{issue.column}</td><td>{issue.message}</td></tr>)}</tbody></table></div>}</div>;
}
