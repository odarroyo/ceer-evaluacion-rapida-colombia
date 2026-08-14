const ORIGINAL_REPOSITORY_URL = "https://github.com/odarroyo/ceer-evaluacion-rapida-colombia";

export function ProjectAttribution({ className }: { className: string }) {
  return (
    <div className={className}>
      <strong>Aplicación desarrollada originalmente por CEER</strong>
      <span>
        Repositorio original:{" "}
        <a href={ORIGINAL_REPOSITORY_URL} target="_blank" rel="noreferrer">
          ceer-evaluacion-rapida-colombia
        </a>
      </span>
      <strong>Referencia metodológica: procedimientos ATC-20</strong>
      <small>
        Instrumento digital CEER. No reproduce ni sustituye el formulario
        oficial del Applied Technology Council.
      </small>
    </div>
  );
}
