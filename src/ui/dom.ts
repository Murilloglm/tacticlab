const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'reset', 'file']);

/**
 * Indica se a tecla pressionada pertence a um campo de texto.
 * Controles como o de velocidade não contam: mantê-los em foco não pode travar a câmera.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  if (element.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
  return element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable;
}
