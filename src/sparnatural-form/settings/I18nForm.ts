export class I18nForm {
  static i18nLabelsResources: any = {
    en: require("../../assets/lang/en.json"),
    fr: require("../../assets/lang/fr.json"),
  };

  public static labels: any;

  private constructor() {}

  static init(lang: any) {
    I18nForm.labels = I18nForm.i18nLabelsResources[lang];
  }
}
