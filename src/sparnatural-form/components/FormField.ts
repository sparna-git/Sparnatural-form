import {
  PredicateObjectPair,
  WidgetFactory,
  TermLabelledIri,
  TermLiteral,
  labelledCriteriaToFlatValues,
  labelledCriteriaToFilters,
} from "sparnatural";
import { SparnaturalFormI18n } from "../settings/SparnaturalFormI18n";
import { UnselectBtn } from "sparnatural";
import { SparnaturalQuery } from "sparnatural";
import { ISparnaturalSpecification } from "sparnatural";
import OptionalCriteriaManager from "./optionalCriteria/OptionalCriteriaManager";
import { AbstractWidget, ValueRepetition } from "sparnatural";
import { Binding } from "../FormStructure";
import tippy from "tippy.js";
import { I18nForm } from "../settings/I18nForm";

class FormField {
  private binding: Binding;
  private formContainer: HTMLElement;
  private specProvider: ISparnaturalSpecification;
  private query: SparnaturalQuery;
  private widgetFactory: WidgetFactory;
  private optionalCriteriaManager!: OptionalCriteriaManager; // Optional Criteria Manager instance

  constructor(
    binding: Binding,
    formContainer: HTMLElement,
    specProvider: ISparnaturalSpecification,
    query: SparnaturalQuery,
    widgetFactory: WidgetFactory,
  ) {
    this.binding = binding;
    this.formContainer = formContainer;
    this.specProvider = specProvider;
    this.query = query;
    this.widgetFactory = widgetFactory;
  }

  generateField(): void {
    const variable = this.binding.variable;

    // Create a container for the field
    const formFieldDiv = document.createElement("div");
    formFieldDiv.classList.add("formField");
    this.formContainer.appendChild(formFieldDiv);

    // Create a label for the widget
    const label = this.createLabel(variable);
    formFieldDiv.appendChild(label);

    // Initialize Tippy.js on the help icon
    setTimeout(() => {
      tippy(".help-icon", {
        allowHTML: true,
        theme: "sparnatural",
        arrow: false,
        placement: "right",
        animation: "scale-extreme",
        delay: [200, 200],
        duration: [200, 200],
      });
    }, 500);

    // Find the line in the query corresponding to the variable
    const pair =
      this.query.where.subType === "bgpSameSubject"
        ? this.findPredicateObjectPair(
            this.query.where.predicateObjectPairs,
            variable,
          )
        : null;

    if (!pair) return;

    if (pair) {
      const widget = this.createWidget(pair);
      formFieldDiv.appendChild(widget.html[0]);

      // Add options like "Any value" and "Not Exist"
      // This also initializes OptionalCriteriaManager
      this.addValuesAndOptions(formFieldDiv, pair, widget, variable);
    }
  }

  // Method to create a label with an SVG tooltip icon
  private createLabel(variable: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.setAttribute("for", variable);
    label.classList.add("form-label");

    // Get the field label
    const labelText = SparnaturalFormI18n.getLabel(variable);
    label.innerHTML = `<strong>${labelText}</strong>`;

    // Create an SVG help icon
    const helpIcon = document.createElement("span");
    helpIcon.classList.add("help-icon");
    helpIcon.setAttribute("tabindex", "0");

    helpIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512" fill="currentColor">
          <path d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zM262.655 90c-54.497 0-89.255 22.957-116.549 63.758-3.536 5.286-2.353 12.415 2.715 16.258l34.699 26.31c5.205 3.947 12.621 3.008 16.665-2.122 17.864-22.658 30.113-35.797 57.303-35.797 20.429 0 45.698 13.148 45.698 32.958 0 14.976-12.363 22.667-32.534 33.976C247.128 238.528 216 254.941 216 296v4c0 6.627 5.373 12 12 12h56c6.627 0 12-5.373 12-12v-1.333c0-28.462 83.186-29.647 83.186-106.667 0-58.002-60.165-102-116.531-102zM256 338c-25.365 0-46 20.635-46 46 0 25.364 20.635 46 46 46s46-20.636 46-46c0-25.365-20.635-46-46-46z"/>
      </svg>`;

    // Get the help text if it exists on form config
    const helpText = SparnaturalFormI18n.getHelp(variable);
    if (helpText) {
      helpIcon.setAttribute(
        "data-tippy-content",
        helpText.replace(/"/g, "&quot;"),
      );
      label.appendChild(helpIcon);
    }
    return label;
  }

  //method to find the line in the query corresponding to the variable
  private findPredicateObjectPair(
    pairs: PredicateObjectPair[],
    variable: string,
  ): PredicateObjectPair | null {
    for (const pair of pairs) {
      if (pair.object.variable.value === variable) {
        return pair;
      }
      if (pair.object.predicateObjectPairs) {
        const found = this.findPredicateObjectPair(
          pair.object.predicateObjectPairs,
          variable,
        );
        if (found) return found;
      }
    }
    return null;
  }

  private createWidget(pair: PredicateObjectPair): AbstractWidget {
    const subject = this.query.where.subject;
    const predicate = pair.predicate;
    const objectVar = pair.object.variable;

    const specEntity = this.specProvider.getEntity(subject.rdfType);
    const connectingProperty = this.specProvider.getProperty(predicate.value);

    const widget = this.widgetFactory.buildWidget(
      { variable: subject.value, type: specEntity.getId() },
      { variable: "predicate", type: connectingProperty.getId() },
      { variable: objectVar.value, type: objectVar.rdfType },
    );

    widget.render();
    return widget;
  }

  //methode to add values and options to the widget in the form
  private addValuesAndOptions(
    formFieldDiv: HTMLElement,
    pair: PredicateObjectPair,
    widget: AbstractWidget,
    variable: string,
  ): void {
    const valueDisplay = document.createElement("div");
    valueDisplay.id = `selected-value-${variable}`;
    valueDisplay.classList.add("value-display-container");
    valueDisplay.style.marginTop = "5px";
    formFieldDiv.appendChild(valueDisplay);

    const selectedValues = new Set<any>();

    // Initialiser avec les valeurs existantes (important)
    if (pair.object.values) {
      pair.object.values.forEach((v) => selectedValues.add(v));
    } else {
      pair.object.values = [];
    }

    // Initialiser avec les filtres existants (dates, nombres, etc.)
    if (pair.object.filters) {
      pair.object.filters.forEach((f) => selectedValues.add(f));
    } else {
      pair.object.filters = [];
    }

    const updateValueDisplay = () => {
      valueDisplay.innerHTML = "";

      selectedValues.forEach((val: any) => {
        const valueContainer = document.createElement("div");
        valueContainer.classList.add("selected-value-container");

        const valueLabel = document.createElement("span");
        // Get the label from _label (stored for display) or from the v13 GraphTerm directly
        const displayLabel = val._label ?? val.label ?? val.value ?? "Unknown";
        valueLabel.innerText = displayLabel;
        valueLabel.classList.add("selected-value-label");
        valueContainer.appendChild(valueLabel);

        const removeBtn = new UnselectBtn(widget, () => {
          selectedValues.delete(val);

          // Update pair.object.values with v13 GraphTerm format (without _label)
          pair.object.values = Array.from(selectedValues)
            .filter((v: any) => v.type === "term") // Only include GraphTerm values
            .map((v: any) => {
              const { _label, ...rest } = v;
              return rest;
            }) as any;

          // Update pair.object.filters with v13 LabelledFilter format (without _label)
          pair.object.filters = Array.from(selectedValues)
            .filter((v: any) => v.type === "labelledFilter") // Only include filters
            .map((v: any) => {
              const { _label, ...rest } = v;
              return rest;
            }) as any;

          updateValueDisplay();

          // reset widget inputs
          widget.html[0]
            .querySelectorAll("input")
            .forEach((input) => ((input as HTMLInputElement).value = ""));

          formFieldDiv.dispatchEvent(
            new CustomEvent("valueRemoved", {
              bubbles: true,
              detail: { value: val, variable },
            }),
          );

          this.optionalCriteriaManager?.updateOptionVisibility();
        }).render();

        valueContainer.appendChild(removeBtn.html[0]);
        valueDisplay.appendChild(valueContainer);
      });
    };

    updateValueDisplay();

    // Listener venant du widget Sparnatural
    // e.detail is directly the v1 LabelledCriteria format: { label: "...", criteria: { rdfTerm: {...} } } or { label: "...", criteria: { start: "...", stop: "..." } }
    widget.html[0].addEventListener("renderWidgetVal", (e: CustomEvent) => {
      if (!e.detail) {
        console.warn(
          "Unexpected widget value format - e.detail is undefined",
          e.detail,
        );
        return;
      }

      // Normalize to array - e.detail is the v1 LabelledCriteria directly
      const v1Values = Array.isArray(e.detail) ? e.detail : [e.detail];

      // Filter valid v1 LabelledCriteria values (must have label)
      const validV1Values = v1Values.filter(
        (val: any) => val && val.label !== undefined,
      );

      if (validV1Values.length === 0) {
        console.warn("No valid v1 values found", v1Values);
        return;
      }

      validV1Values.forEach((v1Val: any) => {
        const isSingle = widget.valueRepetition === ValueRepetition.SINGLE;

        if (isSingle && selectedValues.size > 0) {
          let warning = formFieldDiv.querySelector(
            ".single-value-warning",
          ) as HTMLElement;

          if (!warning) {
            warning = document.createElement("div");
            warning.classList.add("single-value-warning");
            warning.innerText = I18nForm.labels["messageSingleValue"];
            warning.style.color = "red";
            warning.style.fontSize = "13px";
            formFieldDiv.insertBefore(warning, valueDisplay);

            setTimeout(() => warning.remove(), 5000);
          }
          return;
        }

        // Check if already exists by label
        const alreadyExists = Array.from(selectedValues).some(
          (v: any) => v._label === v1Val.label,
        );

        if (!alreadyExists) {
          // Use adapter functions to convert v1 to v13
          // Try to convert as flat values (rdfTerm - URIs/literals)
          const flatValues = labelledCriteriaToFlatValues([v1Val]);
          // Try to convert as filters (date, number, search, map)
          const filters = labelledCriteriaToFilters([v1Val]);

          if (flatValues.length > 0) {
            // It's an rdfTerm value - add to values
            const v13Value = flatValues[0];
            const valueWithLabel = { ...v13Value, _label: v1Val.label };
            selectedValues.add(valueWithLabel);

            // Update pair.object.values with v13 GraphTerm format (without _label)
            pair.object.values = Array.from(selectedValues)
              .filter((v: any) => v.type === "term") // Only include GraphTerm values
              .map((v: any) => {
                const { _label, ...rest } = v;
                return rest;
              }) as any;

            updateValueDisplay();

            formFieldDiv.dispatchEvent(
              new CustomEvent("valueAdded", {
                bubbles: true,
                detail: { value: v13Value, variable },
              }),
            );

            this.optionalCriteriaManager?.updateOptionVisibility();
          } else if (filters.length > 0) {
            // It's a filter (date, number, search, map) - add to filters
            const v13Filter = filters[0];
            const filterWithLabel = { ...v13Filter, _label: v1Val.label };
            selectedValues.add(filterWithLabel);

            // Update pair.object.filters with v13 LabelledFilter format (without _label)
            if (!pair.object.filters) {
              pair.object.filters = [];
            }
            pair.object.filters = Array.from(selectedValues)
              .filter((v: any) => v.type === "labelledFilter") // Only include filters
              .map((v: any) => {
                const { _label, ...rest } = v;
                return rest;
              }) as any;

            updateValueDisplay();

            formFieldDiv.dispatchEvent(
              new CustomEvent("valueAdded", {
                bubbles: true,
                detail: { value: v13Filter, variable },
              }),
            );

            this.optionalCriteriaManager?.updateOptionVisibility();
          }
        }
      });
    });

    // Initialisation du manager OPTIONAL v13
    this.optionalCriteriaManager = new OptionalCriteriaManager(
      this.query,
      variable,
      pair.object,
      widget,
      formFieldDiv,
    );
  }
}
export default FormField;
