import {
  AbstractWidget,
  Branch,
  CriteriaLine,
  SparnaturalQueryIfc,
} from "sparnatural";
import { I18nForm } from "../../settings/I18nForm";

class OptionalCriteriaManager {
  private initialOptionalStates: { [variable: string]: any } = {};
  private queryLine: CriteriaLine;

  // Store references to elements for reuse
  private anyValueToggle!: HTMLInputElement;
  private notExistToggle!: HTMLInputElement;
  private anydiv!: HTMLDivElement;
  private notExistDiv!: HTMLDivElement;

  constructor(
    private query: SparnaturalQueryIfc, // The entire query structure
    private variable: string, // The variable associated with this field
    queryline: CriteriaLine, // The specific query line for this field
    private widget: AbstractWidget, // The widget associated with this field
    private formFieldDiv: HTMLElement, // The container for the form field
  ) {
    this.queryLine = queryline;
    this.saveInitialOptionalState(this.query.branches); // Save initial states for optional flags
    this.createOptionContainer(); // Create the UI for "Any value" and "Not Exist" options
    // Listen to valueAdded/valueRemoved events dispatched by FormField
    this.formFieldDiv.addEventListener("valueAdded", (e: CustomEvent) => {
      // when a value is added from outside, ensure optional flags cleared
      const branch = this.findBranchByVariable(
        this.query.branches,
        this.variable,
      );
      if (branch) {
        this.clearOptionalChain(this.variable);
      }
      this.updateOptionVisibility();
    });
    this.formFieldDiv.addEventListener("valueRemoved", (e: CustomEvent) => {
      // when a value is removed, if no values left restore initial state
      // BUT only if we're not in notExists or anyValue mode
      // Check notExists on the correct optional ancestor, not on this.variable directly
      const optionalAncestorVar = this.findOptionalAncestorVariable(
        this.variable,
      );
      const targetVar = optionalAncestorVar || this.variable;
      const targetBranch = this.findBranchByVariable(
        this.query.branches,
        targetVar,
      );
      const isNotExistsActive = targetBranch?.notExists === true;
      const isAnyValueActive = this.anyValueToggle?.checked === true;

      if (
        !isNotExistsActive &&
        !isAnyValueActive &&
        (!this.queryLine.criterias || this.queryLine.criterias.length === 0)
      ) {
        this.resetToDefaultValueForWidget(this.variable);
      }
      this.updateOptionVisibility();
    });
  }

  /**
   * Saves the initial state of optional and notExist flags for each branch.
   */
  private saveInitialOptionalState(
    queryBranches: Branch[],
    parentOptionalChain: boolean[] = [],
  ) {
    const saveState = (branches: Branch[], currentParentChain: boolean[]) => {
      branches.forEach((branch: Branch) => {
        const branchVariable = branch.line?.o;
        const currentChain = [...currentParentChain, branch.optional || false];

        const branchState: any = {
          optional: branch.optional,
          notExists: branch.notExists || false,
          parentOptionalChain: currentChain,
          children: branch.children
            ? saveState(branch.children, currentChain)
            : [],
        };

        if (branchVariable) {
          this.initialOptionalStates[branchVariable] = branchState;
        }
      });
    };

    saveState(queryBranches, parentOptionalChain);
  }

  /**
   * Updates the visibility and enabled state of "Any value" and "Not Exist" options.
   */

  public updateOptionVisibility() {
    const hasValues =
      this.queryLine.criterias && this.queryLine.criterias.length > 0;

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
   *
   *
   */

  private createOptionContainer() {
    // Check if an option container already exists
    const existingOptionContainer =
      this.formFieldDiv.querySelector(".option-container");
    if (existingOptionContainer) {
      // Remove the existing container to avoid duplicates
      this.formFieldDiv.removeChild(existingOptionContainer);
    }

    // Find the branch
    const branch = this.findBranch(this.query.branches);

    // Log branch for debugging
    console.log(`createOptionContainer: variable=${this.variable}`);
    console.log(`  branch:`, branch);

    // Check if either the branch itself is optional, or any ancestor is optional
    const shouldCreateOptions =
      branch?.optional || this.hasOptionalAncestor(this.variable);
    console.log(`  shouldCreateOptions=${shouldCreateOptions}`);

    if (!shouldCreateOptions) {
      // If neither the branch nor any ancestor is optional, skip creating options
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

  /**
   * Remonte toute la chaîne des ancêtres pour vérifier si au moins un est optional.
   */
  private hasOptionalAncestor(variable: string): boolean {
    let current = variable;
    let parent = this.findParentBranch(this.query.branches, current);
    while (parent) {
      if (parent.optional) {
        return true;
      }
      current = parent.line.o;
      parent = this.findParentBranch(this.query.branches, current);
    }
    return false;
  }

  /**
   * Trouve l'ancêtre le plus proche qui était initialement optional.
   * Si la branche elle-même était optional, retourne sa variable.
   * Sinon remonte la chaîne des parents via les états initiaux.
   */
  private findOptionalAncestorVariable(variable: string): string | null {
    // D'abord vérifier si la branche elle-même était optional initialement
    const initialState = this.initialOptionalStates[variable];
    if (initialState?.optional) {
      return variable;
    }

    // Sinon remonter la chaîne des parents
    let current = variable;
    let parent = this.findParentBranch(this.query.branches, current);
    while (parent) {
      const parentVar = parent.line.o;
      const parentInitialState = this.initialOptionalStates[parentVar];
      if (parentInitialState?.optional) {
        return parentVar;
      }
      current = parentVar;
      parent = this.findParentBranch(this.query.branches, current);
    }
    return null;
  }

  private attachToggleListeners() {
    // Handle "Any Value" toggle changes
    this.anyValueToggle.addEventListener("change", () => {
      console.log(
        `anyValueToggle change for ${this.variable}: checked=${this.anyValueToggle.checked}`,
      );
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
      console.log(
        `notExistToggle change for ${this.variable}: checked=${this.notExistToggle.checked}`,
      );
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

  private findBranchByVariable(
    branches: Branch[],
    variable: string,
  ): Branch | null {
    for (const branch of branches) {
      if (branch.line && branch.line.o === variable) return branch;
      if (branch.children && branch.children.length > 0) {
        const result = this.findBranchByVariable(branch.children, variable);
        if (result) return result;
      }
    }
    return null;
  }

  private clearOptionalChain(variable: string) {
    const branch = this.findBranchByVariable(this.query.branches, variable);
    if (!branch) return;
    branch.optional = false;
    let parent = this.findParentBranch(this.query.branches, branch.line.o);
    while (parent) {
      parent.optional = false;
      parent = this.findParentBranch(this.query.branches, parent.line.o);
    }
  }

  private findBranch(branches: Branch[]): Branch | null {
    for (const branch of branches) {
      if (branch.line.o === this.variable) return branch;
      if (branch.children && branch.children.length > 0) {
        const result = this.findBranch(branch.children);
        if (result) return result;
      }
    }
    return null;
  }

  private findBranchParent(branches: Branch[]): Branch | any {
    for (const branch of branches) {
      if (branch.children && branch.children.length > 0) {
        const result = this.findBranch(branch.children);
        if (result) return branch;
      }
    }
    return false;
  }

  /**
   * Sets "Any value" for a widget variable.
   * Removes optional on the correct ancestor that initially carried optional:true,
   * then continues up the chain.
   */
  public setAnyValueForWidget(variable: string) {
    console.log(`Setting "Any value" for variable: ${variable}`);

    // Trouver l'ancêtre qui porte le optional:true initial
    const optionalAncestorVar = this.findOptionalAncestorVariable(variable);

    if (optionalAncestorVar) {
      const ancestorBranch = this.findBranchByVariable(
        this.query.branches,
        optionalAncestorVar,
      );
      if (ancestorBranch) {
        console.log(
          `Removing "optional: true" on optional ancestor: ${optionalAncestorVar}`,
        );
        delete ancestorBranch.optional;
      }
    }

    // Remonter toute la chaîne au-delà de l'ancêtre optional
    let current = optionalAncestorVar || variable;
    let parent = this.findParentBranch(this.query.branches, current);
    while (parent) {
      if (parent.optional) {
        console.log(
          `Removing "optional: true" for ancestor above: ${parent.line.o}`,
        );
        delete parent.optional;
      }
      current = parent.line.o;
      parent = this.findParentBranch(this.query.branches, current);
    }
  }

  /**
   * Resets the branch and its ancestor chain to their initial optional states.
   */
  public resetToDefaultValueForWidget(variable: string) {
    console.log(`Resetting to default state for variable: ${variable}`);

    const restoreInitialState = (
      branches: Branch[],
      targetVariable: string,
    ) => {
      branches.forEach((branch: Branch) => {
        if (branch.line && branch.line.o === targetVariable) {
          const initialState = this.initialOptionalStates[targetVariable];
          if (initialState) {
            branch.optional = initialState.optional;
            branch.notExists = initialState.notExists;
            this.restoreParentOptionalChain(
              branch,
              initialState.parentOptionalChain,
            );
          }
        }
        if (branch.children && branch.children.length > 0) {
          restoreInitialState(branch.children, targetVariable);
        }
      });
    };

    restoreInitialState(this.query.branches, variable);
  }

  private restoreParentOptionalChain(
    branch: Branch,
    parentOptionalChain: boolean[],
  ) {
    let currentBranch = branch;
    for (let i = parentOptionalChain.length - 1; i >= 0; i--) {
      const parentOptional = parentOptionalChain[i];
      if (currentBranch) {
        currentBranch.optional = parentOptional;
        currentBranch = this.findParentBranch(
          this.query.branches,
          currentBranch.line.o,
        );
      }
    }
  }

  private findParentBranch(
    branches: Branch[],
    childVariable: string,
  ): Branch | null {
    for (const branch of branches) {
      if (
        branch.children &&
        branch.children.some((child: Branch) => child.line.o === childVariable)
      ) {
        return branch;
      }
      if (branch.children && branch.children.length > 0) {
        const foundParent = this.findParentBranch(
          branch.children,
          childVariable,
        );
        if (foundParent) {
          return foundParent;
        }
      }
    }
    return null;
  }

  /**
   * Sets "notExists" for a widget variable.
   * Places notExists:true on the correct ancestor that initially carried optional:true,
   * not on the descendant branch itself.
   *
   * Exemple : Instruction_2 (optional:true) → Juridiction_2 → LegalStatus
   * Si on clique "N'existe pas" sur LegalStatus, le notExists est mis sur Instruction_2.
   */
  public setNotExistsForWidget(variable: string) {
    console.log(`Setting "notExists" for variable: ${variable}`);

    // Trouver l'ancêtre qui porte le optional:true initial
    const optionalAncestorVar = this.findOptionalAncestorVariable(variable);

    if (optionalAncestorVar) {
      const ancestorBranch = this.findBranchByVariable(
        this.query.branches,
        optionalAncestorVar,
      );
      if (ancestorBranch) {
        console.log(
          `Adding "notExists: true" on optional ancestor: ${optionalAncestorVar}`,
        );
        ancestorBranch.notExists = true;
        delete ancestorBranch.optional;
      }

      // Remonter au-delà pour supprimer optional sur les parents plus haut
      let current = optionalAncestorVar;
      let parent = this.findParentBranch(this.query.branches, current);
      while (parent) {
        if (parent.optional) {
          console.log(
            `Removing "optional: true" for ancestor above: ${parent.line.o}`,
          );
          delete parent.optional;
        }
        current = parent.line.o;
        parent = this.findParentBranch(this.query.branches, current);
      }
    } else {
      // Fallback : si aucun ancêtre optional trouvé, mettre sur la branche elle-même
      const branch = this.findBranchByVariable(this.query.branches, variable);
      if (branch) {
        console.log(
          `No optional ancestor found, adding "notExists: true" on variable itself: ${variable}`,
        );
        branch.notExists = true;
        delete branch.optional;
      }
    }

    // Clear criterias for this widget and notify listeners that values were removed
    try {
      this.queryLine.criterias = [];
      this.formFieldDiv.dispatchEvent(
        new CustomEvent("valueRemoved", {
          bubbles: true,
          detail: { variable },
        }),
      );
    } catch (err) {
      console.error("Error clearing criterias after setting notExists:", err);
    }

    // Log the branch state for debugging
    const optTarget = optionalAncestorVar || variable;
    const updatedBranch = this.findBranchByVariable(
      this.query.branches,
      optTarget,
    );
    console.log(
      `Branch state after setNotExists (target: ${optTarget}):`,
      updatedBranch,
    );
  }

  /**
   * Removes "notExists" for a widget variable and restores initial optional states.
   * Targets the correct ancestor that was marked with notExists.
   */
  public removeNotExistsForWidget(variable: string) {
    console.log(`Removing "notExists" for variable: ${variable}`);

    // Trouver l'ancêtre qui portait le optional initial (et donc le notExists)
    const optionalAncestorVar = this.findOptionalAncestorVariable(variable);
    const targetVar = optionalAncestorVar || variable;

    const branch = this.findBranchByVariable(this.query.branches, targetVar);
    if (branch) {
      console.log(`Deleting notExists on: ${targetVar}`);
      delete branch.notExists;
      const initialState = this.initialOptionalStates[targetVar];
      if (initialState) {
        branch.optional = initialState.optional;
        // Restaurer toute la chaîne des parents
        this.restoreParentOptionalChain(
          branch,
          initialState.parentOptionalChain,
        );
      }
    }
  }
}

export default OptionalCriteriaManager;
