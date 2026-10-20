export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 8_000_000) throw new Error("Выберите изображение размером до 8 МБ");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Не удалось открыть фотографию"));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не может подготовить фотографию");
    for (const maxSide of [960, 760, 560]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", maxSide === 960 ? .8 : .7);
      if (result.length < 850_000) return result;
    }
    throw new Error("Фотография слишком большая даже после сжатия");
  } finally { URL.revokeObjectURL(objectUrl); }
}
