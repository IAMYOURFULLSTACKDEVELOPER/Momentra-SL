/** Browser-side image prep: bound dimensions, compress, and create a small JPEG thumbnail. */
async function toBlob(bitmap: ImageBitmap, maxEdge: number, type: string, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), type, quality));
}
export async function prepareImage(file: File) {
  // createImageBitmap honours EXIF orientation by default in modern browsers.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const needsResize = Math.max(bitmap.width, bitmap.height) > 2560;
  const original: Blob = needsResize ? await toBlob(bitmap, 2560, "image/jpeg", 0.88) : file;
  const mime = needsResize ? "image/jpeg" : file.type;
  const thumb = await toBlob(bitmap, 480, "image/jpeg", 0.75);
  const scale = needsResize ? 2560 / Math.max(bitmap.width, bitmap.height) : 1;
  const out = { original, thumb, mime, width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale), previewUrl: URL.createObjectURL(thumb) };
  bitmap.close();
  return out;
}
