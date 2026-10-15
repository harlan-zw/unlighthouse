export const THUMBNAIL_WIDTH = 320
export const THUMBNAIL_HEIGHT = 640

export async function makeThumbnail(image: Uint8Array | null): Promise<Uint8Array | null> {
  if (!image)
    return null
  try {
    return await new Bun.Image(image)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .bytes()
  }
  catch {
    return null
  }
}
