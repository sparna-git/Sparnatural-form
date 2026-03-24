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

    //if (this.resultType == "onscreen") {
    this.variablesUsedInFormConfig = this.getFormVariables(this.formConfig);

    // re-list the variables used in the result set, after the previous filtering step
    let variablesUsedInResultSet: string[] =
      this.getVariablesUsedInResultSet(cleanQueryResult);

    // clean the branches (= the WHERE clause)

    cleanQueryResult.branches = this.cleanBranches(
      cleanQueryResult.branches,
      variablesUsedInResultSet,
    );
    // } else {
    //cleanQueryResult = this.query;
    //}
    // Add the limit from settings to the cleaned query
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
        // D'abord, nettoyer récursivement les enfants (bottom-up)
        children: this.cleanBranches(
          branch.children || [],
          variablesUsedInResultSet,
        ),
      }))
      .filter((branch) => {
        const variable = branch.line?.o;
        const hasValues = this.branchHasFormValues(branch);
        const isOptional = branch.optional || false;
        const parentOptional = this.isParentOptional(branch.line?.o);

        const existsInQueryVariables =
          variablesUsedInResultSet.find((v) => v === variable) !== undefined;

        // Après le nettoyage bottom-up, on vérifie si la branche a encore des enfants
        const hasRemainingChildren =
          branch.children && branch.children.length > 0;

        const shouldRemove =
          !existsInQueryVariables &&
          !hasRemainingChildren && // plus besoin de hasSelectedDescendant, les enfants sont déjà nettoyés
          !hasValues &&
          (isOptional || parentOptional);

        return !shouldRemove;
      });
  }

  /**
   * Vérifie si une branche ou ses descendants possèdent des criterias
   * provenant du formulaire (ajoutées par l'utilisateur).
   * Les criterias pré-remplies (variables hors formulaire) ne comptent pas.
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

  /**
   * @return the array of all queries that are used in the query result, either directly or as aggregated variables
   */
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
   * Vérifie récursivement si une branche ou l'un de ses descendants possède des criterias (valeurs).
   */
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

  /**
   *
   * @param query The query from which to remove the selected variables
   * @param resultType The type of expected result. Depending on the type of result, only some columns are kept in the result set
   * @returns
   */
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
