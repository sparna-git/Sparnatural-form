import SearchBtn from "./SearchBtn";
import SparnaturalFormComponent from "../SparnaturalFormComponent";
import { SparnaturalFormElement } from "../../../SparnaturalFormElement";
import ResetBtn from "./ResetBtn";
import ISettings from "../../settings/ISettings";
import { Form } from "../../FormStructure";

class SubmitSection {
  private settings: ISettings;
  searchBtn: SearchBtn;
  formConfig: Form;
  resetBtn: ResetBtn;
  ParentSparnatural: SparnaturalFormComponent;
  container: JQuery<HTMLElement>;

  constructor(
    ParentSparnatural: SparnaturalFormComponent,
    container: JQuery<HTMLElement>, // On passe un élément directement
    settings: ISettings
  ) {
    this.ParentSparnatural = ParentSparnatural;
    this.container = container;
    this.resetBtn = new ResetBtn(this.resetForm.bind(this));

    if (this.ParentSparnatural.formConfig.variables) {
      this.searchBtn = new SearchBtn(
        this.submitAction.bind(this),
        this.exportAction.bind(this)
      );
    } else {
      this.searchBtn = new SearchBtn(this.submitAction.bind(this), undefined);
    }

    this.settings = settings;
    this.render();
  }

  render(): this {
    this.resetBtn.render(this.container);
    this.searchBtn.render(this.container);
    return this;
  }

  //Export action
  exportAction = (): void => {
    //verifier si la formConfig contient les variables
    if (!this.ParentSparnatural.formConfig.variables) {
      console.error("SubmitSection: FormConfig not found");
      return undefined;
    }
    const exportEvent = new CustomEvent(SparnaturalFormElement.EVENT_SUBMIT, {
      bubbles: true,
      detail: {
        type: "export",
      },
    });
    this.container[0].dispatchEvent(exportEvent);
  };

  // Submit form action

  submitAction = () => {
    if (this.settings.submitButton) {
      const submitEvent = new CustomEvent(SparnaturalFormElement.EVENT_SUBMIT, {
        bubbles: true,
        detail: {
          type: "onscreen",
        },
      });
      this.container[0].dispatchEvent(submitEvent);
    }
  };

  // Reset form action
  resetForm = () => {
    this.ParentSparnatural.resetForm();
  };

  enableSubmit() {
    this.searchBtn.enable();
  }

  disableSubmit() {
    this.searchBtn.disable();
  }
}

export default SubmitSection;
