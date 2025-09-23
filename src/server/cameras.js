// Reusable camera actions factory.
// Consumers pass their Prisma client and a URL builder for object storage.

export function createCameraActions({ prisma, buildUrl }) {
  if (!prisma) throw new Error('createCameraActions: prisma is required')
  if (!buildUrl) throw new Error('createCameraActions: buildUrl(fileRecord) -> url is required')

  const augmentImageWithMetadata = (image) => {
    const url = buildUrl(image)
    const data = image.data || {}
    let file_size = data.file_size ?? null
    const width = data.width ?? null
    const height = data.height ?? null
    const filename = data.filename || image.file || 'Unknown'
    return { ...image, url, filename, file_size, width, height }
  }

  async function getAvailableImageDates() {
    const images = await prisma.imageCam.findMany({
      select: { created: true },
      orderBy: { created: 'desc' }
    })
    const uniqueDates = [...new Set(images.map((img) => new Date(img.created).toISOString().split('T')[0]))]
    let minDate = null, maxDate = null
    if (images.length) {
      const dates = images.map((i) => new Date(i.created))
      minDate = new Date(Math.min(...dates))
      maxDate = new Date(Math.max(...dates))
    }
    return { success: true, availableDates: uniqueDates, minDate, maxDate }
  }

  async function getCameraImagesPaginated(limit = 14, beforeId = null, afterId = null) {
    let where = {}
    if (beforeId !== null) where.id = { lt: beforeId }
    if (afterId !== null) where.id = { gt: afterId }

    const images = await prisma.imageCam.findMany({ where, orderBy: { created: 'desc' }, take: limit })
    const orderedImages = afterId !== null ? images.reverse() : images

    let hasOlder = false, hasNewer = false
    if (orderedImages.length) {
      const highestId = Math.max(...orderedImages.map((i) => i.id))
      const lowestId = Math.min(...orderedImages.map((i) => i.id))
      hasNewer = (await prisma.imageCam.count({ where: { id: { gt: highestId } } })) > 0
      hasOlder = (await prisma.imageCam.count({ where: { id: { lt: lowestId } } })) > 0
    }
    const imagesWithMetadata = orderedImages.map(augmentImageWithMetadata)
    return { success: true, data: imagesWithMetadata, hasOlder, hasNewer }
  }

  async function getCameraImagesByDateTime(targetDateTime, limit = 14) {
    const targetDate = new Date(targetDateTime)
    const closestImage = await prisma.imageCam.findFirst({
      orderBy: [{ created: 'desc' }],
      where: { created: { lte: targetDate } },
    })

    if (!closestImage) {
      const images = await prisma.imageCam.findMany({ orderBy: { created: 'desc' }, take: limit })
      const imagesWithMetadata = images.map(augmentImageWithMetadata)
      let hasOlder = false, hasNewer = false
      if (images.length) {
        const highestId = Math.max(...images.map((i) => i.id))
        const lowestId = Math.min(...images.map((i) => i.id))
        hasNewer = (await prisma.imageCam.count({ where: { id: { gt: highestId } } })) > 0
        hasOlder = (await prisma.imageCam.count({ where: { id: { lt: lowestId } } })) > 0
      }
      return { success: true, data: imagesWithMetadata, hasOlder, hasNewer }
    }

    const halfLimit = Math.floor(limit / 2)
    const newer = await prisma.imageCam.findMany({ where: { id: { gt: closestImage.id } }, orderBy: { created: 'asc' }, take: halfLimit })
    const older = await prisma.imageCam.findMany({ where: { id: { lt: closestImage.id } }, orderBy: { created: 'desc' }, take: halfLimit })
    const allImages = [...newer.reverse(), closestImage, ...older]

    let hasOlder = false, hasNewer = false
    if (allImages.length) {
      const highestId = Math.max(...allImages.map((i) => i.id))
      const lowestId = Math.min(...allImages.map((i) => i.id))
      hasNewer = (await prisma.imageCam.count({ where: { id: { gt: highestId } } })) > 0
      hasOlder = (await prisma.imageCam.count({ where: { id: { lt: lowestId } } })) > 0
    }

    return {
      success: true,
      data: allImages.map(augmentImageWithMetadata),
      hasOlder,
      hasNewer,
      closestImage: augmentImageWithMetadata(closestImage)
    }
  }

  return {
    getAvailableImageDates,
    getCameraImagesPaginated,
    getCameraImagesByDateTime,
  }
}

