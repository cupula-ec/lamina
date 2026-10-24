import { Latex, Md } from "@lamina/engine";
import type { Material, MaterialItem } from "@/lib/student-material";

const Item = ({ it }: { it: MaterialItem }) => {
  switch (it.kind) {
    case "md": return <div className="mt-doc-md"><Md>{it.md}</Md></div>;
    case "concept": return <div className="mt-concept"><strong>{it.term}.</strong> <Md inline>{it.md}</Md></div>;
    case "formula": return <figure className="mt-formula"><Latex tex={it.latex} />{it.caption && <figcaption>{it.caption}</figcaption>}</figure>;
    case "steps": return <div><p className="mt-label">{it.title ?? "Pasos"}</p><ol className="mt-steps">{it.steps.map((s, i) => <li key={i}>{s.latex && <Latex tex={s.latex} display={false} />} <Md inline>{s.text}</Md></li>)}</ol></div>;
    case "example": return <div className="mt-example"><p className="mt-label">Ejemplo resuelto</p><p><Md inline>{it.problem}</Md></p><ol className="mt-steps">{it.steps.map((s, i) => <li key={i}>{s.latex && <Latex tex={s.latex} display={false} />} <Md inline>{s.text}</Md></li>)}</ol><p><strong>Respuesta:</strong> <Md inline>{it.answer}</Md></p></div>;
    case "motivation": return <div className="mt-motiv"><strong><Md inline>{it.hook}</Md></strong> <Md inline>{it.text}</Md></div>;
    case "code": return <pre className="mt-code" aria-label={`Código ${it.language}`}><code>{it.source}</code></pre>;
    case "table": return <table className="mt-table"><thead><tr>{it.headers.map((h, i) => <th key={i}><Md inline>{h}</Md></th>)}</tr></thead><tbody>{it.rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}><Md inline>{c}</Md></td>)}</tr>)}</tbody></table>;
    case "note": return <p className="mt-note"><Md inline>{it.text}</Md></p>;
    case "exercise": return <div className="mt-exercise"><p className="mt-label">Ejercicio {it.n}</p><p><Md inline>{it.statement}</Md></p><p><em>Piensa: <Md inline>{it.question}</Md></em></p>{it.hints.length > 0 && <ul>{it.hints.map((h, i) => <li key={i}>Pista {i + 1}: <Md inline>{h}</Md></li>)}</ul>}<p className="mt-solution-ref">La solución está al final del documento.</p></div>;
    case "activity": return <div className="mt-activity"><p className="mt-label">{it.label} · {it.minutes} min</p><p><Md inline>{it.prompt}</Md></p></div>;
  }
};

/** Documento del alumno: lo usan la página compartible y el PDF (mismo marcado, con estilos de impresión). */
export function MaterialDoc({ m, byline }: { m: Material; byline?: string }) {
  return (
    <article className="mt-doc">
      <header><h1>{m.title}</h1><p className="mt-sub">{m.subtitle}</p>{byline && <p className="mt-by">{byline}</p>}</header>
      {m.sections.map((s) => <section key={s.id}><h2>{s.title}</h2>{s.items.map((it, i) => <Item key={i} it={it} />)}</section>)}
      {m.keyConcepts.length > 0 && <section><h2>Conceptos clave</h2><dl className="mt-keys">{m.keyConcepts.map((k, i) => <div key={i}><dt>{k.term}</dt><dd><Md inline>{k.md}</Md></dd></div>)}</dl></section>}
      {m.closing && <section><h2>Para cerrar</h2><ol>{m.closing.keyIdeas.map((k, i) => <li key={i}><Md inline>{k}</Md></li>)}</ol>{m.closing.questions.length > 0 && <><p className="mt-label">Para pensar</p><ul>{m.closing.questions.map((q, i) => <li key={i}><Md inline>{q}</Md></li>)}</ul></>}</section>}
      {m.solutions.length > 0 && (
        <section className="mt-solutions"><h2>Soluciones</h2>
          {m.solutions.map((s) => <div key={s.n} className="mt-solution"><p className="mt-label">Ejercicio {s.n}</p><p className="mt-sol-st"><Md inline>{s.statement}</Md></p><ol className="mt-steps">{s.steps.map((st, i) => <li key={i}><strong><Md inline>{st.do}</Md></strong> <em><Md inline>{st.why}</Md></em>{st.latex && <> <Latex tex={st.latex} display={false} /></>}</li>)}</ol><p><strong>Respuesta:</strong> <Md inline>{s.answer}</Md></p>{s.mistakes.length > 0 && <p className="mt-note">Errores comunes: {s.mistakes.join("; ")}</p>}</div>)}
        </section>
      )}
      {m.credits.length > 0 && <section className="mt-credits"><h2>Créditos de las imágenes</h2><ul>{m.credits.map((c, i) => <li key={i}>{c}</li>)}</ul></section>}
    </article>
  );
}
