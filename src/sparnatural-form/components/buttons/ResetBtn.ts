import { I18nForm } from "../../settings/I18nForm";
class ResetBtn {
  callback: () => void;
  buttonElement: JQuery<HTMLElement>;

  constructor(callback: () => void) {
    this.callback = callback;
    // Créer le bouton avec jQuery et ajouter le texte "Reset"
    this.buttonElement = $(
      `<button id="Reset">${I18nForm.labels["Reset"]}</button>`
    );

    // Ajouter un écouteur d'événement "click" pour appeler le callback
    this.buttonElement.on("click", (e: JQuery.ClickEvent) => {
      this.callback();
    });
  }

  // Méthode pour ajouter le bouton dans un conteneur
  render(container: JQuery<HTMLElement>) {
    container.append(this.buttonElement);
  }
}

export default ResetBtn;
