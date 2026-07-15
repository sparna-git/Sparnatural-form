// Select the Sparnatural form component
const sparnaturalForm = document.querySelector("sparnatural-form");

// Get language from URL parameters if specified
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
console.log("urlParams", urlParams);
const lang = urlParams.get("lang");

sparnaturalForm.addEventListener("init", (event) => {
  console.log("init sparnatural-form...");
  console.log("Configuration ", sparnaturalForm.configuration);
  // Notify all plugins of configuration updates if they support it
  for (const plugin in yasr.plugins) {
    if (yasr.plugins[plugin].notifyConfiguration) {
      console.log("notifying configuration for plugin " + plugin);
      yasr.plugins[plugin].notifyConfiguration(
        sparnaturalForm.sparnaturalForm.specProvider,
      );
    }
  }

  // Step 2 : pre-fill the form from the page URL.
  const RESERVED_PARAMS = ["lang"];
  const criteria = {};
  urlParams.forEach((value, key) => {
    if (!RESERVED_PARAMS.includes(key)) criteria[key] = value;
  });
  if (Object.keys(criteria).length > 0) {
    console.log("Pre-filling form from URL with criteria:", criteria);
    sparnaturalForm.loadQueryFromCriteria(criteria);
  }

  // Step 1 : predefined-queries dropdown, fully handled by the page.
  buildPredefinedQueriesDropdown();
});

// Builds a <select> listing the predefined queries
function buildPredefinedQueriesDropdown() {
  const config = document.getElementById("predefined-queries");
  if (!config) return;
  const url = config.getAttribute("data-queries");
  if (!url) return;

  // Render outside the form, inside the #predefined-queries div itself.
  const host = config;

  fetch(url)
    .then((response) => {
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const queries = data && Array.isArray(data.queries) ? data.queries : [];

      const container = document.createElement("div");
      container.classList.add("predefined-queries-container");

      const select = document.createElement("select");
      select.id = "predefined-queries-select";
      select.classList.add("predefined-queries-select");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent =
        lang === "en"
          ? "Load example query..."
          : "Charger une requête d'exemple...";
      select.appendChild(placeholder);

      queries.forEach((query, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = query.label;
        select.appendChild(option);
      });

      select.addEventListener("change", () => {
        const index = parseInt(select.value, 10);
        if (Number.isNaN(index)) {
          // Placeholder selected → reset the form (load empty values)
          sparnaturalForm.loadQuery({});
          return;
        }
        const query = queries[index];
        if (query) sparnaturalForm.loadQuery(query.values);
        // Reset to placeholder so re-selecting the same example fires change again
        select.value = "";
      });

      container.appendChild(select);

      // Avoid duplicates on re-render, then render inside #predefined-queries
      const existing = host.querySelector(".predefined-queries-container");
      if (existing) existing.remove();
      host.appendChild(container);
    })
    .catch((error) => {
      console.error("Unable to load predefined queries file: " + url, error);
    });
}

// Listen for updates to the query and pass to YASQE
sparnaturalForm.addEventListener("queryUpdated", (event) => {
  const queryString = sparnaturalForm.expandSparql(event.detail.queryString);
  console.log("queryString", event.detail);

  // Update YASQE with the new SPARQL query
  yasqe.setValue(queryString);

  for (const plugin in yasr.plugins) {
    if (yasr.plugins[plugin].notifyQuery) {
      yasr.plugins[plugin].notifyQuery(event.detail.queryJson);
      console.log("notifying query for plugin " + plugin);
    }
  }
});

// Gestionnaire d'événement pour le formulaire Sparnatural
sparnaturalForm.addEventListener("submit", () => {
  console.log("Submit action triggered.");

  // Désactiver le bouton et afficher un spinner sur le bouton
  sparnaturalForm.disablePlayBtn();

  // Afficher un message ou un spinner temporaire dans YASR
  yasr.setResponse({
    contentType: "text/html",
    data: `chargement en cours ...`,
    status: 200,
  });

  // Exécuter la requête SPARQL
  sparnaturalForm.executeSparql(
    yasqe.getValue(),
    (finalResult) => {
      console.log("Résultats reçus :", finalResult);

      // Injecter les résultats directement dans YASR
      yasr.setResponse(finalResult);
      console.log("Nouveaux résultats chargés dans le tableau.");

      // Réactiver le bouton et restaurer le texte
      sparnaturalForm.enablePlayBtn();
    },
    (error) => {
      console.error("Erreur lors de l'exécution de la requête SPARQL :", error);

      // Afficher un message d'erreur directement dans YASR
      yasr.setResponse({
        contentType: "text/html",
        data: `Impossible de charger les résultats. Veuillez réessayer.`,
        status: 500,
      });

      // Réactiver le bouton même en cas d'erreur
      sparnaturalForm.enablePlayBtn();
    },
  );
});

console.log("init yasr & yasqe...");

// Initialize YASQE
const yasqe = new Yasqe(document.getElementById("yasqe"), {
  requestConfig: { endpoint: $("#endpoint").text() },
  copyEndpointOnNewTab: false,
});

Yasr.registerPlugin("TableX", SparnaturalYasguiPlugins.TableX);
Yasr.registerPlugin("GridPlugin", SparnaturalYasguiPlugins.GridPlugin);
Yasr.registerPlugin("Response", SparnaturalYasguiPlugins.Response);

// exemple pour passer un paramètre de config à un plugin
Yasr.plugins.TableX.defaults.openIriInNewWindow = true;

delete Yasr.plugins["table"];
delete Yasr.plugins["map"];
const yasr = new Yasr(document.getElementById("yasr"), {
  pluginOrder: ["TableX", "Response", "GridPlugin"],
  defaultPlugin: "TableX",
  //this way, the URLs in the results are prettified using the defined prefixes in the query
  getUsedPrefixes: yasqe.getPrefixesFromQuery,
  drawOutputSelector: false,
  drawDownloadIcon: false,
  // avoid persistency side-effects
  persistency: { prefix: false, results: { key: false } },
});

// Link YASQE and YASR so YASR displays query responses
yasqe.on("queryResponse", function (_yasqe, response, duration) {
  yasr.setResponse(response, duration);
  sparnaturalForm.enablePlayBtn();
});

// Function to toggle language in Sparnatural form
document.getElementById("switch-language").onclick = function () {
  const sparnaturalForm = document.querySelector("sparnatural-form");

  // Change language dynamically
  const currentLang = sparnaturalForm.getAttribute("lang");
  const newLang = currentLang === "fr" ? "en" : "fr";
  sparnaturalForm.setAttribute("lang", newLang);

  // Force form to re-render with new language
  sparnaturalForm.display();
};

// Écouter l'événement "resetEditor" pour vider l'éditeur SPARQL
sparnaturalForm.addEventListener("resetEditor", (event) => {
  console.log("Resetting SPARQL editor...");
  yasqe.setValue(""); // Vider l'éditeur SPARQL
  console.log("SPARQL editor has been reset.");
});
