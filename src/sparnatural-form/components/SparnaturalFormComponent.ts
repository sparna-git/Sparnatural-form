import {
  Branch,
  I18n,
  SparnaturalQueryIfc,
  SparnaturalSpecificationFactory,
  WidgetFactory,
} from "sparnatural";
import { HTMLComponent } from "sparnatural";
import { ISparnaturalSpecification } from "sparnatural";
import ISettings from "../settings/ISettings";
import { SparnaturalFormI18n } from "../settings/SparnaturalFormI18n";
import ActionStoreForm from "../handling/ActionStore"; // Importer le store
import * as YAML from "js-yaml";
import SubmitSection from "./buttons/SubmitSection";
import { SparnaturalFormElement } from "../../SparnaturalFormElement";
import FormField from "./FormField";
import { Binding, Form } from "../FormStructure";
import { I18nForm } from "../settings/I18nForm";
import { Catalog } from "rdf-shacl-commons";

/**
 * the content of all HTML element attributes
 */
class SparnaturalFormComponent extends HTMLComponent {
  // Sparnatural configuration
  settings: ISettings;

  SubmitSection: SubmitSection;

  specProvider: ISparnaturalSpecification;

  // The JSON query from the "query" attribute
  jsonQuery: SparnaturalQueryIfc;

  cleanQueryResult: SparnaturalQueryIfc | null; // Ajout pour stocker la clean query

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
  public HandleOptional(): SparnaturalQueryIfc | null {
    //verify if the query is initialized
    if (!this.jsonQuery || !this.jsonQuery.branches) {
      console.error(
        "jsonQuery is not initialized or does not contain branches.",
      );
      return null;
    }

    //copy the query to avoid modifying the original query
    const copiedQuery = JSON.parse(JSON.stringify(this.jsonQuery));

    if (!this.formConfig) {
      return null;
    }
    this.formConfig = this.formConfig; // Store the form configuration here
    // Get the form variables and query variables
    const formVariables = this.formConfig.bindings.map(
      (binding: Binding) => binding.variable,
    );

    // Adjust optional flags for all branches without removing them
    this.adjustOptionalFlags(copiedQuery.branches);

    /*console.log(
      "Adjusted query without branch removal:",
      JSON.stringify(copiedQuery, null, 2)
    );*/
    this.cleanQueryResult = copiedQuery; // update the global cleanQuery attribute
    return copiedQuery; // return the adjusted query
  }

  //methode qui ajuste les branches optionnelles
  // Méthode qui ajuste les branches optionnelles
  private adjustOptionalFlags(
    branches: Branch[],
    parentOptional: boolean = false,
  ) {
    const formVariables = this.formConfig.bindings.map(
      (binding: Binding) => binding.variable,
    );

    branches.forEach((branch: Branch) => {
      const branchVariable = branch.line.o;
      const hasValues =
        branch.line.criterias && branch.line.criterias.length > 0;

      // Vérifier si la branche a des valeurs DU FORMULAIRE uniquement
      const hasFormValues = hasValues && formVariables.includes(branchVariable);

      // Vérifier si un enfant a des valeurs DU FORMULAIRE uniquement
      const hasChildFormValues = branch.children?.some(
        (child: Branch) =>
          child.line.criterias &&
          child.line.criterias.length > 0 &&
          formVariables.includes(child.line.o),
      );

      // NOUVEAU : Vérifier si la branche ou ses descendants ont des criterias PRÉ-REMPLIES
      // Si oui, on NE TOUCHE PAS au flag optional (on garde l'état initial)
      const hasPrefilledValues = this.branchHasPrefilledValues(
        branch,
        formVariables,
      );

      if (hasPrefilledValues) {
        // Ne pas modifier le flag optional pour les branches avec criterias pré-remplies
        // On continue quand même la récursion pour les enfants
        if (branch.children && branch.children.length > 0) {
          this.adjustOptionalFlags(
            branch.children,
            branch.optional || parentOptional,
          );
        }
        return; // Skip la modification du flag optional pour cette branche
      }

      // Logique normale pour les branches du formulaire
      if (hasFormValues || hasChildFormValues) {
        branch.optional = false;
      } else {
        // branch.optional = parentOptional;
      }

      if (branch.children && branch.children.length > 0) {
        this.adjustOptionalFlags(branch.children, branch.optional);
      }
    });
  }

  /**
   * Vérifie si une branche ou ses descendants ont des criterias pré-remplies
   * (c'est-à-dire des criterias sur des variables qui ne sont PAS dans le formulaire)
   */
  private branchHasPrefilledValues(
    branch: Branch,
    formVariables: string[],
  ): boolean {
    if (!branch) return false;

    // Vérifier si cette branche a des criterias ET n'est PAS dans le formulaire (= pré-remplie)
    if (
      branch.line &&
      Array.isArray(branch.line.criterias) &&
      branch.line.criterias.length > 0 &&
      !formVariables.includes(branch.line.o)
    ) {
      return true;
    }

    // Vérifier récursivement les enfants
    if (branch.children && branch.children.length > 0) {
      for (const child of branch.children) {
        if (this.branchHasPrefilledValues(child, formVariables)) return true;
      }
    }

    return false;
  }

  render(): this {
    // Initialisation des labels et du catalogue
    this.#initSparnaturalStaticLabels();
    this.#initLang();
    this.#initCatalog();

    // Chargement des paramètres et génération du formulaire
    this.initSpecificationProvider((sp: ISparnaturalSpecification) => {
      this.specProvider = sp;

      this.initJsonQuery((query: SparnaturalQueryIfc) => {
        this.jsonQuery = query;
        this.actionStoreForm = new ActionStoreForm(this, this.specProvider);

        // Charger le fichier de configuration du formulaire (JSON ou YAML)
        const formUrl = this.settings.form;
        fetch(formUrl)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text().then((text) => ({
              text,
              contentType: response.headers.get("content-type"),
            }));
          })
          .then(({ text, contentType }) => {
            let formConfig: any;
            try {
              if (contentType && contentType.includes("json")) {
                formConfig = JSON.parse(text);
              } else if (
                contentType &&
                (contentType.includes("yaml") || contentType.includes("yml"))
              ) {
                formConfig = YAML.load(text);
              } else {
                // Fallback: try JSON, then YAML
                try {
                  formConfig = JSON.parse(text);
                } catch (e) {
                  formConfig = YAML.load(text);
                }
              }
            } catch (err) {
              console.error(
                "Unable to parse form configuration (JSON/YAML):",
                err,
              );
              return;
            }

            if (!formConfig || !formConfig.bindings) {
              console.error("formConfig or formConfig.bindings is undefined");
              return;
            }

            this.formConfig = formConfig; // Stocker la configuration du formulaire ici

            // Initialisation des labels
            this.#initSparnaturalFormStaticLabels(formConfig);
            console.log("Form configuration loaded successfully:", formConfig);

            // Génération des champs du formulaire
            formConfig.bindings.forEach((binding: Binding) => {
              const fieldGenerator = new FormField(
                binding,
                this.html[0],
                this.specProvider,
                this.jsonQuery,
                new WidgetFactory(this, this.specProvider, this.settings, null),
                formConfig,
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
          })
          .catch((error) => {
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

  //methode to reset the form

  resetForm() {
    console.log("Resetting the entire form...");

    // Effacer tous les éléments enfants du formulaire pour le vider
    while (this.html[0].firstChild) {
      this.html[0].removeChild(this.html[0].firstChild);
    }

    // Réinitialiser la requête JSON pour supprimer toutes les valeurs sélectionnées
    this.jsonQuery.branches.forEach((branch: Branch) => {
      branch.line.criterias = []; // Vider toutes les valeurs
    });

    // Ajouter un événement pour vider l'éditeur SPARQL
    const resetEditorEvent = new CustomEvent("resetEditor", {
      bubbles: true,
      detail: { queryString: "", queryJson: this.jsonQuery },
    });
    this.html[0].dispatchEvent(resetEditorEvent);

    // Recréer le formulaire en appelant la méthode `render`
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
      fetch(settings.catalog)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          me.catalog = new Catalog(data);
        })
        .catch((error) => {
          console.error(
            "Sparnatural - unable to load catalog file : " + settings.catalog,
            error,
          );
        });
    }
  }

  /**
   * Reads the Sparnatural query
   * @param callback
   */
  initJsonQuery(callback: (query: SparnaturalQueryIfc) => void) {
    let queryUrl = this.settings.query;

    fetch(queryUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        callback(data as SparnaturalQueryIfc);
      })
      .catch((error) => {
        console.error(
          "Sparnatural - unable to load JSON query file : " + queryUrl,
          error,
        );
      });
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
