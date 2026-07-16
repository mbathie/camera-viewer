// Reusable camera actions factory.
// Consumers pass their Prisma client and a URL builder for object storage.

export function createCameraActions({ prisma, buildUrl }) {
  if (!prisma) throw new Error('createCameraActions: prisma is required')
  if (!buildUrl) throw new Error('createCameraActions: buildUrl(fileRecord) -> url is required')

  // An image cannot be captured in the future. A row whose `created` is ahead of
  // now (camera clock skew, or a date mis-parsed at ingest) would otherwise pin
  // itself as "latest" and hide the real most-recent image until wall-clock time
  // caught up with it. Every lookup below is bounded to the past.
  const now = () => new Date()

  const augmentImageWithMetadata = (image) => {
    const url = buildUrl(image)
    const data = image.data || {}
    let file_size = data.file_size ?? null
    const width = data.width ?? null
    const height = data.height ?? null
    const filename = data.filename || image.file || 'Unknown'
    return { ...image, url, filename, file_size, width, height }
  }

  async function getAvailableImageDates(binId = null) {
    // Use SQL aggregation for efficiency - avoids loading all records into memory
    // which can cause stack overflow with large datasets (100k+ images)
    const binIdInt = binId ? parseInt(binId) : null

    const [minMax] = binIdInt
      ? await prisma.$queryRaw`SELECT MIN(created) as minDate, MAX(created) as maxDate FROM ImageCam WHERE binId = ${binIdInt} AND created <= NOW()`
      : await prisma.$queryRaw`SELECT MIN(created) as minDate, MAX(created) as maxDate FROM ImageCam WHERE created <= NOW()`

    const dates = binIdInt
      ? await prisma.$queryRaw`SELECT DISTINCT DATE_FORMAT(created, '%Y-%m-%d') as date FROM ImageCam WHERE binId = ${binIdInt} AND created <= NOW() ORDER BY date DESC`
      : await prisma.$queryRaw`SELECT DISTINCT DATE_FORMAT(created, '%Y-%m-%d') as date FROM ImageCam WHERE created <= NOW() ORDER BY date DESC`

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
   * @param {number|string|null} binId - Camera/bin ID to filter by (optional)
   * @returns {Promise<{success: boolean, data: object|null, hasOlder: boolean, hasNewer: boolean}>}
   */
  async function getImageByTimestamp(timestamp, direction = 'latest', binId = null) {
    let image = null
    const targetDate = timestamp ? new Date(timestamp) : null
    const binFilter = binId ? { binId: parseInt(binId) } : {}

    switch (direction) {
      case 'latest':
        // Get the most recent image that is not dated in the future
        image = await prisma.imageCam.findFirst({
          where: { ...binFilter, created: { lte: now() } },
          orderBy: { created: 'desc' }
        })
        break

      case 'next':
        // Get the next image after the given timestamp (newer)
        if (!targetDate) return { success: false, data: null, hasOlder: false, hasNewer: false }
        image = await prisma.imageCam.findFirst({
          where: { ...binFilter, created: { gt: targetDate, lte: now() } },
          orderBy: { created: 'asc' }
        })
        break

      case 'prev':
        // Get the previous image before the given timestamp (older)
        if (!targetDate) return { success: false, data: null, hasOlder: false, hasNewer: false }
        image = await prisma.imageCam.findFirst({
          where: { ...binFilter, created: { lt: targetDate } },
          orderBy: { created: 'desc' }
        })
        break

      case 'closest':
        // Get the image closest to the given timestamp
        if (!targetDate) {
          // If no timestamp, return latest
          image = await prisma.imageCam.findFirst({
            where: { ...binFilter, created: { lte: now() } },
            orderBy: { created: 'desc' }
          })
        } else {
          // Never search past the present, even if the caller asks for a future
          // date (e.g. a calendar day that has not finished yet).
          const cap = new Date(Math.min(targetDate.getTime(), Date.now()))
          // Find the closest image (before or after)
          const [before, after] = await Promise.all([
            prisma.imageCam.findFirst({
              where: { ...binFilter, created: { lte: cap } },
              orderBy: { created: 'desc' }
            }),
            prisma.imageCam.findFirst({
              where: { ...binFilter, created: { gt: targetDate, lte: now() } },
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

    // Check if there are older/newer images (for this camera). `hasNewer` must
    // apply the same future bound as the 'next' lookup, or the forward control
    // enables itself against images that 'next' will refuse to return.
    const [hasNewer, hasOlder] = await Promise.all([
      prisma.imageCam.count({ where: { ...binFilter, created: { gt: image.created, lte: now() } } }).then(c => c > 0),
      prisma.imageCam.count({ where: { ...binFilter, created: { lt: image.created } } }).then(c => c > 0)
    ])

    return {
      success: true,
      data: augmentImageWithMetadata(image),
      hasOlder,
      hasNewer
    }
  }

  async function getCameraImageByFilename(filename, binId = null) {
    const binFilter = binId ? { binId: parseInt(binId) } : {}
    const image = await prisma.imageCam.findFirst({
      where: { ...binFilter, file: filename },
    })
    if (!image) return { success: false, error: 'Image not found' }
    return { success: true, data: augmentImageWithMetadata(image) }
  }

  // Legacy functions kept for backwards compatibility
  async function getCameraImagesPaginated(limit = 14, beforeId = null, afterId = null, binId = null) {
    const binFilter = binId ? { binId: parseInt(binId) } : {}
    let where = { ...binFilter }
    if (beforeId !== null) where.id = { lt: beforeId }
    if (afterId !== null) where.id = { gt: afterId }

    const images = await prisma.imageCam.findMany({ where, orderBy: { created: 'desc' }, take: limit })
    const orderedImages = afterId !== null ? images.reverse() : images

    let hasOlder = false, hasNewer = false
    if (orderedImages.length) {
      const highestId = Math.max(...orderedImages.map((i) => i.id))
      const lowestId = Math.min(...orderedImages.map((i) => i.id))
      hasNewer = (await prisma.imageCam.count({ where: { ...binFilter, id: { gt: highestId } } })) > 0
      hasOlder = (await prisma.imageCam.count({ where: { ...binFilter, id: { lt: lowestId } } })) > 0
    }
    const imagesWithMetadata = orderedImages.map(augmentImageWithMetadata)
    return { success: true, data: imagesWithMetadata, hasOlder, hasNewer }
  }

  async function getCameraImagesByDateTime(targetDateTime, limit = 14, binId = null) {
    const binFilter = binId ? { binId: parseInt(binId) } : {}
    const targetDate = new Date(targetDateTime)
    const closestImage = await prisma.imageCam.findFirst({
      orderBy: [{ created: 'desc' }],
      where: { ...binFilter, created: { lte: targetDate } },
    })

    if (!closestImage) {
      const images = await prisma.imageCam.findMany({ where: binFilter, orderBy: { created: 'desc' }, take: limit })
      const imagesWithMetadata = images.map(augmentImageWithMetadata)
      let hasOlder = false, hasNewer = false
      if (images.length) {
        const highestId = Math.max(...images.map((i) => i.id))
        const lowestId = Math.min(...images.map((i) => i.id))
        hasNewer = (await prisma.imageCam.count({ where: { ...binFilter, id: { gt: highestId } } })) > 0
        hasOlder = (await prisma.imageCam.count({ where: { ...binFilter, id: { lt: lowestId } } })) > 0
      }
      return { success: true, data: imagesWithMetadata, hasOlder, hasNewer }
    }

    const halfLimit = Math.floor(limit / 2)
    const newer = await prisma.imageCam.findMany({ where: { ...binFilter, id: { gt: closestImage.id } }, orderBy: { created: 'asc' }, take: halfLimit })
    const older = await prisma.imageCam.findMany({ where: { ...binFilter, id: { lt: closestImage.id } }, orderBy: { created: 'desc' }, take: halfLimit })
    const allImages = [...newer.reverse(), closestImage, ...older]

    let hasOlder = false, hasNewer = false
    if (allImages.length) {
      const highestId = Math.max(...allImages.map((i) => i.id))
      const lowestId = Math.min(...allImages.map((i) => i.id))
      hasNewer = (await prisma.imageCam.count({ where: { ...binFilter, id: { gt: highestId } } })) > 0
      hasOlder = (await prisma.imageCam.count({ where: { ...binFilter, id: { lt: lowestId } } })) > 0
    }

    return {
      success: true,
      data: allImages.map(augmentImageWithMetadata),
      hasOlder,
      hasNewer,
      closestImage: augmentImageWithMetadata(closestImage)
    }
  }

  async function getCameraImagesByDateTimeForward(targetDateTime, limit = 14, binId = null) {
    const binFilter = binId ? { binId: parseInt(binId) } : {}
    const targetDate = new Date(targetDateTime)
    const closestImage = await prisma.imageCam.findFirst({
      orderBy: [{ created: 'asc' }],
      where: { ...binFilter, created: { gte: targetDate } },
    })

    if (!closestImage) {
      const images = await prisma.imageCam.findMany({ where: binFilter, orderBy: { created: 'desc' }, take: limit })
      const imagesWithMetadata = images.map(augmentImageWithMetadata)
      let hasOlder = false, hasNewer = false
      if (images.length) {
        const highestId = Math.max(...images.map((i) => i.id))
        const lowestId = Math.min(...images.map((i) => i.id))
        hasNewer = (await prisma.imageCam.count({ where: { ...binFilter, id: { gt: highestId } } })) > 0
        hasOlder = (await prisma.imageCam.count({ where: { ...binFilter, id: { lt: lowestId } } })) > 0
      }
      return { success: true, data: imagesWithMetadata, hasOlder, hasNewer }
    }

    const halfLimit = Math.floor(limit / 2)
    const newer = await prisma.imageCam.findMany({ where: { ...binFilter, id: { gt: closestImage.id } }, orderBy: { created: 'asc' }, take: halfLimit })
    const older = await prisma.imageCam.findMany({ where: { ...binFilter, id: { lt: closestImage.id } }, orderBy: { created: 'desc' }, take: halfLimit })
    const allImages = [...newer.reverse(), closestImage, ...older]

    let hasOlder = false, hasNewer = false
    if (allImages.length) {
      const highestId = Math.max(...allImages.map((i) => i.id))
      const lowestId = Math.min(...allImages.map((i) => i.id))
      hasNewer = (await prisma.imageCam.count({ where: { ...binFilter, id: { gt: highestId } } })) > 0
      hasOlder = (await prisma.imageCam.count({ where: { ...binFilter, id: { lt: lowestId } } })) > 0
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
