import {OptionsType} from "./src/types";

declare module '@babel/ generator'
declare global {
  var translationsMap: { [key: string]: string };
  var addTranslations: { key: string, value: string }[];
  var useTranslations: string[];
  var configOption: OptionsType
}

export {};
