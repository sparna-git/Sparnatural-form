import {
  I18n,
  SparnaturalSpecificationFactory,
  WidgetFactory,
} from "sparnatural";
import { HTMLComponent } from "sparnatural";
import { SparnaturalQuery, PredicateObjectPair } from "sparnatural";
import { ISparnaturalSpecification } from "sparnatural";
import ISettings from "../settings/ISettings";
import { SparnaturalFormI18n } from "../settings/SparnaturalFormI18n";
import ActionStoreForm from "../handling/ActionStore"; // Importer le store
import { Catalog } from "rdf-shacl-commons";
import SubmitSection from "./buttons/SubmitSection";
import { SparnaturalFormElement } from "../../SparnaturalFormElement";
import FormField from "./FormField";
import { Binding, Form } from "../FormStructure";
import { I18nForm } from "../settings/I18nForm";

/**
 * the content of all HTML element attributes
 */
class SparnaturalFormComponent extends HTMLComponent {
  // Sparnatural configuration
  settings: ISettings;

  SubmitSection: SubmitSection;

  specProvider: ISparnaturalSpecification;

  // The JSON query from the "query" attribute
  jsonQuery: SparnaturalQuery;

  cleanQueryResult: SparnaturalQuery | null; // Ajout pour stocker la clean query

  actionStoreForm: ActionStoreForm; // Ajouter une référence à l'ActionStoreForm

  catalog: Catalog;

  formConfig: Form; // Stocker la configuration du formulaire ici

  constructor(settings: ISettings) {
    // this is a root component : Does not have a ParentComponent!
    super("SparnaturalForm", null, null);
    this.settings = settings;
    this.cleanQueryResult = null; // Initialise cleanQueryResult
  }

  //methode to handle the optional branches of the query and return the adjusted query
  public HandleOptional(): SparnaturalQuery | null {
    if (!this.jsonQuery?.where) return null;

    const copiedQuery = structuredClone(this.jsonQuery);

    if (copiedQuery.where.subType === "bgpSameSubject") {
      this.adjustOptionalPairs(copiedQuery.where.predicateObjectPairs);
    }

    this.cleanQueryResult = copiedQuery;
    return copiedQuery;
  }

  //methode qui ajuste les branches optionnelles
  private adjustOptionalPairs(
    pairs: PredicateObjectPair[],
    parentOptional = false,
  ) {
    pairs.forEach((pair) => {
      const object = pair.object;

      const hasValues = object.values && object.values.length > 0;

      const hasFilters = object.filters && object.filters.length > 0;

      const hasChildValues = object.predicateObjectPairs?.some(
        (child) => child.object.values?.length || child.object.filters?.length,
      );

      if (hasValues || hasFilters || hasChildValues) {
        delete pair.subType;
      } else {
        pair.subType = parentOptional ? "optional" : pair.subType;
      }

      if (object.predicateObjectPairs) {
        this.adjustOptionalPairs(
          object.predicateObjectPairs,
          pair.subType === "optional",
        );
      }
    });
  }

  render(): this {
    // Initialisation des labels et du catalogue
    this.#initSparnaturalStaticLabels();
    this.#initLang();
    this.#initCatalog();

    // Chargement des paramètres et génération du formulaire
    this.initSpecificationProvider((sp: ISparnaturalSpecification) => {
      this.specProvider = sp;

      this.initJsonQuery((query: SparnaturalQuery) => {
        this.jsonQuery = query;
        this.actionStoreForm = new ActionStoreForm(this, this.specProvider);

        // Charger le fichier de configuration du formulaire
        const formUrl = this.settings.form;
        $.getJSON(formUrl, (formConfig) => {
          if (!formConfig || !formConfig.bindings) {
            console.error("formConfig or formConfig.bindings is undefined");
            return;
          }

          this.formConfig = formConfig; // Stocker la configuration du formulaire ici

          // Initialisation des labels
          this.#initSparnaturalFormStaticLabels(formConfig);

          // Génération des champs du formulaire
          formConfig.bindings.forEach((binding: Binding) => {
            const fieldGenerator = new FormField(
              binding,
              this.html[0],
              this.specProvider,
              this.jsonQuery,
              new WidgetFactory(this, this.specProvider, this.settings, null),
            );
            fieldGenerator.generateField();
          });

          this.makeFormScrollable();

          // Ajouter les boutons Reset/Search sans ID
          if (this.settings.submitButton) {
            const submitBtn = document.createElement("div");
            submitBtn.setAttribute("class", "submitSection");
            this.html[0].appendChild(submitBtn);
            this.SubmitSection = new SubmitSection(
              this,
              $(submitBtn),
              this.settings,
            );

            this.SubmitSection.render();
          }

          // fire init event at the end
          this.html[0].dispatchEvent(
            new CustomEvent(SparnaturalFormElement.EVENT_INIT, {
              bubbles: true,
              detail: {
                sparnaturalForm: this,
              },
            }),
          );
        }).fail((error) => {
          console.error("Error loading form configuration:", error);
        });
      });
    });

    return this;
  }

  makeFormScrollable(): void {
    const formContainer = this.html[0];
    const containerDiv = document.createElement("div");
    containerDiv.classList.add("sparnatural-form-container");

    // Déplacer le contenu du formulaire dans le conteneur scrollable
    while (formContainer.firstChild) {
      containerDiv.appendChild(formContainer.firstChild);
    }

    // Ajouter le conteneur au formulaire principal
    formContainer.appendChild(containerDiv);

    // Vérifiez si le contenu dépasse la hauteur visible
    const isScrollable = containerDiv.scrollHeight > containerDiv.clientHeight;

    // Ajouter ou retirer la classe `scrollable` en fonction de la scrollabilité
    if (isScrollable) {
      containerDiv.classList.add("scrollable");
    } else {
      containerDiv.classList.remove("scrollable");
    }
  }

  private resetPredicateObjectPairs(pairs: PredicateObjectPair[]) {
    pairs.forEach((pair) => {
      const object = pair.object;

      // Reset VALUES (ex VALUES clause)
      if (object.values) {
        object.values = [];
      }

      // Reset FILTERS (date, map, number, search)
      if (object.filters) {
        object.filters = [];
      }

      // Reset nested predicate-object pairs (recursion)
      if (object.predicateObjectPairs) {
        this.resetPredicateObjectPairs(object.predicateObjectPairs);
      }
    });
  }

  resetForm() {
    console.log("Resetting the entire form...");

    // Clear HTML form
    while (this.html[0].firstChild) {
      this.html[0].removeChild(this.html[0].firstChild);
    }

    // Reset query values & filters
    if (
      this.jsonQuery.where &&
      this.jsonQuery.where.subType === "bgpSameSubject"
    ) {
      this.resetPredicateObjectPairs(this.jsonQuery.where.predicateObjectPairs);
    }

    // Notify SPARQL editor
    const resetEditorEvent = new CustomEvent("resetEditor", {
      bubbles: true,
      detail: {
        queryString: "",
        queryJson: this.jsonQuery,
      },
    });

    this.html[0].dispatchEvent(resetEditorEvent);

    // Re-render form
    this.render();

    console.log("Form reset and re-rendered successfully.");
  }

  /**
   * Reads and parse the configuration provided in the "src" attribute, and fires a callback when ready
   * @param callback the function that is called with the ISpecificationProvider instance created after reading the config
   */
  initSpecificationProvider(callback: (sp: ISparnaturalSpecification) => void) {
    let specProviderFactory = new SparnaturalSpecificationFactory();
    specProviderFactory.build(
      this.settings.src,
      this.settings.language,
      // here : catalog parameter that we could add to the form
      undefined,
      (sp: ISparnaturalSpecification) => {
        // call the call back when done
        callback(sp);
      },
    );
  }

  #initCatalog() {
    let settings = this.settings;
    let me = this;
    if (settings.catalog) {
      $.getJSON(settings.catalog, function (data) {
        me.catalog = new Catalog(data);
      }).fail(function (response) {
        console.error(
          "Sparnatural - unable to load catalog file : " + settings.catalog,
        );
      });
    }
  }

  /**
   * Reads the Sparnatural query
   * @param callback
   */
  initJsonQuery(callback: (query: SparnaturalQuery) => void) {
    let queryUrl = this.settings.query;

    $.when(
      $.getJSON(queryUrl, function (data) {
        callback(data as SparnaturalQuery);
      }).fail(function (response) {
        console.error(
          "Sparnatural - unable to load JSON query file : " + queryUrl,
        );
      }),
    ).done(function () {});
  }

  #initLang() {
    if (this.settings.language === "fr") {
      I18nForm.init("fr");
    } else {
      I18nForm.init("en");
    }
  }
  /**
   * Initialize the static labels used to render sparnatural-form
   */

  #initSparnaturalFormStaticLabels(formConfig: Form) {
    const lang = this.settings.language === "fr" ? "fr" : "en";
    SparnaturalFormI18n.init(lang, formConfig);
  }

  // method is exposed from the HTMLElement
  enablePlayBtn = () => {
    this.SubmitSection.searchBtn.removeLoading();
  };

  // method is exposed from the HTMLElement
  disablePlayBtn = () => {
    this.SubmitSection.searchBtn.disable();
  };
  /**
   * Initialize the static labels used to render the widgets from Sparnatural
   */
  #initSparnaturalStaticLabels() {
    if (this.settings.language === "fr") {
      I18n.init("fr");
    } else {
      I18n.init("en");
    }
  }
  //methode to check if the form is empty
  isEmpty(): boolean {
    return null;
  }
}
export default SparnaturalFormComponent;
