import $ from "jquery";

import SparnaturalFormComponent from "./sparnatural-form/components/SparnaturalFormComponent";
import { SparnaturalFormAttributes } from "./SparnaturalFormAttributes";
import { defaultSettings, extend } from "./sparnatural-form/settings/Settings";
import { SparqlHandlerFactory, SparqlHandlerIfc } from "sparnatural";
import ISettings from "./sparnatural-form/settings/ISettings";

/*
  This is the sparnatural-form HTMLElement. 
  e.g. Interface to the outside world
*/
export class SparnaturalFormElement extends HTMLElement {
  static HTML_ELEMENT_NAME = "sparnatural-form";
  static EVENT_INIT = "init";
  static EVENT_SUBMIT = "submit";
  static EVENT_QUERY_UPDATED = "queryUpdated";
  static EVENT_RESET: "reset";

  sparnaturalForm: SparnaturalFormComponent;

  // just to avoid name clash with "attributes"
  _attributes: SparnaturalFormAttributes;

  settings: ISettings;

  constructor() {
    super();
  }

  /**
   * Call display only in the connectedCallback
   */
  connectedCallback() {
    this.display();
  }

  set customization(customization: any) {
    this.settings.customization = customization;
  }

  get customization() {
    return this.settings.customization;
  }

  display() {
    // read the HTML attributes in sparnatural-form
    this._attributes = new SparnaturalFormAttributes(this);

    this.settings = extend(
      true,
      this.settings,
      defaultSettings,
      this._attributes
    ) as ISettings;

    // create the sparnatural-form instance
    this.sparnaturalForm = new SparnaturalFormComponent(this.settings);

    // empty the HTML content in case we re-display after an attribute change
    $(this).empty();
    // attach the component to this WebComponent
    $(this).append(this.sparnaturalForm.html);

    // render the form
    this.sparnaturalForm.render();
  }

  /**
   * Expands the SPARQL query according to the configuration.
   * Can be called from the outside
   * @returns
   */
  expandSparql(query: string) {
    return this.sparnaturalForm.specProvider.expandSparql(
      query,
      this.settings.sparqlPrefixes
    );
  }

  static get observedAttributes() {
    return ["src", "lang", "defaultlang", "endpoint"];
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ) {
    if (oldValue === newValue) {
      return;
    }

    // prevents callback to be called on initial creation
    if (oldValue != null) {
      if (this.settings.debug) {
        console.log(
          `${name}'s value has been changed from ${oldValue} to ${newValue}`
        );
      }
      switch (name) {
        case "src": {
          this.settings.src = newValue;
          break;
        }
        case "lang": {
          this.settings.language = newValue;
          break;
        }
        case "defaultlang": {
          this.settings.defaultLanguage = newValue;
          break;
        }
        case "endpoint": {
          this.settings.endpoints = newValue.split(" ");
          break;
        }
        default: {
          throw new Error("unknown observed attribute ${name}");
        }
      }

      // then display/reprint
      this.display();
    }
  }

  enablePlayBtn() {
    this.sparnaturalForm.enablePlayBtn();
  }
  /**
   * Disable the play button when query is triggered
   * Can be called from the outside
   */
  disablePlayBtn() {
    this.sparnaturalForm.disablePlayBtn();
  }
  /**
   * Executes the provided SPARQL query, using the configured headers, and sending it to multiple
   * endpoints, if configured through the catalog attribute (results are then merged in a single result set)
   * @param query The SPARQL query to execute
   * @param callback The callback to execute with the final query string
   * @param errorCallback The callback to execute in case of an error during the query execution
   */
  executeSparql(
    query: string,
    callback: (data: any) => void,
    errorCallback?: (error: any) => void
  ) {
    let sparqlFetcherFactory: SparqlHandlerFactory = new SparqlHandlerFactory(
      this.settings.language,
      this.settings.localCacheDataTtl,
      this.settings.customization.headers,
      this.settings.customization.sparqlHandler,
      this.sparnaturalForm.catalog
    );

    let sparqlFetcher: SparqlHandlerIfc =
      sparqlFetcherFactory.buildSparqlHandler(this.settings.endpoints);
    sparqlFetcher.executeSparql(query, callback, errorCallback);
  }
}

customElements.get(SparnaturalFormElement.HTML_ELEMENT_NAME) ||
  window.customElements.define(
    SparnaturalFormElement.HTML_ELEMENT_NAME,
    SparnaturalFormElement
  );
