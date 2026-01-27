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
    // Use SQL aggregation for efficiency - avoids loading all records into memory
    // which can cause stack overflow with large datasets (100k+ images)
    const [minMax] = await prisma.$queryRaw`
      SELECT MIN(created) as minDate, MAX(created) as maxDate FROM ImageCam
    `

    const dates = await prisma.$queryRaw`
      SELECT DISTINCT DATE_FORMAT(created, '%Y-%m-%d') as date FROM ImageCam ORDER BY date DESC
    `

    const availableDates = dates.map(d => d.date)

    return {
      success: true,
      availableDates,
      minDate: minMax.minDate,
      maxDate: minMax.maxDate
    }
  }

  /**
   * Get a single image based on timestamp and direction.
   * @param {string|null} timestamp - ISO timestamp to search from (null for latest)
   * @param {'latest'|'next'|'prev'|'closest'} direction - How to find the image
   * @returns {Promise<{success: boolean, data: object|null, hasOlder: boolean, hasNewer: boolean}>}
   */
  async function getImageByTimestamp(timestamp, direction = 'latest') {
    let image = null
    const targetDate = timestamp ? new Date(timestamp) : null

    switch (direction) {
      case 'latest':
        // Get the most recent image
        image = await prisma.imageCam.findFirst({
          orderBy: { created: 'desc' }
        })
        break

      case 'next':
        // Get the next image after the given timestamp (newer)
        if (!targetDate) return { success: false, data: null, hasOlder: false, hasNewer: false }
        image = await prisma.imageCam.findFirst({
          where: { created: { gt: targetDate } },
          orderBy: { created: 'asc' }
        })
        break

      case 'prev':
        // Get the previous image before the given timestamp (older)
        if (!targetDate) return { success: false, data: null, hasOlder: false, hasNewer: false }
        image = await prisma.imageCam.findFirst({
          where: { created: { lt: targetDate } },
          orderBy: { created: 'desc' }
        })
        break

      case 'closest':
        // Get the image closest to the given timestamp
        if (!targetDate) {
          // If no timestamp, return latest
          image = await prisma.imageCam.findFirst({
            orderBy: { created: 'desc' }
          })
        } else {
          // Find the closest image (before or after)
          const [before, after] = await Promise.all([
            prisma.imageCam.findFirst({
              where: { created: { lte: targetDate } },
              orderBy: { created: 'desc' }
            }),
            prisma.imageCam.findFirst({
              where: { created: { gt: targetDate } },
              orderBy: { created: 'asc' }
            })
          ])

          if (before && after) {
            // Compare distances
            const beforeDiff = Math.abs(targetDate - new Date(before.created))
            const afterDiff = Math.abs(new Date(after.created) - targetDate)
            image = beforeDiff <= afterDiff ? before : after
          } else {
            image = before || after
          }
        }
        break

      default:
        return { success: false, data: null, hasOlder: false, hasNewer: false }
    }

    if (!image) {
      return { success: true, data: null, hasOlder: false, hasNewer: false }
    }

    // Check if there are older/newer images
    const [hasNewer, hasOlder] = await Promise.all([
      prisma.imageCam.count({ where: { created: { gt: image.created } } }).then(c => c > 0),
      prisma.imageCam.count({ where: { created: { lt: image.created } } }).then(c => c > 0)
    ])

    return {
      success: true,
      data: augmentImageWithMetadata(image),
      hasOlder,
      hasNewer
    }
  }

  async function getCameraImageByFilename(filename) {
    const image = await prisma.imageCam.findFirst({
      where: { file: filename },
    })
    if (!image) return { success: false, error: 'Image not found' }
    return { success: true, data: augmentImageWithMetadata(image) }
  }

  // Legacy functions kept for backwards compatibility
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

  async function getCameraImagesByDateTimeForward(targetDateTime, limit = 14) {
    const targetDate = new Date(targetDateTime)
    const closestImage = await prisma.imageCam.findFirst({
      orderBy: [{ created: 'asc' }],
      where: { created: { gte: targetDate } },
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
    getImageByTimestamp,
    getCameraImageByFilename,
    // Legacy functions for backwards compatibility
    getCameraImagesPaginated,
    getCameraImagesByDateTime,
    getCameraImagesByDateTimeForward,
  }
}
