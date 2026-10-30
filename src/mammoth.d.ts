// Version navigateur de mammoth : mêmes fonctions que le paquet principal
declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
}
