export interface Country {
  id: string;
  name: string;
  /** Name in the local language/script, e.g. 日本. */
  nameLocal?: string;
  /** ISO 3166-1 alpha-2, e.g. JP. */
  code?: string;
  /** ISO 4217, e.g. JPY. */
  currency?: string;
}
