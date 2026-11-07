// A visão ativa registra como capturar a própria imagem. A barra superior só pede "exportar PNG".
type Capture = () => Promise<string> | string;

let capture: Capture | null = null;

export function registerCapture(fn: Capture): () => void {
  capture = fn;
  return () => {
    if (capture === fn) capture = null;
  };
}

export async function captureView(): Promise<string> {
  if (!capture) throw new Error('A visualização ainda não está pronta.');
  return capture();
}
