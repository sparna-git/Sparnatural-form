// Fonction utilitaire pour attacher les listeners à un formulaire donné
function attachFormEvents(form) {
  // Mise à jour de l’URL d’endpoint affichée
  document
    .querySelector("#displayEndpoint")
    .setAttribute("href", form.getAttribute("endpoint"));
  document.querySelector("#displayEndpoint").textContent =
    form.getAttribute("endpoint");

  // Gestion des événements du formulaire actif
  form.addEventListener("init", () => {
    for (const plugin in yasr.plugins) {
      if (yasr.plugins[plugin].notifyConfiguration) {
        yasr.plugins[plugin].notifyConfiguration(
          form.sparnaturalForm.specProvider
        );
      }
    }
  });

  form.addEventListener("queryUpdated", (event) => {
    const queryString = form.expandSparql(event.detail.queryString);
    yasqe.setValue(queryString);

    for (const plugin in yasr.plugins) {
      if (yasr.plugins[plugin].notifyQuery) {
        yasr.plugins[plugin].notifyQuery(event.detail.queryJson);
      }
    }
  });

  form.addEventListener("submit", () => {
    form.disablePlayBtn();
    form.executeSparql(
      yasqe.getValue(),
      (finalResult) => {
        yasr.setResponse(finalResult);
        form.enablePlayBtn();
      },
      (error) => {
        yasr.setResponse({
          contentType: "text/html",
          data: "Impossible de charger les résultats.",
          status: 500,
        });
        form.enablePlayBtn();
      }
    );
  });

  form.addEventListener("resetEditor", () => {
    yasqe.setValue("");
  });
}

// Initialisation
const initialForm = document.querySelector("sparnatural-form");
attachFormEvents(initialForm);

// Init YASQE
const yasqe = new Yasqe(document.getElementById("yasqe"), {
  requestConfig: {
    endpoint: initialForm.getAttribute("endpoint"),
    method: "GET",
    header: {},
  },
  copyEndpointOnNewTab: false,
});

// Init YASR
Yasr.registerPlugin("TableX", SparnaturalYasguiPlugins.TableX);
Yasr.registerPlugin("Grid", SparnaturalYasguiPlugins.GridPlugin);
delete Yasr.plugins["table"];

const yasr = new Yasr(document.getElementById("yasr"), {
  pluginOrder: ["Grid", "TableX", "response"],
  defaultPlugin: "TableX",
});

// Link query response to YASR
yasqe.on("queryResponse", (_yasqe, response, duration) => {
  yasr.setResponse(response, duration);
  const currentForm = document.querySelector(".form-instance[style*='block']");
  if (currentForm) currentForm.enablePlayBtn();
});

// Toggle YASQE
document.getElementById("sparql-toggle").onclick = function () {
  const el = document.getElementById("yasqe");
  if (el.style.display === "none") {
    el.style.display = "block";
    yasqe.setValue(yasqe.getValue());
    yasqe.refresh();
  } else {
    el.style.display = "none";
  }
  return false;
};

// Gestion des onglets
document.querySelectorAll("#formTabs .nav-link").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll("#formTabs .nav-link")
      .forEach((btn) => btn.classList.remove("active"));
    tab.classList.add("active");

    const formId = tab.getAttribute("data-form");

    // Cacher tous les formulaires
    document.querySelectorAll(".form-instance").forEach((form) => {
      form.style.display = "none";
    });

    // Afficher le bon formulaire
    const selectedForm = document.getElementById(formId);
    selectedForm.style.display = "block";

    // Attacher les événements
    attachFormEvents(selectedForm);
  });
});
