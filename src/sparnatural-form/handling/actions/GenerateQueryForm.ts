import ActionStoreForm from "../ActionStore";
import { Generator } from "sparqljs";
import { SparnaturalQuery } from "sparnatural";
import { JsonV13SparqlTranslator } from "sparnatural";
import CleanQuery from "../../components/CleanQuery";

export class QueryGeneratorForm {
  actionStoreForm: ActionStoreForm;

  constructor(actionStoreForm: ActionStoreForm) {
    this.actionStoreForm = actionStoreForm;
  }

  generateQuery(resultType: "onscreen" | "export"): QueryUpdatedPayload {
    // If in quiet mode, do nothing
    if (this.actionStoreForm.quiet) {
      return;
    }

    // If the form is empty, do nothing
    if (this.actionStoreForm.sparnaturalForm.isEmpty()) {
      return;
    }

    // Step 1: Handle optional branches to get the clean query result
    const sparnaturalForm = this.actionStoreForm.sparnaturalForm;

    // DEBUG: Log the original jsonQuery to see if values are there
    console.log(
      "[DEBUG] Original jsonQuery:",
      JSON.stringify(sparnaturalForm.jsonQuery, null, 2),
    );

    sparnaturalForm.HandleOptional();

    // Step 2: Retrieve the last cleaned query
    let queryToUse: SparnaturalQuery = sparnaturalForm.cleanQueryResult;

    // DEBUG: Log the cleanQueryResult after HandleOptional
    console.log(
      "[DEBUG] cleanQueryResult after HandleOptional:",
      JSON.stringify(queryToUse, null, 2),
    );
    // Step 4: Translate the final clean query into SPARQL
    const settings = sparnaturalForm.settings;
    console.log("settings for SPARQL generation:", settings);
    // Step 3: Further clean the query using CleanQuery for final processing
    const cleanQueryProcessor = new CleanQuery(
      queryToUse,
      sparnaturalForm.formConfig,
      settings,
    );
    const finalCleanQuery = cleanQueryProcessor.cleanQueryToUse(resultType);

    // DEBUG: Log the finalCleanQuery that will be passed to SPARQL translator
    console.log(
      "[DEBUG] finalCleanQuery for SPARQL generation:",
      JSON.stringify(finalCleanQuery, null, 2),
    );

    const sparqlTranslator = new JsonV13SparqlTranslator(
      this.actionStoreForm.specProvider,
      settings,
    );

    const sparqlJsQuery = sparqlTranslator.generateQuery(finalCleanQuery);
    const generator = new Generator();
    const queryStringFromJson = generator.stringify(sparqlJsQuery);

    // Step 5: Create a payload with the generated SPARQL query
    const queryPayload: QueryUpdatedPayload = {
      queryString: queryStringFromJson,
      queryJson: finalCleanQuery,
    };

    // Step 6: Dispatch the event to update the editor and notify components
    this.fireQueryUpdatedEvent(queryPayload);
    console.log("result Type :", resultType);
    // Re-enable the submit button if it was disabled
    sparnaturalForm.SubmitSection.enableSubmit();

    return queryPayload; // Optionally return the payload for further use
  }

  fireQueryUpdatedEvent(payload: QueryUpdatedPayload) {
    // Dispatch an event to notify other components
    this.actionStoreForm.sparnaturalForm.html[0].dispatchEvent(
      new CustomEvent("queryUpdated", {
        bubbles: true,
        detail: payload,
      }),
    );
  }
}

export class QueryUpdatedPayload {
  queryString: string;
  queryJson: SparnaturalQuery;
}
