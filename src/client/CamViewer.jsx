"use client"
import { use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// CamViewer is UI-agnostic: pass your UI components via the ui prop.
// Required ui props: Button, Calendar, Popover, PopoverTrigger, PopoverContent, Input
export default function CamViewer({ params, actions, ui }) {
  const { id } = use(params || { id: undefined })
  const searchParams = useSearchParams()
  const fileParam = searchParams?.get('file')
  const {
    Button,
    Calendar,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Input,
    icons = {}
  } = ui
  const {
    ChevronLeft: ChevronLeftIcon,
    ChevronRight: ChevronRightIcon,
    CalendarIcon,
  } = icons

  const [selectedImage, setSelectedImage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [availableDates, setAvailableDates] = useState([])
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [hasNewer, setHasNewer] = useState(false)

  useEffect(() => {
    loadInitialImage()
    loadAvailableDates()
  }, [fileParam])

  const loadAvailableDates = async () => {
    const result = await actions.getAvailableImageDates()
    if (result.success) setAvailableDates(result.availableDates)
  }

  const loadInitialImage = async () => {
    setLoading(true)
    // Check for file query param first
    if (fileParam && actions.getCameraImageByFilename) {
      const fileResult = await actions.getCameraImageByFilename(fileParam)
      if (fileResult.success && fileResult.data) {
        setSelectedImage(fileResult.data)
        // Check if there are newer/older images
        await checkBoundaries(fileResult.data)
        setLoading(false)
        return
      }
    }
    // Load most recent image
    const result = await actions.getImageByTimestamp(null, 'latest')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
  }

  const checkBoundaries = async (image) => {
    if (!image) return
    const timestamp = image.created || image.created_at
    // Check for newer
    const newerResult = await actions.getImageByTimestamp(timestamp, 'next')
    setHasNewer(newerResult.success && newerResult.data !== null)
    // Check for older
    const olderResult = await actions.getImageByTimestamp(timestamp, 'prev')
    setHasOlder(olderResult.success && olderResult.data !== null)
  }

  const jumpToDateTime = async () => {
    if (!selectedDate) return
    setLoading(true)
    const [h, m] = (selectedTime || '00:00').split(':')
    const dt = new Date(selectedDate)
    dt.setHours(parseInt(h || '0'), parseInt(m || '0'), 0, 0)
    const result = await actions.getImageByTimestamp(dt.toISOString(), 'closest')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
    setDatePickerOpen(false)
  }

  const skipToPreviousDay = async () => {
    if (!selectedImage || loadingMore) return
    setLoadingMore(true)
    const currentDate = new Date(selectedImage.created || selectedImage.created_at)
    currentDate.setDate(currentDate.getDate() - 1)
    const result = await actions.getImageByTimestamp(currentDate.toISOString(), 'closest')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const skipToNextDay = async () => {
    if (!selectedImage || loadingMore) return
    setLoadingMore(true)
    const currentDate = new Date(selectedImage.created || selectedImage.created_at)
    currentDate.setDate(currentDate.getDate() + 1)
    const result = await actions.getImageByTimestamp(currentDate.toISOString(), 'closest')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const stepToOlderImage = async () => {
    if (!selectedImage || loadingMore || !hasOlder) return
    setLoadingMore(true)
    const timestamp = selectedImage.created || selectedImage.created_at
    const result = await actions.getImageByTimestamp(timestamp, 'prev')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const stepToNewerImage = async () => {
    if (!selectedImage || loadingMore || !hasNewer) return
    setLoadingMore(true)
    const timestamp = selectedImage.created || selectedImage.created_at
    const result = await actions.getImageByTimestamp(timestamp, 'next')
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const isDateDisabled = (date) => {
    const d = new Date(date)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return !availableDates.includes(dateStr)
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const formatShortDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
  }

  return (
    <div className='h-full flex flex-col bg-accent-foreground'>
      {/* Top control bar */}
      <div className='w-full border-b border-gray-700 bg-primary px-4 py-2'>
        <div className="flex items-center justify-between gap-4">
          {/* Day skip and step navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={skipToPreviousDay}
              disabled={!selectedImage || loadingMore}
              title="Previous day"
              className="text-xs"
            >
              {ChevronLeftIcon ? <ChevronLeftIcon className="h-4 w-4 mr-1" /> : <span className="mr-1">◀</span>}
              -1 Day
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={stepToOlderImage}
              disabled={!hasOlder || loadingMore}
              title="Previous image"
            >
              {ChevronLeftIcon ? <ChevronLeftIcon className="h-4 w-4" /> : <span>◀</span>}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={stepToNewerImage}
              disabled={!hasNewer || loadingMore}
              title="Next image"
            >
              {ChevronRightIcon ? <ChevronRightIcon className="h-4 w-4" /> : <span>▶</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={skipToNextDay}
              disabled={!selectedImage || loadingMore}
              title="Next day"
              className="text-xs"
            >
              +1 Day
              {ChevronRightIcon ? <ChevronRightIcon className="h-4 w-4 ml-1" /> : <span className="ml-1">▶</span>}
            </Button>
          </div>

          {/* Current image timestamp display */}
          {selectedImage && (
            <div className="hidden sm:block text-gray-300 text-sm font-mono">
              {formatShortDate(selectedImage.created || selectedImage.created_at)}
            </div>
          )}

          {/* Date/time picker */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                {CalendarIcon ? <CalendarIcon className="mr-2 h-4 w-4" /> : <span className="mr-2">📅</span>}
                {selectedDate ? new Date(selectedDate).toLocaleDateString() + ' ' + selectedTime : 'Jump to date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} disabled={isDateDisabled} initialFocus />
              <div className="border-t p-3 flex items-center gap-2">
                <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-[120px]" />
                <Button onClick={jumpToDateTime} disabled={!selectedDate || loading} size="sm">Go</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main image area */}
      <div className='flex-1 flex items-center justify-center relative overflow-hidden bg-black'>
        {loading && <div className="text-white">Loading...</div>}
        {!loading && selectedImage && (
          <img
            src={selectedImage.url || selectedImage.image_url || '/placeholder.jpg'}
            alt={selectedImage.filename || 'Camera image'}
            className="block max-w-full max-h-full object-contain"
          />
        )}
        {!loading && !selectedImage && (
          <div className="text-gray-400 flex flex-col items-center gap-4">
            <p>No images available</p>
          </div>
        )}
      </div>

      {/* Footer with navigation and image info */}
      <div className='w-full border-t border-gray-700 bg-primary px-4 py-3'>
        <div className="flex items-center gap-4">
          {/* Previous image button */}
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={stepToOlderImage}
            disabled={!hasOlder || loadingMore}
            title="Previous image"
          >
            {ChevronLeftIcon ? <ChevronLeftIcon className="h-5 w-5" /> : <span>◀</span>}
          </Button>

          {/* Image info */}
          <div className="flex-1 min-w-0">
            {selectedImage ? (
              <div className="flex flex-wrap gap-4 md:gap-8 text-gray-300 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Timestamp</span>
                  <span>{formatDate(selectedImage.created || selectedImage.created_at)}</span>
                </div>
                {selectedImage.width && selectedImage.height && (
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-gray-400">Resolution</span>
                    <span>{selectedImage.width}×{selectedImage.height}</span>
                  </div>
                )}
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-gray-400">File Size</span>
                  <span>{formatFileSize(selectedImage.size || selectedImage.file_size)}</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">No image selected</div>
            )}
          </div>

          {/* Next image button */}
          <Button
            variant="secondary"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={stepToNewerImage}
            disabled={!hasNewer || loadingMore}
            title="Next image"
          >
            {ChevronRightIcon ? <ChevronRightIcon className="h-5 w-5" /> : <span>▶</span>}
          </Button>
        </div>
      </div>
    </div>
  )
}
