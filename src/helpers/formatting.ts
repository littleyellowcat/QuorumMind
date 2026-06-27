import type { Risk } from "../lib/domain";
import { copy, type Locale } from "../i18n/translations";

export function riskLabel(locale: Locale, risk: Risk) {
  return copy[locale].riskCategories[risk.category];
}
