
declare module '@babel/ generator'
declare global {
  var translationsMap: { [key: string]: string };
  var addTranslations: { key: string, value: string }[];
  var useTranslations: string[];
  var keyLength: number;
  var cryptoKey: string;
  var preText: string;
}

export type { OptionsType } from "./src/types";
export { };

