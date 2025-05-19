import enLabels from "../lang/en.json";
import frLabels from "../lang/fr.json";

export class I18nForm {
  static i18nLabelsResources: any = {
    en: enLabels,
    fr: frLabels,
  };

  public static labels: any;

  private constructor() {}

  static init(lang: any) {
    I18nForm.labels = I18nForm.i18nLabelsResources[lang];
  }
}
