import { SparnaturalQuery, PredicateObjectPair } from "sparnatural";
import { Binding, Form } from "../FormStructure";

/**
 * @param query : the query to clean
 * from query to use remove the pairs with object.variable that exist on the form variables
 * the condition is that the object haven't any values/filters, not exist in query.variables and it's optional or his father is optional
 * @returns the cleaned query
 */

class CleanQuery {
  private query: SparnaturalQuery;
  // Thomas : this is not used anymore (05/02/2025)
  private variablesUsedInFormConfig: string[];
  private formConfig: Form;
  private settings: any;

  constructor(query: SparnaturalQuery, formConfig: Form, settings: any) {
    this.query = query;
    this.formConfig = formConfig;
    this.settings = settings;
  }

  // Obtenir les form variables à partir de formConfig
  getFormVariables(form: Form): string[] {
    return form.bindings.map((binding: Binding) => binding.variable);
  }

  //methods to clean the querytouse
  cleanQueryToUse(resultType: "onscreen" | "export"): SparnaturalQuery {
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

    // clean the predicateObjectPairs (= the WHERE clause)
    if (cleanQueryResult.where?.predicateObjectPairs) {
      cleanQueryResult.where.predicateObjectPairs =
        this.cleanPredicateObjectPairs(
          cleanQueryResult.where.predicateObjectPairs,
          variablesUsedInResultSet,
        );
    }
    // } else {
    //cleanQueryResult = this.query;
    //}
    // Add the limit from settings to the cleaned query
    if (this.settings && this.settings.limit !== undefined) {
      if (!cleanQueryResult.solutionModifiers) {
        cleanQueryResult.solutionModifiers = {};
      }
      cleanQueryResult.solutionModifiers.limitOffset = {
        type: "solutionModifier",
        subType: "limitOffset",
        limit: this.settings.limit,
      } as any;
    }
    console.log("CleanQuery: Query cleaned:", cleanQueryResult);
    return cleanQueryResult;
  }

  private cleanPredicateObjectPairs(
    pairs: PredicateObjectPair[],
    variablesUsedInResultSet: string[],
  ): PredicateObjectPair[] {
    return pairs
      .filter((pair) => {
        const variable = pair.object?.variable?.value;
        const hasValues =
          pair.object?.values?.length > 0 || pair.object?.filters?.length > 0;
        const isOptional = pair.subType === "optional";
        const parentOptional = this.isParentOptional(variable);

        // Vérifier si la variable existe dans `queryVariables`
        const existsInQueryVariables =
          variablesUsedInResultSet.find((v) => v === variable) !== undefined;

        // remove the pairs with object.variable :
        //   - which haven't any values/filters
        //   - don't exist in query.variables
        //   - is optional or his father is optional
        //
        // note : we don't check that the variable is in the form variables, because what could happen is:
        //   - the variable is optional
        //   - it is not in the form variables (only here to be selected as a result variable)
        //   - it is selected in the query
        //   - but then it is removed for onscreen display
        //   - so we should remove it anyway
        const shouldRemove =
          !existsInQueryVariables && // La variable n'existe pas dans les variables du SELECT la requête
          !hasValues && // Aucune valeur/filtre pour ce pair
          (isOptional || parentOptional); // Le pair ou son parent est optionnel
        return !shouldRemove;
      })
      .map((pair) => ({
        ...pair,
        object: {
          ...pair.object,
          predicateObjectPairs: pair.object?.predicateObjectPairs
            ? this.cleanPredicateObjectPairs(
                pair.object.predicateObjectPairs,
                variablesUsedInResultSet,
              )
            : undefined,
        },
      }));
  }

  /**
   * @return the array of all queries that are used in the query result, either directly or as aggregated variables
   */
  private getVariablesUsedInResultSet(theQuery: SparnaturalQuery): string[] {
    if (!theQuery.variables) return [];
    else {
      return Array.isArray(theQuery.variables)
        ? // either this is a simple variable, or this is an aggregated variable
          theQuery.variables.map((v: any) =>
            "value" in v ? v.value : v.expression?.expression?.value,
          )
        : [];
    }
  }

  // Vérifier si le parent d'un pair est optionnel
  private isParentOptional(childVariable: string): boolean {
    const findParent = (
      pairs: PredicateObjectPair[],
      target: string,
    ): PredicateObjectPair | null => {
      for (const pair of pairs) {
        if (
          pair.object?.predicateObjectPairs?.some(
            (child: PredicateObjectPair) =>
              child.object?.variable?.value === target,
          )
        ) {
          return pair;
        }
        if (pair.object?.predicateObjectPairs) {
          const result = findParent(pair.object.predicateObjectPairs, target);
          if (result) return result;
        }
      }
      return null;
    };

    const parent = findParent(
      this.query.where?.predicateObjectPairs || [],
      childVariable,
    );
    return parent?.subType === "optional" || false;
  }

  /**
   *
   * @param query The query from which to remove the selected variables
   * @param resultType The type of expected result. Depending on the type of result, only some columns are kept in the result set
   * @returns
   */
  private removeUnusedVariablesFromSelect(
    query: SparnaturalQuery,
    resultType: "onscreen" | "export",
    formConfig: Form,
  ): SparnaturalQuery {
    if (resultType == "onscreen") {
      query.variables = query.variables.filter((v: any) => {
        // retain only the columns that are useful for an onscreen display
        // the list of columns for onscreen display is a section in the form config
        let varName = "value" in v ? v.value : v.expression?.expression?.value;
        return (
          !formConfig.variables?.onscreen ||
          formConfig.variables?.onscreen?.includes(varName)
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
