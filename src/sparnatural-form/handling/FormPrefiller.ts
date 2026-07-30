import { FieldHandle } from "../components/FormField";
import { FlatQueryValues, RawQueryValues } from "../FormStructure";

// Keywords a URL raw value can use instead of an actual value :
//  - UNKNOWN : the field has no value (SPARQL "Unknown" / not exist) ;
//  - ANY     : the field has any known value ("Any known value").
// Case-insensitive. See applyRawValue().
const KEYWORD_UNKNOWN = "UNKNOWN";
const KEYWORD_ANY = "ANY";

export class FormPrefiller {
  private fieldRegistry: Map<string, FieldHandle>;

  // Values requested before the form was rendered, applied in applyPending().
  private pendingPrefill: FlatQueryValues | null = null;
  private pendingRawCriteria: RawQueryValues | null = null;

  // Bumped on every apply*(); late async resolutions of an older generation are ignored.
  private generation = 0;

  // Resolves once the last requested raw-criteria prefill has fully settled
  // (including async IRI label resolution). Used to auto-submit afterwards.
  private rawCriteriaDone: Promise<void> = Promise.resolve();
  private pendingResolve: (() => void) | null = null;
  private pendingCount = 0;

  constructor(fieldRegistry: Map<string, FieldHandle>) {
    this.fieldRegistry = fieldRegistry;
  }

  // Promise that settles when the current raw-criteria prefill is fully applied.
  whenRawCriteriaApplied(): Promise<void> {
    return this.rawCriteriaDone;
  }

  // Applies any prefill/criteria queued before render. Called by the component.
  applyPending(): void {
    if (this.pendingPrefill) {
      const values = this.pendingPrefill;
      this.pendingPrefill = null;
      this.applyPrefill(values);
    }
    if (this.pendingRawCriteria) {
      const values = this.pendingRawCriteria;
      this.pendingRawCriteria = null;
      this.applyRawCriteria(values);
    }
  }

  // Prefills from a flat query (variable -> { label, criteria }).
  loadQuery(values: FlatQueryValues): void {
    if (!values || typeof values !== "object") {
      console.warn("loadQuery called without valid values:", values);
      return;
    }

    // Not rendered yet : queue and apply in applyPending().
    if (this.fieldRegistry.size === 0) {
      this.pendingPrefill = values;
      return;
    }

    this.applyPrefill(values);
  }

  // Prefills from raw values (variable -> raw string, typically URL params).
  loadQueryFromCriteria(values: RawQueryValues): void {
    if (!values || typeof values !== "object") {
      console.warn(
        "loadQueryFromCriteria called without valid values:",
        values,
      );
      return;
    }

    // Not rendered yet : queue and apply in applyPending(). Set up the "done"
    // promise now so whenRawCriteriaApplied() reflects this request even if it
    // is queried before the form finishes rendering.
    if (this.fieldRegistry.size === 0) {
      this.pendingRawCriteria = values;
      this.rawCriteriaDone = new Promise<void>((resolve) => {
        this.pendingResolve = resolve;
      });
      return;
    }

    this.applyRawCriteria(values);
  }

  // Clears every rendered field (synchronous reset) without re-rendering.
  private clearAllFields(): void {
    this.fieldRegistry.forEach((field) => {
      field.clear();

      // Reset any value / not exist state to the field's initial state
      if (field.optionalCriteriaManager) {
        field.optionalCriteriaManager.resetOptionalState();
      }
    });
  }

  // Resets then injects the flat query values into the matching widgets.
  private applyPrefill(values: FlatQueryValues): void {
    console.log("Applying prefill values:", values);

    this.clearAllFields();
    this.generation++;

    Object.entries(values).forEach(([variable, value]) => {
      const field = this.findField(variable);
      if (!field) {
        console.warn(
          `loadQuery: no form field found for variable "${variable}", skipping`,
        );
        return;
      }
      if (!value || !value.criteria) {
        console.warn(
          `loadQuery: invalid value for variable "${variable}", skipping`,
          value,
        );
        return;
      }

      field.widget.triggerRenderWidgetVal(value);
    });
  }

  // Resets then asks each field's widget to resolve/parse its raw value.
  private applyRawCriteria(values: RawQueryValues): void {
    console.log("Applying raw criteria:", values);

    this.clearAllFields();
    const generation = ++this.generation;

    // "done" promise for this prefill ; resolved when pendingCount hits 0.
    // Reuse the resolver set up by the queued path, otherwise make a fresh one.
    this.pendingCount = 0;
    if (!this.pendingResolve) {
      this.rawCriteriaDone = new Promise<void>((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    Object.entries(values).forEach(([variable, raw]) => {
      const field = this.findField(variable);
      if (!field) {
        console.warn(
          `loadQueryFromCriteria: no form field found for variable "${variable}", skipping`,
        );
        return;
      }

      // Repeated URL param (e.g. ?TypeActor=uri1&TypeActor=uri2) → apply each.
      // The widget stacks them if it is multi-value, ignores extras if single.
      const rawValues = Array.isArray(raw) ? raw : [raw];
      rawValues.forEach((value) => {
        this.applyRawValue(field, variable, value, generation);
      });
    });

    // Nothing async was queued → settle immediately.
    if (this.pendingCount === 0) this.settleRawCriteria();
  }

  // Looks up a field by variable, first exactly then case-insensitively so a URL
  // param like ?season=... matches a "Season" field.
  private findField(variable: string): FieldHandle | undefined {
    const exact = this.fieldRegistry.get(variable);
    if (exact) return exact;
    const lower = variable.toLowerCase();
    for (const [key, field] of this.fieldRegistry) {
      if (key.toLowerCase() === lower) return field;
    }
    return undefined;
  }

  // Applies one raw value to a field, handling UNKNOWN/ANY keywords, IRIs and
  // literals. Async IRI resolution is tracked so we know when everything settled.
  private applyRawValue(
    field: FieldHandle,
    variable: string,
    raw: string,
    generation: number,
  ): void {
    if (raw == null || raw === "") {
      return;
    }

    // UNKNOWN / ANY keywords → drive the "Unknown" / "Any known value" options
    // instead of setting a widget value.
    const keyword = raw.trim().toUpperCase();
    if (keyword === KEYWORD_UNKNOWN || keyword === KEYWORD_ANY) {
      const manager = field.optionalCriteriaManager;
      const applied =
        keyword === KEYWORD_UNKNOWN
          ? manager?.activateNotExist()
          : manager?.activateAnyValue();
      if (!applied) {
        console.warn(
          `loadQueryFromCriteria: "${raw}" requested for "${variable}" but this field has no Unknown/Any option, skipping`,
        );
      }
      return;
    }

    const widget = field.widget;

    if (FormPrefiller.isHttpUri(raw)) {
      // IRI : widget resolves its label via SPARQL (async, generation-guarded).
      this.pendingCount++;
      widget.resolveLabel(
        raw,
        (value) => {
          if (generation === this.generation) {
            // Fall back to the URI as label when none was resolved.
            const finalValue = value ?? {
              label: raw,
              criteria: { rdfTerm: { type: "uri", value: raw } },
            };
            widget.triggerRenderWidgetVal(finalValue);
          }
          this.onRawValueSettled();
        },
        (error) => {
          if (generation === this.generation) {
            console.error(
              `loadQueryFromCriteria: label resolution failed for "${variable}" (${raw}), using URI as label.`,
              error,
            );
            widget.triggerRenderWidgetVal({
              label: raw,
              criteria: { rdfTerm: { type: "uri", value: raw } },
            });
          }
          this.onRawValueSettled();
        },
      );
    } else {
      // Non-IRI : let the widget parse the raw value into its criteria.
      try {
        const criteria = widget.parseRawValue(raw);
        widget.triggerRenderWidgetVal(widget.buildValueFromCriteria(criteria));
      } catch (e) {
        console.error(
          `loadQueryFromCriteria: failed to parse value "${raw}" for "${variable}", skipping.`,
          e,
        );
      }
    }
  }

  // Called when one async IRI resolution finished ; settles when all are done.
  private onRawValueSettled(): void {
    this.pendingCount--;
    if (this.pendingCount <= 0) this.settleRawCriteria();
  }

  private settleRawCriteria(): void {
    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
    }
  }

  // True if the raw value is an HTTP(S) IRI (needs label resolution).
  private static isHttpUri(value: string): boolean {
    if (typeof value !== "string") return false;
    if (!/^https?:\/\//i.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
}
