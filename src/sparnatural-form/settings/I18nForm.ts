export class I18nForm {
  static i18nLabelsResources: any = {
    en: require("../lang/en.json"),
    fr: require("../lang/fr.json"),
  };

  public static labels: any;

  private constructor() {}

  static init(lang: any) {
    I18nForm.labels = I18nForm.i18nLabelsResources[lang];
  }
}
