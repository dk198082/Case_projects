import { mkdir, writeFile } from "node:fs/promises";
import {
  DATAFLOW_DOCUMENT,
  type DataflowCalculation,
  type DataflowObject,
  type DataflowStage,
} from "../src/lib/dataflow-content";
import {
  REQUIREMENTS_REVIEW,
  type ReviewItem,
  type ReviewStatus,
} from "../src/lib/review-content";

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const documentStyles = `
  :root {
    color-scheme: dark;
    font-family: Aptos, "Segoe UI", Arial, sans-serif;
    background: #00281d;
    color: #f5faf3;
    line-height: 1.55;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #00281d; }
  main { width: min(1100px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 72px; }
  header { border-bottom: 1px solid rgba(194, 210, 190, .25); padding-bottom: 28px; }
  .eyebrow { color: #b7ff00; font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .15em; text-transform: uppercase; }
  h1 { margin: 10px 0 0; font-size: clamp(28px, 5vw, 46px); line-height: 1.05; letter-spacing: -.03em; }
  h2 { margin: 0; font-size: 21px; line-height: 1.2; }
  h3 { margin: 0; font-size: 16px; line-height: 1.3; }
  p { margin: 0; }
  .subtitle { max-width: 780px; margin-top: 14px; color: #c2d2be; font-size: 15px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 22px; color: #c2d2be; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .meta strong { color: #f5faf3; }
  .notice { margin-top: 28px; border: 1px solid rgba(183, 255, 0, .3); background: rgba(183, 255, 0, .06); padding: 14px 16px; color: #dcebd7; font-size: 13px; }
  section { margin-top: 34px; }
  .section-heading { display: flex; gap: 14px; align-items: flex-start; border-bottom: 1px solid rgba(194, 210, 190, .22); padding-bottom: 12px; }
  .section-number { color: #b7ff00; font: 700 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .section-summary { margin-top: 6px; color: #c2d2be; font-size: 13px; }
  .grid { display: grid; gap: 12px; margin-top: 14px; }
  .card { border: 1px solid rgba(194, 210, 190, .22); background: rgba(8, 58, 43, .52); padding: 16px; break-inside: avoid; }
  .card-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .card-header p, .source { margin-top: 5px; color: #9db39b; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .label { margin-bottom: 6px; color: #b7ff00; font: 700 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; }
  .copy { color: #e6f0e3; font-size: 13px; }
  .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
  .inset { border: 1px solid rgba(194, 210, 190, .16); background: rgba(0, 40, 29, .34); padding: 12px; }
  .pill { display: inline-block; border: 1px solid rgba(194, 210, 190, .25); padding: 4px 7px; color: #c2d2be; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .status { border-radius: 2px; padding: 5px 8px; font: 700 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
  .fulfilled { border: 1px solid rgba(183, 255, 0, .35); background: rgba(183, 255, 0, .1); color: #b7ff00; }
  .partial { border: 1px solid rgba(251, 191, 36, .35); background: rgba(251, 191, 36, .1); color: #fde68a; }
  .out-of-scope { border: 1px solid rgba(125, 211, 252, .3); background: rgba(125, 211, 252, .08); color: #bae6fd; }
  ol.path { display: flex; flex-wrap: wrap; gap: 9px 24px; padding: 0; margin: 14px 0 0; list-style: none; counter-reset: path; }
  ol.path li { position: relative; border: 1px solid rgba(194, 210, 190, .22); background: rgba(8, 58, 43, .52); padding: 8px 11px; color: #f5faf3; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
  ol.path li:not(:last-child)::after { content: "→"; position: absolute; right: -19px; color: #b7ff00; }
  footer { margin-top: 42px; border-top: 1px solid rgba(194, 210, 190, .22); padding-top: 16px; color: #9db39b; font-size: 12px; }
  @media (max-width: 680px) {
    main { width: min(100% - 28px, 1100px); padding-top: 28px; }
    .two-col { grid-template-columns: 1fr; }
    ol.path { display: grid; }
    ol.path li:not(:last-child)::after { content: "↓"; right: auto; left: 12px; bottom: -18px; }
  }
  @media print {
    :root { color-scheme: light; background: white; color: #10251b; }
    body { background: white; }
    main { width: 100%; padding: 0; }
    .card, .inset, ol.path li { background: #f5faf3; border-color: #b8c6b4; }
    .subtitle, .section-summary, .copy, footer, .card-header p, .source { color: #38523d; }
    .eyebrow, .section-number, .label { color: #176b37; }
    .notice { background: #f0f8e7; border-color: #9abf68; color: #254a2b; }
  }
`;

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <title>${escapeHtml(title)}</title>
    <style>${documentStyles}</style>
  </head>
  <body><main>${body}</main></body>
</html>`;

const statusLabel: Record<ReviewStatus, string> = {
  fulfilled: "Fulfilled",
  partial: "Partial / data-dependent",
  "out-of-scope": "Intentionally out of scope",
};

const reviewItem = (item: ReviewItem) => `
  <article class="card">
    <div class="card-header">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.requirement)}</p>
      </div>
      <span class="status ${escapeHtml(item.status)}">${escapeHtml(statusLabel[item.status])}</span>
    </div>
    <div class="two-col">
      <div class="inset"><div class="label">Functional behavior</div><p class="copy">${escapeHtml(item.functional)}</p></div>
      <div class="inset"><div class="label">Technical evidence</div><p class="copy">${escapeHtml(item.technical)}</p></div>
    </div>
  </article>`;

const reviewHtml = shell(
  REQUIREMENTS_REVIEW.title,
  `<header>
    <div class="eyebrow">Production Priority Board · Requirements Review</div>
    <h1>${escapeHtml(REQUIREMENTS_REVIEW.title)}</h1>
    <p class="subtitle">A standalone record of how the current implementation maps to the production board requirements. Partial and data-dependent areas are called out instead of being treated as verified passes.</p>
    <div class="meta">
      <span>Version <strong>${escapeHtml(REQUIREMENTS_REVIEW.version)}</strong></span>
      <span>Reviewed <strong>${escapeHtml(REQUIREMENTS_REVIEW.reviewedOn)}</strong></span>
      <span>Source <strong>${escapeHtml(REQUIREMENTS_REVIEW.sourceDocument)}</strong></span>
    </div>
  </header>
  <div class="notice">This is a static downloadable document generated from the application-owned requirements manifest. Current live evidence remains available through the read-only production snapshot API, not in this file.</div>
  ${REQUIREMENTS_REVIEW.sections.map((section, index) => `
    <section>
      <div class="section-heading">
        <span class="section-number">${String(index + 1).padStart(2, "0")}</span>
        <div><h2>${escapeHtml(section.title)}</h2><p class="section-summary">${escapeHtml(section.summary)}</p></div>
      </div>
      <div class="grid">${section.items.map(reviewItem).join("")}</div>
    </section>`).join("")}
  <footer>Maintenance: update <code>src/lib/review-content.ts</code> and regenerate this document whenever requirements, source rules, scope, or user-visible behavior changes.</footer>`,
);

const stageLabel: Record<DataflowStage, string> = {
  source: "Source",
  transform: "Transform",
  output: "Output",
  guardrail: "Guardrail",
};

const objectCard = (object: DataflowObject) => `
  <article class="card">
    <div class="card-header">
      <div><h3>${escapeHtml(object.name)}</h3><p>${escapeHtml(object.type)}</p></div>
    </div>
    <p class="copy" style="margin-top:12px">${escapeHtml(object.role)}</p>
    <div class="two-col">
      <div class="inset"><div class="label">Fields used</div><div class="pill-row">${object.fields.map((field) => `<span class="pill">${escapeHtml(field)}</span>`).join("")}</div></div>
      <div class="inset"><div class="label">Used for</div><p class="copy">${escapeHtml(object.usedFor)}</p></div>
    </div>
  </article>`;

const calculationCard = (item: DataflowCalculation) => `
  <article class="card">
    <div class="card-header">
      <div><h3>${escapeHtml(item.name)}</h3><p class="source">${escapeHtml(item.source)}</p></div>
      <span class="status fulfilled">${escapeHtml(stageLabel[item.stage])}</span>
    </div>
    <div class="two-col">
      <div class="inset"><div class="label">Calculation / rule</div><p class="copy">${escapeHtml(item.formula)}</p></div>
      <div class="inset"><div class="label">Result in the app</div><p class="copy">${escapeHtml(item.result)}</p></div>
    </div>
  </article>`;

const dataflowHtml = shell(
  DATAFLOW_DOCUMENT.title,
  `<header>
    <div class="eyebrow">Production Priority Board · Dataflow</div>
    <h1>${escapeHtml(DATAFLOW_DOCUMENT.title)}</h1>
    <p class="subtitle">${escapeHtml(DATAFLOW_DOCUMENT.purpose)}</p>
    <div class="meta">
      <span>Version <strong>${escapeHtml(DATAFLOW_DOCUMENT.version)}</strong></span>
      <span>Updated <strong>${escapeHtml(DATAFLOW_DOCUMENT.updatedOn)}</strong></span>
    </div>
  </header>
  <div class="notice">This is a static downloadable document generated from the application-owned dataflow manifest. It describes the live path and formulas; current production counts remain available through the read-only API.</div>
  <section>
    <div class="section-heading"><span class="section-number">01</span><div><h2>Runtime path</h2><p class="section-summary">The read-only route from source systems to the operator-facing board.</p></div></div>
    <ol class="path">${DATAFLOW_DOCUMENT.runtimePath.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
  </section>
  <section>
    <div class="section-heading"><span class="section-number">02</span><div><h2>Database/source inventory</h2><p class="section-summary">Tables, views, configuration, and contracts used by the production-priority flow.</p></div></div>
    <div class="grid">${DATAFLOW_DOCUMENT.objects.map(objectCard).join("")}</div>
  </section>
  ${DATAFLOW_DOCUMENT.sections.map((section, index) => `
    <section>
      <div class="section-heading">
        <span class="section-number">${String(index + 3).padStart(2, "0")}</span>
        <div><h2>${escapeHtml(section.title)}</h2><p class="section-summary">${escapeHtml(section.summary)}</p></div>
      </div>
      <div class="grid">${section.items.map(calculationCard).join("")}</div>
    </section>`).join("")}
  <footer>Maintenance: update <code>src/lib/dataflow-content.ts</code> and regenerate this document whenever a source object, join, filter, stop rule, API field, calculation, or browser transformation changes.</footer>`,
);

const outputDirectory = new URL("../public/documents/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("production-priority-requirements-review.html", outputDirectory), reviewHtml, "utf8");
await writeFile(new URL("production-priority-dataflow.html", outputDirectory), dataflowHtml, "utf8");
console.log("Generated requirements review and dataflow documents.");