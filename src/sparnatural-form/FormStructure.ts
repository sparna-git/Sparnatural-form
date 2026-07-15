import { Criteria, LabelledCriteria } from "sparnatural";

export interface Form {
  bindings: Binding[];
  // the variables config of the form, more specifically the list of variables
  // that we want to keep for an on-screen display
  variables?: {
    onscreen?: string[];
  };
}

/**
 * An association between a variable name and a form field
 */
export interface Binding {
  variable: string;
  node: Node;
}

export interface Node {
  type: string;
  name: Name;
  help?: Name;
}

export interface Name {
  en: string;
  fr: string;
}

/**
 * A single pre-filled criteria value, as stored in the query "criterias" array.
 * This is exactly the shape a widget expects in its "renderWidgetVal" event.
 */
export type PrefillValue = LabelledCriteria<Criteria>;

/**
 * A "flat" query : a mapping from a form variable to the single value
 * that must be pre-selected for that field.
 */
export interface FlatQueryValues {
  [variable: string]: PrefillValue;
}

/**
 * A "raw" query : a mapping from a form variable (column name) to a raw string
 * value, or an array of raw values for multi-value fields (repeated URL param).
 */
export interface RawQueryValues {
  [variable: string]: string | string[];
}

/**
 * One named predefined query, as listed in the query-remp.json file.
 * "label" is the human-readable text shown in the dropdown.
 * "values" is the flat query used to pre-fill the form.
 */
export interface PredefinedQuery {
  label: string;
  values: FlatQueryValues;
}

/**
 * Content of the query-remp.json file : the list of predefined queries
 * that feeds the dropdown at the top of the form.
 */
export interface PredefinedQueriesFile {
  queries: PredefinedQuery[];
}
