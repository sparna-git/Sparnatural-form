import { AbstractWidget } from "sparnatural";
import {
  SparnaturalQuery,
  PredicateObjectPair,
  ObjectCriteria,
  labelledCriteriaToFlatValues,
  labelledCriteriaToFilters,
} from "sparnatural";
import { I18nForm } from "../../settings/I18nForm";

class OptionalCriteriaManager {
  private initialOptionalStates: { [variable: string]: any } = {};
  private objectCriteria: ObjectCriteria;

  // Store references to elements for reuse
  private anyValueToggle!: HTMLInputElement;
  private notExistToggle!: HTMLInputElement;
  private anydiv!: HTMLDivElement;
  private notExistDiv!: HTMLDivElement;

  constructor(
    private query: SparnaturalQuery, // The entire query structure
    private variable: string, // The variable associated with this field
    objectCriteria: ObjectCriteria, // The specific object criteria for this field (v13)
    private widget: AbstractWidget, // The widget associated with this field
    private formFieldDiv: HTMLElement, // The container for the form field
  ) {
    this.objectCriteria = objectCriteria;
    this.saveInitialOptionalState(this.query.where.predicateObjectPairs); // Save initial states for optional flags
    this.createOptionContainer(); // Create the UI for "Any value" and "Not Exist" options
  }

  /**
   * Saves the initial state of optional and notExist flags for each pair.
   */
  private saveInitialOptionalState(
    pairs: PredicateObjectPair[],
    parentOptionalChain: boolean[] = [],
  ) {
    const saveState = (
      pairList: PredicateObjectPair[],
      currentParentChain: boolean[],
    ) => {
      pairList.forEach((pair: PredicateObjectPair) => {
        const pairVariable = pair.object?.variable?.value;
        const isOptional = pair.subType === "optional";
        const isNotExists = pair.subType === "notExists";
        const currentChain = [...currentParentChain, isOptional];

        const pairState: any = {
          optional: isOptional,
          notExists: isNotExists,
          subType: pair.subType,
          parentOptionalChain: currentChain,
          children: pair.object.predicateObjectPairs
            ? saveState(pair.object.predicateObjectPairs, currentChain)
            : [],
        };

        if (pairVariable) {
          this.initialOptionalStates[pairVariable] = pairState;
        }
      });
    };

    saveState(pairs, parentOptionalChain);
  }

  /**
   * Updates the visibility and enabled state of "Any value" and "Not Exist" options.
   */
  public updateOptionVisibility() {
    const hasValues =
      (this.objectCriteria.values && this.objectCriteria.values.length > 0) ||
      (this.objectCriteria.filters && this.objectCriteria.filters.length > 0);

    // Ensure elements exist before updating them
    if (!this.anydiv || !this.notExistDiv) {
      console.warn(
        `Optional elements not created for variable: ${this.variable}`,
      );
      return; // Exit if no options are created
    }

    if (hasValues) {
      // Hide and disable options if the widget has values
      if (this.anyValueToggle) {
        this.anyValueToggle.checked = false;
        this.anyValueToggle.disabled = true;
      }
      if (this.notExistToggle) {
        this.notExistToggle.checked = false;
        this.notExistToggle.disabled = true;
      }
      this.anydiv.style.display = "none";
      this.notExistDiv.style.display = "none";
    } else {
      // Show and enable options if the widget has no values
      if (this.anyValueToggle) {
        this.anyValueToggle.disabled = false;
      }
      if (this.notExistToggle) {
        this.notExistToggle.disabled = false;
      }
      this.anydiv.style.display = "block";
      this.notExistDiv.style.display = "block";
    }
  }

  /**
   * Creates the UI container for "Any value" and "Not Exist" options.
   */
  private createOptionContainer() {
    // Check if an option container already exists
    const existingOptionContainer =
      this.formFieldDiv.querySelector(".option-container");
    if (existingOptionContainer) {
      // Remove the existing container to avoid duplicates
      this.formFieldDiv.removeChild(existingOptionContainer);
    }

    // Find the pair and its parent
    const pair = this.findPair(this.query.where.predicateObjectPairs);
    const pairParent = this.findPairParent(
      this.query.where.predicateObjectPairs,
    );

    // Check if either the pair or its parent is optional
    const isOptional = pair?.subType === "optional";
    const isParentOptional = pairParent?.subType === "optional";
    const shouldCreateOptions = isOptional || isParentOptional;

    if (!shouldCreateOptions) {
      // If neither the pair nor its parent is optional, skip creating options
      console.log(`Skipping option creation for variable: ${this.variable}`);
      return;
    }

    const optionContainer = document.createElement("div");
    optionContainer.classList.add("option-container");

    this.anydiv = document.createElement("div");
    this.anydiv.classList.add("any-value-container");
    this.anyValueToggle = document.createElement("input");
    this.notExistDiv = document.createElement("div");
    this.notExistDiv.classList.add("not-exist-container");
    this.notExistToggle = document.createElement("input");

    // Add "Any value" toggle
    const anyValueLabel = document.createElement("label");
    this.anyValueToggle.type = "checkbox";
    this.anyValueToggle.id = `any-value-${this.variable}`;
    this.anyValueToggle.classList.add("any-value-toggle");
    anyValueLabel.htmlFor = `any-value-${this.variable}`;
    anyValueLabel.innerHTML = `&nbsp;${I18nForm.labels["AnyValue"]}`;
    this.anydiv.appendChild(this.anyValueToggle);
    this.anydiv.appendChild(anyValueLabel);
    optionContainer.appendChild(this.anydiv);

    // Add "Not Exist" toggle
    const notExistLabel = document.createElement("label");
    this.notExistToggle.type = "checkbox";
    this.notExistToggle.id = `not-value-${this.variable}`;
    this.notExistToggle.classList.add("any-value-toggle");
    notExistLabel.htmlFor = `not-value-${this.variable}`;
    notExistLabel.innerHTML = `&nbsp;${I18nForm.labels["NotExist"]}`;
    this.notExistDiv.appendChild(this.notExistToggle);
    this.notExistDiv.appendChild(notExistLabel);
    optionContainer.appendChild(this.notExistDiv);

    this.formFieldDiv.appendChild(optionContainer);

    // Attach event listeners for toggles
    this.attachToggleListeners();
  }

  private attachToggleListeners() {
    // Handle "Any Value" toggle changes
    this.anyValueToggle.addEventListener("change", () => {
      if (this.anyValueToggle.checked) {
        // Suppression du conteneur d'options
        this.removeOptionContainer();

        this.setAnyValueForWidget(this.variable);
        this.notExistDiv.style.display = "none";
        this.notExistToggle.checked = false;
        this.notExistToggle.disabled = true;
        this.widget.disableWidget();

        // Créer une "pill" pour Any Value
        const pill = document.createElement("div");
        pill.className = "option-pill any-value";
        pill.textContent = `${I18nForm.labels["AnyValue"]}`;

        // Bouton de suppression (croix)
        const unselectBtn = document.createElement("span");
        unselectBtn.className = "unselect";
        unselectBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M175 175C184.4 165.7 199.6 165.7 208.1 175L255.1 222.1L303 175C312.4 165.7 327.6 165.7 336.1 175C346.3 184.4 346.3 199.6 336.1 208.1L289.9 255.1L336.1 303C346.3 312.4 346.3 327.6 336.1 336.1C327.6 346.3 312.4 346.3 303 336.1L255.1 289.9L208.1 336.1C199.6 346.3 184.4 346.3 175 336.1C165.7 327.6 165.7 312.4 175 303L222.1 255.1L175 208.1C165.7 199.6 165.7 184.4 175 175V175zM512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256zM256 48C141.1 48 48 141.1 48 256C48 370.9 141.1 464 256 464C370.9 464 464 370.9 464 256C464 141.1 370.9 48 256 48z"/></svg>`;
        unselectBtn.addEventListener("click", () => {
          // Désélectionnez l'option Any Value
          this.anyValueToggle.checked = false;
          this.anyValueToggle.dispatchEvent(new Event("change"));
        });

        pill.appendChild(unselectBtn);
        this.formFieldDiv.appendChild(pill);

        this.formFieldDiv.dispatchEvent(
          new CustomEvent("anyValueSelected", {
            bubbles: true,
            detail: { variable: this.variable },
          }),
        );
      } else {
        this.resetToDefaultValueForWidget(this.variable);
        this.notExistToggle.disabled = false;
        this.notExistDiv.style.display = "block";
        this.widget.enableWidget();

        // Supprimer le pill associé à "Any Value"
        this.removePill("any-value");

        // Recréer le conteneur des options
        this.createOptionContainer();

        this.formFieldDiv.dispatchEvent(
          new CustomEvent("removeAnyValueOption", {
            bubbles: true,
            detail: { variable: this.variable },
          }),
        );
      }
    });

    // Handle "Not Exist" toggle changes
    this.notExistToggle.addEventListener("change", () => {
      if (this.notExistToggle.checked) {
        // Suppression du conteneur d'options
        this.removeOptionContainer();

        this.setNotExistsForWidget(this.variable);
        this.anyValueToggle.checked = false;
        this.anyValueToggle.disabled = true;
        this.anydiv.style.display = "none";
        this.widget.disableWidget();

        // Créer une "pill" pour Not Exist
        const pill = document.createElement("div");
        pill.className = "option-pill not-exist";
        pill.textContent = `${I18nForm.labels["NotExist"]}`;

        // Bouton de suppression (croix)
        const unselectBtn = document.createElement("span");
        unselectBtn.className = "unselect";
        unselectBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M175 175C184.4 165.7 199.6 165.7 208.1 175L255.1 222.1L303 175C312.4 165.7 327.6 165.7 336.1 175C346.3 184.4 346.3 199.6 336.1 208.1L289.9 255.1L336.1 303C346.3 312.4 346.3 327.6 336.1 336.1C327.6 346.3 312.4 346.3 303 336.1L255.1 289.9L208.1 336.1C199.6 346.3 184.4 346.3 175 336.1C165.7 327.6 165.7 312.4 175 303L222.1 255.1L175 208.1C165.7 199.6 165.7 184.4 175 175V175zM512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256zM256 48C141.1 48 48 141.1 48 256C48 370.9 141.1 464 256 464C370.9 464 464 370.9 464 256C464 141.1 370.9 48 256 48z"/></svg>`;
        unselectBtn.addEventListener("click", () => {
          // Désélectionnez l'option Not Exist
          this.notExistToggle.checked = false;
          this.notExistToggle.dispatchEvent(new Event("change"));
        });

        pill.appendChild(unselectBtn);
        this.formFieldDiv.appendChild(pill);

        this.formFieldDiv.dispatchEvent(
          new CustomEvent("notExist", {
            bubbles: true,
            detail: { variable: this.variable },
          }),
        );
      } else {
        this.removeNotExistsForWidget(this.variable);
        this.anyValueToggle.disabled = false;
        this.anydiv.style.display = "block";
        this.widget.enableWidget();

        // Supprimer le pill associé à "Not Exist"
        this.removePill("not-exist");

        // Recréer le conteneur des options
        this.createOptionContainer();

        this.formFieldDiv.dispatchEvent(
          new CustomEvent("removeNotExistOption", {
            bubbles: true,
            detail: { variable: this.variable },
          }),
        );
      }
    });
  }

  /**
   * Supprime le conteneur d'options pour éviter les duplications.
   */
  private removeOptionContainer() {
    const existingContainer =
      this.formFieldDiv.querySelector(".option-container");
    if (existingContainer) {
      existingContainer.remove();
    }
  }

  /**
   * Supprime un pill existant pour éviter les doublons.
   * @param type Le type de pill à supprimer (e.g., "any-value" ou "not-exist").
   */
  private removePill(type: string) {
    const existingPill = this.formFieldDiv.querySelector(
      `.option-pill.${type}`,
    );
    if (existingPill) {
      existingPill.remove();
    }
  }

  private findPair(pairs: PredicateObjectPair[]): PredicateObjectPair | null {
    for (const pair of pairs) {
      if (pair.object.variable.value === this.variable) return pair;
      if (
        pair.object.predicateObjectPairs &&
        pair.object.predicateObjectPairs.length > 0
      ) {
        const result = this.findPair(pair.object.predicateObjectPairs);
        if (result) return result;
      }
    }
    return null;
  }

  private findPairParent(
    pairs: PredicateObjectPair[],
  ): PredicateObjectPair | null {
    for (const pair of pairs) {
      if (
        pair.object.predicateObjectPairs &&
        pair.object.predicateObjectPairs.length > 0
      ) {
        // Check if any child has the target variable
        const hasTargetChild = pair.object.predicateObjectPairs.some(
          (child: PredicateObjectPair) =>
            child.object.variable.value === this.variable,
        );
        if (hasTargetChild) return pair;

        // Continue searching in nested pairs
        const result = this.findPairParent(pair.object.predicateObjectPairs);
        if (result) return result;
      }
    }
    return null;
  }

  public setAnyValueForWidget(variable: string) {
    console.log(`Setting "Any value" for variable: ${variable}`);
    const adjustOptionalFlags = (
      pairs: PredicateObjectPair[],
      targetVariable: string,
    ) => {
      pairs.forEach((pair: PredicateObjectPair) => {
        const pairVariable = pair.object.variable.value;
        if (pairVariable === targetVariable && pair.subType === "optional") {
          console.log(
            `Removing "optional" subType for variable: ${targetVariable}`,
          );
          delete pair.subType;
        }
        if (
          pair.object.predicateObjectPairs &&
          pair.object.predicateObjectPairs.length > 0
        ) {
          const childHasTargetVariable = pair.object.predicateObjectPairs.some(
            (child: PredicateObjectPair) =>
              child.object.variable.value === targetVariable,
          );
          if (childHasTargetVariable && pair.subType === "optional") {
            console.log(
              `Removing "optional" subType for parent of variable: ${targetVariable}`,
            );
            delete pair.subType;
          }
          adjustOptionalFlags(pair.object.predicateObjectPairs, targetVariable);
        }
      });
    };
    adjustOptionalFlags(this.query.where.predicateObjectPairs, variable);
  }

  public resetToDefaultValueForWidget(variable: string) {
    console.log(`Resetting to default state for variable: ${variable}`);

    const restoreInitialState = (
      pairs: PredicateObjectPair[],
      targetVariable: string,
    ) => {
      pairs.forEach((pair: PredicateObjectPair) => {
        if (pair.object?.variable?.value === targetVariable) {
          const initialState = this.initialOptionalStates[targetVariable];
          if (initialState) {
            // Restore subType based on initial state
            if (initialState.optional) {
              pair.subType = "optional";
            } else if (initialState.notExists) {
              pair.subType = "notExists";
            } else {
              delete pair.subType;
            }
            this.restoreParentOptionalChain(
              pair,
              initialState.parentOptionalChain,
            );
          }
        }
        if (
          pair.object.predicateObjectPairs &&
          pair.object.predicateObjectPairs.length > 0
        ) {
          restoreInitialState(pair.object.predicateObjectPairs, targetVariable);
        }
      });
    };

    restoreInitialState(this.query.where.predicateObjectPairs, variable);
  }

  private restoreParentOptionalChain(
    pair: PredicateObjectPair,
    parentOptionalChain: boolean[],
  ) {
    let currentPair = pair;
    for (let i = parentOptionalChain.length - 1; i >= 0; i--) {
      const parentOptional = parentOptionalChain[i];
      if (currentPair) {
        if (parentOptional) {
          currentPair.subType = "optional";
        } else {
          delete currentPair.subType;
        }
        currentPair = this.findParentPair(
          this.query.where.predicateObjectPairs,
          currentPair.object.variable.value,
        );
      }
    }
  }

  private findParentPair(
    pairs: PredicateObjectPair[],
    childVariable: string,
  ): PredicateObjectPair | null {
    for (const pair of pairs) {
      if (
        pair.object.predicateObjectPairs &&
        pair.object.predicateObjectPairs.some(
          (child: PredicateObjectPair) =>
            child.object.variable.value === childVariable,
        )
      ) {
        return pair;
      }
      if (
        pair.object.predicateObjectPairs &&
        pair.object.predicateObjectPairs.length > 0
      ) {
        const foundParent = this.findParentPair(
          pair.object.predicateObjectPairs,
          childVariable,
        );
        if (foundParent) {
          return foundParent;
        }
      }
    }
    return null;
  }

  public setNotExistsForWidget(variable: string) {
    console.log(`Setting "notExists" for variable: ${variable}`);

    const addNotExistsFlag = (
      pairs: PredicateObjectPair[],
      targetVariable: string,
    ) => {
      pairs.forEach((pair: PredicateObjectPair) => {
        if (pair.object?.variable?.value === targetVariable) {
          console.log(
            `Adding "notExists" subType for variable: ${targetVariable}`,
          );
          pair.subType = "notExists";
        }
        if (
          pair.object.predicateObjectPairs &&
          pair.object.predicateObjectPairs.length > 0
        ) {
          addNotExistsFlag(pair.object.predicateObjectPairs, targetVariable);
        }
      });
    };

    const adjustParentOptionalFlags = (
      pairs: PredicateObjectPair[],
      targetVariable: string,
    ) => {
      pairs.forEach((pair: PredicateObjectPair) => {
        if (pair.object.predicateObjectPairs) {
          const childHasTargetVariable = pair.object.predicateObjectPairs.some(
            (child: PredicateObjectPair) =>
              child.object.variable.value === targetVariable,
          );
          if (childHasTargetVariable && pair.subType === "optional") {
            console.log(
              `Removing "optional" subType for parent of variable: ${targetVariable}`,
            );
            delete pair.subType;
          }
          if (pair.object.predicateObjectPairs.length > 0) {
            adjustParentOptionalFlags(
              pair.object.predicateObjectPairs,
              targetVariable,
            );
          }
        }
      });
    };

    addNotExistsFlag(this.query.where.predicateObjectPairs, variable);
    adjustParentOptionalFlags(this.query.where.predicateObjectPairs, variable);
  }

  public removeNotExistsForWidget(variable: string) {
    console.log(`Removing "notExists" for variable: ${variable}`);

    const removeNotExistsFlag = (
      pairs: PredicateObjectPair[],
      targetVariable: string,
    ) => {
      pairs.forEach((pair: PredicateObjectPair) => {
        if (pair.object?.variable?.value === targetVariable) {
          delete pair.subType;
          const initialState = this.initialOptionalStates[targetVariable];
          if (initialState) {
            if (initialState.optional) {
              pair.subType = "optional";
            }
            this.restoreParentOptionalChain(
              pair,
              initialState.parentOptionalChain,
            );
          }
        }
        if (
          pair.object.predicateObjectPairs &&
          pair.object.predicateObjectPairs.length > 0
        ) {
          removeNotExistsFlag(pair.object.predicateObjectPairs, targetVariable);
        }
      });
    };
    removeNotExistsFlag(this.query.where.predicateObjectPairs, variable);
  }
}

export default OptionalCriteriaManager;
