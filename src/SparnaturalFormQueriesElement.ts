import { FlatQueryValues } from "./sparnatural-form/FormStructure";

// Minimal shape of the <sparnatural-form> element this component drives.
interface FormElementLike extends HTMLElement {
  loadQuery(values: FlatQueryValues): void;
  loadQueryFromCriteria(criteria: Record<string, string | string[]>): void;
  whenPrefillApplied?(): Promise<void>;
  triggerSubmit?(): void;
}

// One entry of the queries file : a label + the flat values to prefill.
// The label is either a plain string, or an object keyed by language code
// (e.g. { fr: "...", en: "..." }) resolved against the "lang" attribute.
interface PredefinedQuery {
  label: string | Record<string, string>;
  values: FlatQueryValues;
}

// Placeholder shown as the first (empty) dropdown option, per language.
const PLACEHOLDERS: Record<string, string> = {
  fr: "Charger une requête d'exemple...",
  en: "Load example query...",
};

// URL params that are never form fields.
const RESERVED_PARAMS = ["lang", "exec"];
// URL param name and value that disable auto-submit after URL prefill.
const EXEC_PARAM = "exec";
// URL param name holding a full JSON query.
const QUERY_PARAM = "query";

/**
 * <sparnatural-form-queries> : the single entry point for pre-filling a
 * <sparnatural-form>. It handles everything :
 *  - pre-fills the target form from the page URL (?Var=value or ?query=<JSON>)
 *    and submits it automatically (unless ?exec=false) ;
 *  - if "src" is given, renders a dropdown of predefined example queries that
 *    pre-fills the form when one is selected (without submitting).
 *
 * Attributes :
 *  - for  : id of the <sparnatural-form> to drive. If omitted, the single
 *           <sparnatural-form> on the page is used.
 *  - src  : URL of the queries JSON file ({ queries: [{label, values}] }).
 *           Optional : without it, no dropdown is shown but URL pre-filling
 *           still runs.
 *  - lang : language for the dropdown placeholder (fr/en/de/it, defaults en).
 */
export class SparnaturalFormQueriesElement extends HTMLElement {
  static HTML_ELEMENT_NAME = "sparnatural-form-queries";

  private queries: PredefinedQuery[] = [];

  // Set when the form is reset : the reset re-renders the form, which re-fires
  // "init". The URL must not be re-applied then, otherwise Reset appears to do
  // nothing on a page opened with pre-filling params.
  private skipNextUrlPrefill = false;

  connectedCallback() {
    const form = this.resolveTargetForm();
    if (form) {
      this.setup(form);
      return;
    }

    // Target not in the DOM yet : it may be declared after this element (common
    // when several forms share a page). Retry once the document is fully parsed.
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const retried = this.resolveTargetForm();
          if (retried) this.setup(retried);
          else this.warnNoTarget();
        },
        { once: true },
      );
      return;
    }

    this.warnNoTarget();
  }

  private warnNoTarget(): void {
    console.error(
      "sparnatural-form-queries: no target <sparnatural-form> found" +
        (this.getAttribute("for")
          ? ` for id "${this.getAttribute("for")}"`
          : ""),
    );
  }

  // Wires URL pre-filling on the form's "init" event, and builds the dropdown
  // (if a "src" is given).
  private setup(form: FormElementLike): void {
    form.addEventListener("init", () => {
      if (this.skipNextUrlPrefill) {
        this.skipNextUrlPrefill = false;
        return;
      }
      this.prefillFromUrl(form);
    });

    // Fired by the form's Reset, just before it re-renders itself.
    form.addEventListener("resetEditor", () => {
      this.skipNextUrlPrefill = true;
    });

    if (this.getAttribute("src")) {
      this.loadQueries().then(() => this.render(form));
    }
  }

  // Finds the <sparnatural-form> named by "for", or the single one on the page.
  private resolveTargetForm(): FormElementLike | null {
    const forId = this.getAttribute("for");
    if (forId) {
      return document.getElementById(forId) as FormElementLike | null;
    }
    return document.querySelector(
      "sparnatural-form",
    ) as FormElementLike | null;
  }

  private get langCode(): string {
    const lang = (this.getAttribute("lang") || "en").toLowerCase();
    return lang.split("-")[0];
  }

  private get placeholderText(): string {
    return PLACEHOLDERS[this.langCode] ?? PLACEHOLDERS.en;
  }

  // Resolves a query label to a string : a plain string is returned as is ;
  // an object keyed by language falls back lang → en → first available.
  private resolveLabel(label: PredefinedQuery["label"]): string {
    if (typeof label === "string") return label;
    if (!label || typeof label !== "object") return "";
    return label[this.langCode] ?? label.en ?? Object.values(label)[0] ?? "";
  }

  // Reads the current page URL and pre-fills the target form, then submits it
  // automatically (unless ?exec=false). Two modes, checked in order :
  //  - ?query=<encoded JSON> : a full {variable:{label,criteria}} structure ;
  //  - ?Var=value&... : one raw value per variable (repeated param = array).
  private prefillFromUrl(form: FormElementLike): void {
    const params = new URLSearchParams(window.location.search);

    const rawQuery = params.get(QUERY_PARAM);
    if (rawQuery) {
      try {
        form.loadQuery(JSON.parse(rawQuery));
      } catch (e) {
        console.error(
          `sparnatural-form-queries: invalid JSON in "${QUERY_PARAM}" URL param.`,
          e,
        );
      }
      return;
    }

    const criteria: Record<string, string | string[]> = {};
    new Set(params.keys()).forEach((key) => {
      if (RESERVED_PARAMS.includes(key)) return;
      const all = params.getAll(key);
      criteria[key] = all.length > 1 ? all : all[0];
    });
    if (Object.keys(criteria).length === 0) return;

    form.loadQueryFromCriteria(criteria);

    // Auto-submit once the prefill has fully settled, unless ?exec=false.
    if (params.get(EXEC_PARAM) === "false") return;
    if (!form.whenPrefillApplied || !form.triggerSubmit) return;
    form.whenPrefillApplied().then(() => form.triggerSubmit!());
  }

  // Reads the queries file pointed at by "src".
  private loadQueries(): Promise<void> {
    const url = this.getAttribute("src");
    if (!url) return Promise.resolve();
    return fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        this.queries = Array.isArray(data && data.queries) ? data.queries : [];
      })
      .catch((e) =>
        console.error(
          "sparnatural-form-queries: unable to load queries file " + url,
          e,
        ),
      );
  }

  // Builds the <select> and wires its change handler onto the target form.
  private render(form: FormElementLike): void {
    if (this.queries.length === 0) return;

    const container = document.createElement("div");
    container.classList.add("predefined-queries-container");

    const select = document.createElement("select");
    select.classList.add("predefined-queries-select");

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = this.placeholderText;
    select.appendChild(placeholder);

    this.queries.forEach((q, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = this.resolveLabel(q.label);
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const i = parseInt(select.value, 10);
      if (Number.isNaN(i)) {
        form.loadQuery({});
      } else if (this.queries[i]) {
        form.loadQuery(this.queries[i].values);
      }
      // Reset to placeholder so re-selecting the same example fires change again.
      select.value = "";
    });

    container.appendChild(select);
    this.replaceChildren(container);
  }
}

// Registers the custom element. Called from the bundle entry point so the class
// is retained even with webpack "sideEffects": false tree-shaking.
export function defineSparnaturalFormQueriesElement(): void {
  customElements.get(SparnaturalFormQueriesElement.HTML_ELEMENT_NAME) ||
    window.customElements.define(
      SparnaturalFormQueriesElement.HTML_ELEMENT_NAME,
      SparnaturalFormQueriesElement,
    );
}
