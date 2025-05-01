import { AutocompleteConfiguration } from "sparnatural";
import { SparqlHandlerIfc } from "sparnatural";
import { ListConfiguration } from "sparnatural";
import { MapConfiguration } from "sparnatural";
import { NumberConfiguration } from "sparnatural";
import { TreeConfiguration } from "sparnatural";

interface ISettings {
  localCacheDataTtl?: number;
  catalog?: string;
  src: any;
  language: string;
  defaultLanguage: string;
  query: string;
  form: string;
  limit?: number;
  endpoints?: string[];
  debug: boolean;
  typePredicate: string;
  submitButton?: boolean;
  sparqlPrefixes?: { [key: string]: string };
  customization?: {
    headers?: Map<string, string>;
    autocomplete?: Partial<AutocompleteConfiguration>;
    list?: Partial<ListConfiguration>;
    tree?: Partial<TreeConfiguration>;
    number?: Partial<NumberConfiguration>;
    map?: Partial<MapConfiguration>;
    sparqlHandler?: SparqlHandlerIfc;
  };
}

export default ISettings;
