import { Branch, SparnaturalQueryIfc } from "sparnatural";
import { Binding, Form } from "../FormStructure";

/**
 * @param query : the query to clean
 * from query to use remove the branchs with o that exist on the form varibales
 * the condition is that the o haven't any values, not exist in query.variables and it's optional or his father is optional
 * @returns the cleaned query
 */
class CleanQuery {
  private query: SparnaturalQueryIfc;
  // Thomas : this is not used anymore (05/02/2025)
  private variablesUsedInFormConfig: string[];
  private formConfig: Form;
  private settings: any;
  private formVariables: string[];

  constructor(query: SparnaturalQueryIfc, formConfig: Form, settings: any) {
    this.query = query;
    this.formConfig = formConfig;
    this.settings = settings;
    this.formVariables = this.getFormVariables(this.formConfig);
  }
  // Obtenir les form variables à partir de formConfig
  getFormVariables(form: Form): string[] {
    return form.bindings.map((binding: Binding) => binding.variable);
  }

  //methods to clean the querytouse
  cleanQueryToUse(resultType: "onscreen" | "export"): SparnaturalQueryIfc {
    // deep copy of the initial query
    let cleanQueryResult = deepCloneWithDates(this.query);

    // remove selected variables if onscreen display
    // we remove variables from the SELECT clause
    // further cleaning steps will remove the corresponding criteria from the WHERE clause if they are optional,
    // and they have no value, and they are no more in the SELECT clause
    cleanQueryResult = this.removeUnusedVariablesFromSelect(
      cleanQueryResult,
      resultType,
      this.formConfig,
    );
    console.log("Type", resultType);

    this.variablesUsedInFormConfig = this.getFormVariables(this.formConfig);

    // re-list the variables used in the result set, after the previous filtering step
    let variablesUsedInResultSet: string[] =
      this.getVariablesUsedInResultSet(cleanQueryResult);

    cleanQueryResult.branches = this.cleanBranches(
      cleanQueryResult.branches,
      variablesUsedInResultSet,
    );

    if (this.settings && this.settings.limit !== undefined) {
      cleanQueryResult.limit = this.settings.limit;
    }
    console.log("CleanQuery: Query cleaned:", cleanQueryResult);
    return cleanQueryResult;
  }

  private cleanBranches(
    branches: Branch[],
    variablesUsedInResultSet: string[],
  ): Branch[] {
    return branches
      .map((branch) => ({
        ...branch,
        children: this.cleanBranches(
          branch.children || [],
          variablesUsedInResultSet,
        ),
      }))
      .filter((branch) => {
        const variable = branch.line?.o;
        // utiliser branchHasAnyValues
        const hasValues = this.branchHasAnyValues(branch);
        const isOptional = branch.optional || false;
        const parentOptional = this.isParentOptional(branch.line?.o);

        const existsInQueryVariables =
          variablesUsedInResultSet.find((v) => v === variable) !== undefined;

        const hasRemainingChildren =
          branch.children && branch.children.length > 0;

        const shouldRemove =
          !existsInQueryVariables &&
          !hasRemainingChildren &&
          !hasValues &&
          (isOptional || parentOptional);

        return !shouldRemove;
      });
  }

  private getVariablesUsedInResultSet(theQuery: SparnaturalQueryIfc): string[] {
    if (!theQuery.variables) return [];
    return Array.isArray(theQuery.variables)
      ? theQuery.variables.flatMap((v) => {
          if ("value" in v) {
            // Simple variable
            return [v.value];
          } else {
            // Aggregated variable : retourner la variable interne ET l'alias
            const inner = v.expression.expression.value;
            const alias = v.variable.value;
            return [inner, alias];
          }
        })
      : [];
  }

  // Vérifier si le parent d'une branche est optionnel
  private isParentOptional(childVariable: string): boolean {
    const findParent = (branches: Branch[], target: string): Branch => {
      for (const branch of branches) {
        if (
          branch.children?.some((child: Branch) => child.line?.o === target)
        ) {
          return branch;
        }
        if (branch.children) {
          const result = findParent(branch.children, target);
          if (result) return result;
        }
      }
      return null;
    };

    const parent = findParent(this.query.branches, childVariable);
    return parent?.optional || false;
  }

  /**
   * NOUVELLE MÉTHODE : Vérifie si une branche ou ses descendants possèdent des criterias,
   * qu'elles soient du formulaire OU pré-remplies (structurelles).
   * Les branches avec criterias pré-remplies ne doivent JAMAIS être supprimées.
   */
  private branchHasAnyValues(branch: Branch | null): boolean {
    if (!branch) return false;
    // Vérifier si cette branche a des criterias (peu importe si c'est dans le formulaire ou non)
    if (
      branch.line &&
      Array.isArray(branch.line.criterias) &&
      branch.line.criterias.length > 0
    ) {
      return true;
    }
    // Vérifier récursivement les enfants
    if (branch.children && branch.children.length > 0) {
      for (const child of branch.children) {
        if (this.branchHasAnyValues(child)) return true;
      }
    }
    return false;
  }

  /**
   * ANCIENNE MÉTHODE conservée pour référence - vérifie uniquement les criterias du formulaire
   */
  private branchHasFormValues(branch: Branch | null): boolean {
    if (!branch) return false;
    if (
      branch.line &&
      Array.isArray(branch.line.criterias) &&
      branch.line.criterias.length > 0 &&
      this.formVariables.includes(branch.line.o)
    ) {
      return true;
    }
    if (branch.children && branch.children.length > 0) {
      for (const child of branch.children) {
        if (this.branchHasFormValues(child)) return true;
      }
    }
    return false;
  }

  private branchHasValues(branch: Branch | null): boolean {
    if (!branch) return false;
    if (
      branch.line &&
      Array.isArray(branch.line.criterias) &&
      branch.line.criterias.length > 0
    ) {
      return true;
    }
    if (branch.children && branch.children.length > 0) {
      for (const child of branch.children) {
        if (this.branchHasValues(child)) return true;
      }
    }
    return false;
  }

  private removeUnusedVariablesFromSelect(
    query: SparnaturalQueryIfc,
    resultType: "onscreen" | "export",
    formConfig: Form,
  ): SparnaturalQueryIfc {
    if (resultType == "onscreen") {
      query.variables = query.variables.filter((v) => {
        // Pour une variable simple : v.value
        // Pour un agrégat : vérifier la variable interne ET l'alias
        let varName = "value" in v ? v.value : v.expression.expression.value;
        let aliasName = "value" in v ? null : v.variable.value;

        return (
          !formConfig.variables?.onscreen ||
          formConfig.variables?.onscreen?.includes(varName) ||
          (aliasName && formConfig.variables?.onscreen?.includes(aliasName))
        );
      });
      return query;
    } else {
      return query;
    }
  }
}
export default CleanQuery;

export function deepCloneWithDates<T>(obj: T): T {
  const replacer = (_key: string, value: any) => {
    if (value instanceof Date) {
      return value.toISOString(); // Convertir Date en String ISO
    }
    return value;
  };

  const reviver = (_key: string, value: any) => {
    // Si c'est une string ISO standard, essayer de la parser
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
    ) {
      const parsedDate = new Date(value);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return value;
  };

  return JSON.parse(JSON.stringify(obj, replacer), reviver) as T;
}
