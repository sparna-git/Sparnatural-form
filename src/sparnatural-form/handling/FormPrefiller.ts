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
      // A variable can carry several values for a multi-value field : the widget
      // takes the array as is and the field injects the values one by one.
      const list = (Array.isArray(value) ? value : [value]).filter(
        (v) => v && v.criteria,
      );
      if (list.length === 0) {
        console.warn(
          `loadQuery: invalid value for variable "${variable}", skipping`,
          value,
        );
        return;
      }

      field.widget.triggerRenderWidgetVal(
        list.length === 1 ? list[0] : list,
      );
    });
  }

  // Resets then asks each field's widget to resolve/parse its raw value.
  private applyRawCriteria(values: RawQueryValues): void {
    console.log("Applying raw criteria:", values);

    this.clearAllFields();
    const generation = ++this.generation;

    // "done" promise for this prefill ; resolved when pendingCount hits 0.
    // Reuse the resolver set up by the queued path, otherwise make a fresh one.
    // Starts at 1 : that guard keeps the promise pending while the loop below is
    // still queueing values (widgets may call back synchronously), and is
    // released right after the loop.
    this.pendingCount = 1;
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

    // Every value is queued : release the guard (settles now if nothing is left).
    this.onRawValueSettled(generation);
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

  // Applies one raw value to a field, handling the UNKNOWN/ANY keywords. The
  // widget itself turns the raw value into a criteria (parsing it or resolving
  // its label) ; we only track when each value has settled.
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

    // Ask the widget to build the value : it knows whether it holds URIs (label
    // resolved via SPARQL, async) or literals (parsed locally, synchronous).
    // Late callbacks from an older prefill are dropped by the generation guard.
    this.pendingCount++;
    widget.buildValueFromRawValue(
      raw,
      (value) => {
        if (generation === this.generation) {
          widget.triggerRenderWidgetVal(value);
        }
        this.onRawValueSettled(generation);
      },
      (error) => {
        console.error(
          `loadQueryFromCriteria: could not apply value "${raw}" to "${variable}", skipping.`,
          error,
        );
        this.onRawValueSettled(generation);
      },
    );
  }

  // Called when one value has been applied ; settles when all are done.
  // Callbacks from a superseded prefill must not decrement the current count.
  private onRawValueSettled(generation: number): void {
    if (generation !== this.generation) return;
    this.pendingCount--;
    if (this.pendingCount <= 0) this.settleRawCriteria();
  }

  private settleRawCriteria(): void {
    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
    }
  }
}
