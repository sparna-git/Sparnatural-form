import { FieldHandle } from "../components/FormField";
import { FlatQueryValues, RawQueryValues } from "../FormStructure";

export class FormPrefiller {
  private fieldRegistry: Map<string, FieldHandle>;

  // Values requested before the form was rendered, applied in applyPending().
  private pendingPrefill: FlatQueryValues | null = null;
  private pendingRawCriteria: RawQueryValues | null = null;

  // Bumped on every apply*(); late async resolutions of an older generation are ignored.
  private generation = 0;

  constructor(fieldRegistry: Map<string, FieldHandle>) {
    this.fieldRegistry = fieldRegistry;
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

    // Not rendered yet : queue and apply in applyPending().
    if (this.fieldRegistry.size === 0) {
      this.pendingRawCriteria = values;
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
      const field = this.fieldRegistry.get(variable);
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

    Object.entries(values).forEach(([variable, raw]) => {
      const field = this.fieldRegistry.get(variable);
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
        this.applyRawValue(field.widget, variable, value, generation);
      });
    });
  }

  // Applies one raw value to a widget, resolving IRIs or parsing literals.
  private applyRawValue(
    widget: FieldHandle["widget"],
    variable: string,
    raw: string,
    generation: number,
  ): void {
    if (raw == null || raw === "") {
      return;
    }

    if (FormPrefiller.isHttpUri(raw)) {
      // IRI : widget resolves its label via SPARQL (async, generation-guarded).
      widget.resolveLabel(
        raw,
        (value) => {
          if (generation !== this.generation) return;
          // Fall back to the URI as label when none was resolved.
          const finalValue = value ?? {
            label: raw,
            criteria: { rdfTerm: { type: "uri", value: raw } },
          };
          widget.triggerRenderWidgetVal(finalValue);
        },
        (error) => {
          if (generation !== this.generation) return;
          console.error(
            `loadQueryFromCriteria: label resolution failed for "${variable}" (${raw}), using URI as label.`,
            error,
          );
          widget.triggerRenderWidgetVal({
            label: raw,
            criteria: { rdfTerm: { type: "uri", value: raw } },
          });
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
