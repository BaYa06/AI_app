/** Скачать текст файлом (в браузере вместо «Поделиться» из приложения) */
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8'
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
