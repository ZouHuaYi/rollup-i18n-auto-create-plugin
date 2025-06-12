export declare function containsChinese(str: string): boolean;
export declare function escapeRegExp(str: string): string;
export declare function extractQuotedStrings(str: string): string[];
export declare function extractTransformString(str: string): {
    key: string;
    data: string;
} | undefined;
export declare function getchinseKey(text: string): {
    key: string;
    isKey: boolean;
};
export declare function getFileJson(filePath: string): any;
export declare function updateJSONInFile(filePath: string, obj: any): void;
export declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate?: boolean): (...args: Parameters<T>) => void;
