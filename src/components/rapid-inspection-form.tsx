"use client";

import { useMemo, useRef, useState } from "react";
import { CONDITION_KEYS, CONDITION_LABELS, MAX_PHOTO_EDGE, MAX_PHOTOS, TAG_LABELS } from "@/lib/constants";
import { createClientUuid } from "@/lib/client-uuid";
import { classifyConditions, type ConditionRating, type Tag } from "@/lib/domain";
import { TagBadge } from "@/components/tag-badge";

type Municipality = { code: string; name: string; departmentName: string };
type PhotoItem = { file: File; preview: string; width: number; height: number };
type SubmissionResult = { receiptCode: string; inspectionId: string; suggestedTag: Tag; confirmedTag: Tag; warning: boolean; photoCount: number; demo?: boolean };
type GpsState = "idle" | "requesting" | "ready" | "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";

const initialConditions = Object.fromEntries(CONDITION_KEYS.map((key) => [key, "no_evaluado"])) as Record<(typeof CONDITION_KEYS)[number], ConditionRating>;
const ratings: Array<{ value: ConditionRating; label: string; short: string }> = [
  { value: "menor", label: "Menor o ninguno", short: "Menor" },
  { value: "moderado", label: "Moderado", short: "Moderado" },
  { value: "severo", label: "Severo", short: "Severo" },
  { value: "no_evaluado", label: "No evaluado", short: "N/E" },
];

async function decodeImage(file: File) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

async function compressPhoto(file: File): Promise<PhotoItem> {
  const image = await decodeImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo procesar la imagen.");
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo comprimir la foto.")), "image/jpeg", 0.82));
  const compressed = new File([blob], `${createClientUuid()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  return { file: compressed, preview: URL.createObjectURL(compressed), width, height };
}

export function RapidInspectionForm({ municipalities, initialBuildingCode = "", syntheticStaging = false }: { municipalities: Municipality[]; initialBuildingCode?: string; syntheticStaging?: boolean }) {
  const submissionId = useRef(createClientUuid());
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState<"exterior" | "ext_int">("exterior");
  const [municipalityCode, setMunicipalityCode] = useState("");
  const [address, setAddress] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [buildingCode, setBuildingCode] = useState(initialBuildingCode);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; accuracyM: number }>();
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [conditions, setConditions] = useState(initialConditions);
  const [conditionOtherText, setConditionOtherText] = useState("");
  const [confirmedTag, setConfirmedTag] = useState<Tag>("habitable");
  const [tagTouched, setTagTouched] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult>();
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const suggestedTag = useMemo(() => classifyConditions(conditions), [conditions]);
  const unassessed = Object.values(conditions).filter((value) => value === "no_evaluado").length;

  function changeCondition(key: keyof typeof conditions, value: ConditionRating) {
    const next = { ...conditions, [key]: value };
    setConditions(next);
    if (!tagTouched) setConfirmedTag(classifyConditions(next));
  }

  function requestGps() {
    if (!window.isSecureContext) { setGpsState("insecure"); return; }
    if (!navigator.geolocation) { setGpsState("unsupported"); return; }
    setGpsState("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCoordinates({ latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy }); setGpsState("ready"); },
      ({ code }) => setGpsState(code === 1 ? "denied" : code === 3 ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  const gpsMessage = gpsState === "ready"
    ? `Precisión aproximada: ${Math.round(coordinates?.accuracyM ?? 0)} m`
    : gpsState === "insecure"
      ? "Safari requiere HTTPS para permitir el GPS. Abra la dirección segura del servidor."
      : gpsState === "unsupported"
        ? "Este navegador no ofrece geolocalización. Complete la referencia manual."
        : gpsState === "denied"
          ? "Permiso rechazado. Habilite Ubicación para Safari o complete la referencia manual."
          : gpsState === "unavailable"
            ? "No fue posible determinar la ubicación. Intente al aire libre o complete la referencia manual."
            : gpsState === "timeout"
              ? "La captura tardó demasiado. Intente nuevamente o complete la referencia manual."
              : gpsState === "requesting"
                ? "Esperando la ubicación del dispositivo…"
                : "Opcional. Safari solicitará permiso al capturarla.";

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError("");
    const available = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/")).slice(0, available);
    if (selected.length === 0) { setError(`Puede adjuntar máximo ${MAX_PHOTOS} imágenes.`); return; }
    setPhotoBusy(true);
    try {
      const compressed = await Promise.all(selected.map(compressPhoto));
      setPhotos((current) => [...current, ...compressed]);
    }
    catch { setError("Una foto no pudo procesarse. Intente con otra imagen."); }
    finally { setPhotoBusy(false); }
  }

  function removePhoto(index: number) {
    setPhotos((current) => { URL.revokeObjectURL(current[index].preview); return current.filter((_, itemIndex) => itemIndex !== index); });
  }

  function validateStep(current: number) {
    if (current === 1 && (!municipalityCode || (!address.trim() && !coordinates))) return "Seleccione un municipio e ingrese una referencia o capture el GPS.";
    if (current === 2 && unassessed === 6) return "Evalúe al menos una de las seis condiciones.";
    if (current === 2 && conditions.cond_5 !== "menor" && !conditionOtherText.trim()) return "Describa el otro peligro observado.";
    if (current === 3 && suggestedTag !== confirmedTag && !overrideReason.trim()) return "Explique el cambio frente al resultado sugerido.";
    if (current === 3 && confirmedTag !== "habitable" && !restrictions.trim()) return "Registre las condiciones de acceso o la prohibición de ingreso.";
    return "";
  }

  function next() {
    const validation = validateStep(step);
    if (validation) { setError(validation); return; }
    setError(""); setStep((current) => Math.min(4, current + 1)); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const validation = validateStep(3);
    if (validation) { setError(validation); setStep(3); return; }
    if (!reviewConfirmed) { setError("Confirme la declaración antes de enviar."); return; }
    setSubmitting(true); setError("");
    try {
      const payload = {
        clientSubmissionId: submissionId.current, formType: "rapid_ceer", schemaVersion: 1, source: "web",
        inspectionScope: scope, municipalityCode, addressReference: address, coordinates, buildingCode: buildingCode || undefined,
        buildingName: buildingName || undefined, conditions, conditionOtherText: conditionOtherText || undefined,
        confirmedTag, overrideReason: overrideReason || undefined, restrictions: restrictions || undefined,
        detailedEvaluation: [], comments: comments || undefined,
      };
      const body = new FormData();
      body.set("payload", JSON.stringify(payload));
      body.set("photoMeta", JSON.stringify(photos.map(({ width, height }) => ({ width, height }))));
      photos.forEach(({ file }) => body.append("photos", file));
      const response = await fetch("/api/inspections", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No fue posible enviar la inspección.");
      setResult(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "El envío fue interrumpido. Puede reintentar sin perder la información."); }
    finally { setSubmitting(false); }
  }

  if (result) return <section className="submission-success"><div className="success-check">✓</div><p className="eyebrow">Inspección recibida</p><h1>Registro completado</h1><TagBadge tag={result.confirmedTag} large /><p className="receipt-label">Código de recibo</p><code className="receipt-code">{result.receiptCode}</code>{result.warning && <div className="notice notice-warning"><strong>Evaluación parcial</strong><span>El resultado excluye los indicadores marcados como no evaluados.</span></div>}<p>{result.photoCount} foto{result.photoCount === 1 ? "" : "s"} asociada{result.photoCount === 1 ? "" : "s"}. {result.demo && "Este registro pertenece únicamente a la demostración local."}</p><div className="success-actions"><a className="button button-primary" href="/inspecciones/nueva">Nueva evaluación</a><a className="button button-secondary" href="/mis-inspecciones">Mis inspecciones</a></div></section>;

  return <div className="form-layout">
    <div className="form-progress"><div className="progress-copy"><span>Paso {step} de 4</span><strong>{["Ubicación", "Indicadores", "Resultado", "Confirmación"][step - 1]}</strong></div><div className="progress-track"><i style={{ width: `${step * 25}%` }} /></div></div>
    <form className="inspection-form" onSubmit={(event) => event.preventDefault()}>
      {step === 1 && <section className="form-section"><div className="form-section-heading"><span>01</span><div><h2>Edificación y ubicación</h2><p>La dirección o el GPS son necesarios para ubicar el registro.</p></div></div>
        <div className="field-grid two"><label>Áreas inspeccionadas<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="exterior">Solo exterior</option><option value="ext_int">Exterior e interior</option></select></label><label>Código de edificación <small>Opcional</small><input value={buildingCode} onChange={(event) => setBuildingCode(event.target.value)} placeholder="ED-00000000" /></label></div>
        <label>Municipio DIVIPOLA<select value={municipalityCode} onChange={(event) => setMunicipalityCode(event.target.value)} required><option value="">Seleccione…</option>{municipalities.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.departmentName} ({item.code})</option>)}</select></label>
        <div className="field-grid two"><label>Nombre de la edificación <small>Opcional</small><input value={buildingName} onChange={(event) => setBuildingName(event.target.value)} placeholder="Ej. Escuela San José" /></label><label>Dirección o referencia<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Dirección, vereda o punto de referencia" /></label></div>
        <div className={`gps-card gps-${gpsState}`} aria-live="polite"><div><strong>{gpsState === "ready" ? "Ubicación capturada" : "Ubicación GPS"}</strong><span>{gpsMessage}</span></div><button type="button" className="button button-secondary" onClick={requestGps} disabled={gpsState === "requesting" || gpsState === "insecure"}>{gpsState === "requesting" ? "Capturando…" : gpsState === "ready" ? "Actualizar" : gpsState === "insecure" ? "HTTPS requerido" : "Capturar GPS"}</button></div>
      </section>}

      {step === 2 && <section className="form-section"><div className="form-section-heading"><span>02</span><div><h2>Indicadores de prioridad CEER</h2><p>Registre únicamente lo que pudo observar; el indicador más crítico define la sugerencia operativa.</p></div></div>
        {unassessed > 0 && unassessed < 6 && <div className="notice notice-warning"><strong>{unassessed} indicador{unassessed === 1 ? "" : "es"} sin evaluar</strong><span>Se excluirá del resultado y aparecerá una advertencia.</span></div>}
        <div className="condition-list">{CONDITION_KEYS.map((key, index) => <fieldset className="condition-card" key={key}><legend><span>{index + 1}</span>{CONDITION_LABELS[key]}</legend><div className="rating-options">{ratings.map((rating) => <label className={`rating rating-${rating.value}`} key={rating.value}><input type="radio" name={key} value={rating.value} checked={conditions[key] === rating.value} onChange={() => changeCondition(key, rating.value)} /><span>{rating.short}</span></label>)}</div>{key === "cond_5" && conditions.cond_5 !== "menor" && <label className="inline-detail">Descripción del otro peligro<textarea value={conditionOtherText} onChange={(event) => setConditionOtherText(event.target.value)} rows={2} /></label>}</fieldset>)}</div>
      </section>}

      {step === 3 && <section className="form-section"><div className="form-section-heading"><span>03</span><div><h2>Resultado operativo y evidencia</h2><p>Confirme la sugerencia CEER o documente técnicamente el cambio.</p></div></div>
        <div className="suggestion-panel"><span>Resultado sugerido por el servidor</span><TagBadge tag={suggestedTag} large /><small>Calculado con el indicador de mayor prioridad observado.</small></div>
        <fieldset className="tag-choice"><legend>Resultado confirmado por el inspector</legend>{(["habitable", "uso_restringido", "peligro_colapso"] as Tag[]).map((tag) => <label className={`tag-option tag-option-${tag}`} key={tag}><input type="radio" name="confirmedTag" checked={confirmedTag === tag} onChange={() => { setConfirmedTag(tag); setTagTouched(true); }} /><span><i />{TAG_LABELS[tag]}</span></label>)}</fieldset>
        {suggestedTag !== confirmedTag && <label>Razón del cambio<textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} placeholder="Explique la observación técnica que sustenta el cambio" required /></label>}
        {confirmedTag !== "habitable" && <label>Condiciones de acceso o prohibición de ingreso<textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} rows={3} placeholder="Describa de forma clara las áreas, actividades o accesos afectados" required /></label>}
        <label>Comentarios y recomendaciones <small>Opcional</small><textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={3} /></label>
        <div className="photo-section"><div><h3>Fotos de evidencia</h3><p>Opcionales · máximo cinco · se comprimen y eliminan metadatos EXIF.</p></div><label className={`photo-picker${photos.length >= MAX_PHOTOS ? " disabled" : ""}`}><input type="file" accept="image/*" capture="environment" multiple onChange={(event) => addPhotos(event.target.files)} disabled={photos.length >= MAX_PHOTOS || photoBusy} /><span>{photoBusy ? "Procesando…" : "+ Cámara o galería"}</span></label></div>
        {photos.length > 0 && <div className="photo-grid">{photos.map((photo, index) => <figure key={photo.preview}><img src={photo.preview} alt={`Evidencia ${index + 1}`} /><button type="button" aria-label={`Eliminar foto ${index + 1}`} onClick={() => removePhoto(index)}>×</button><figcaption>{Math.round(photo.file.size / 1024)} KB</figcaption></figure>)}</div>}
      </section>}

      {step === 4 && <section className="form-section review-section"><div className="form-section-heading"><span>04</span><div><h2>Confirme antes de enviar</h2><p>Revise los datos esenciales. El envío original quedará inmutable.</p></div></div>
        <div className="review-grid"><div><span>Municipio</span><strong>{municipalities.find((item) => item.code === municipalityCode)?.name} · {municipalityCode}</strong></div><div><span>Ubicación</span><strong>{address || `GPS capturado · ±${Math.round(coordinates?.accuracyM ?? 0)} m`}</strong></div><div><span>Alcance</span><strong>{scope === "exterior" ? "Solo exterior" : "Exterior e interior"}</strong></div><div><span>Indicadores observados</span><strong>{6 - unassessed} de 6</strong></div><div><span>Resultado confirmado</span><TagBadge tag={confirmedTag} /></div><div><span>Fotos</span><strong>{photos.length} de 5</strong></div></div>
        {suggestedTag !== confirmedTag && <div className="notice notice-info"><strong>Resultado modificado</strong><span>{overrideReason}</span></div>}
        {unassessed > 0 && <div className="notice notice-warning"><strong>Resultado parcialmente observado</strong><span>El recibo mostrará una advertencia prominente.</span></div>}
        <label className="confirmation-check"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} required /><span>{syntheticStaging ? "Confirmo que este registro y toda su evidencia son exclusivamente sintéticos para pruebas de staging, sin datos personales ni de una edificación real." : "Confirmo que la información refleja mi observación de campo. Entiendo que esta herramienta apoya la priorización operativa y no emite un dictamen estructural ni una autorización oficial de ocupación."}</span></label>
      </section>}

      {error && <div className="form-error boxed" role="alert"><strong>Revise la información</strong><span>{error}</span></div>}
      <div className="form-actions">{step > 1 && <button type="button" className="button button-secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}>Atrás</button>}<span />{step < 4 ? <button type="button" className="button button-primary" onClick={next}>Continuar</button> : <button type="button" className="button button-primary" onClick={submit} disabled={submitting}>{submitting ? "Enviando…" : "Enviar inspección"}</button>}</div>
    </form>
  </div>;
}
