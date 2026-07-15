// Minimal shape of the element
interface FormElementLike extends HTMLElement {
  loadQuery(values: Record<string, any>): void;
  loadQueryFromCriteria(criteria: Record<string, string>): void;
}

export interface SparnaturalFormLoaderOptions {
  // URL params to ignore when prefilling (page-level params).
  reservedParams?: string[];
  // id of the config element holding data-queries (defaults to "predefined-queries").
  predefinedQueriesId?: string;
  // placeholder label for the dropdown (defaults to a FR/EN guess from <html lang>).
  placeholder?: string;
}

export class SparnaturalFormLoader {
  private form: FormElementLike;
  private options: Required<SparnaturalFormLoaderOptions>;

  constructor(
    form: HTMLElement | null,
    options: SparnaturalFormLoaderOptions = {},
  ) {
    if (!form) throw new Error("SparnaturalFormLoader: form element is null");
    this.form = form as FormElementLike;

    const lang = document.documentElement.getAttribute("lang") || "en";
    this.options = {
      reservedParams: options.reservedParams ?? ["lang"],
      predefinedQueriesId: options.predefinedQueriesId ?? "predefined-queries",
      placeholder:
        options.placeholder ??
        (lang.startsWith("fr")
          ? "Charger une requête d'exemple..."
          : "Load example query..."),
    };
  }

  // Wires everything on the form's "init" event.
  init(): this {
    this.form.addEventListener("init", () => {
      this.prefillFromUrl();
      this.buildPredefinedQueriesDropdown();
    });
    return this;
  }

  // Reads URL params (minus reserved ones) and prefills the form.
  prefillFromUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const criteria: Record<string, string> = {};
    params.forEach((value, key) => {
      if (!this.options.reservedParams.includes(key)) criteria[key] = value;
    });
    if (Object.keys(criteria).length > 0) {
      this.form.loadQueryFromCriteria(criteria);
    }
  }

  // Builds the predefined-queries <select> from #predefined-queries[data-queries].
  buildPredefinedQueriesDropdown(): void {
    const config = document.getElementById(this.options.predefinedQueriesId);
    if (!config) return;
    const url = config.getAttribute("data-queries");
    if (!url) return;

    // Render outside the form, inside the #predefined-queries div itself.
    const host = config;

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const queries = Array.isArray(data && data.queries) ? data.queries : [];
        if (queries.length === 0) return;

        const container = document.createElement("div");
        container.classList.add("predefined-queries-container");

        const select = document.createElement("select");
        select.id = "predefined-queries-select";
        select.classList.add("predefined-queries-select");

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = this.options.placeholder;
        select.appendChild(placeholder);

        queries.forEach((q: any, i: number) => {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = q.label;
          select.appendChild(opt);
        });

        select.addEventListener("change", () => {
          const i = parseInt(select.value, 10);
          if (Number.isNaN(i)) {
            this.form.loadQuery({});
          } else if (queries[i]) {
            this.form.loadQuery(queries[i].values);
          }
          // reset to placeholder so re-selecting the same example fires change
          select.value = "";
        });

        container.appendChild(select);
        const existing = host.querySelector(".predefined-queries-container");
        if (existing) existing.remove();
        host.appendChild(container);
      })
      .catch((e) =>
        console.error("Unable to load predefined queries: " + url, e),
      );
  }
}
