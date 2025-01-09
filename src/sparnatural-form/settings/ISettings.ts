import { AutocompleteConfiguration } from "sparnatural/src/sparnatural/components/widgets/AutoCompleteWidget";
import { SparqlHandlerIfc } from "sparnatural/src/sparnatural/components/widgets/data/SparqlHandler";
import { ListConfiguration } from "sparnatural/src/sparnatural/components/widgets/ListWidget";
import { MapConfiguration } from "sparnatural/src/sparnatural/components/widgets/MapWidget";
import { NumberConfiguration } from "sparnatural/src/sparnatural/components/widgets/NumberWidget";
import { TreeConfiguration } from "sparnatural/src/sparnatural/components/widgets/treewidget/TreeWidget";

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
