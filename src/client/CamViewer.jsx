"use client"
import { use, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// CamViewer is UI-agnostic: pass your UI components via the ui prop.
// Required ui props: Button, Calendar, Popover, PopoverTrigger, PopoverContent, Input
export default function CamViewer({ params, actions, ui }) {
  const { id } = use(params || { id: undefined })
  const searchParams = useSearchParams()
  const fileParam = searchParams?.get('file')
  const debugMode = searchParams?.get('debug') === 'true'
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
    CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Keyboard,
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
    const result = await actions.getAvailableImageDates(id)
    if (result.success) setAvailableDates(result.availableDates)
  }

  const loadInitialImage = async () => {
    setLoading(true)
    // Check for file query param first
    if (fileParam && actions.getCameraImageByFilename) {
      const fileResult = await actions.getCameraImageByFilename(fileParam, id)
      if (fileResult.success && fileResult.data) {
        setSelectedImage(fileResult.data)
        // Check if there are newer/older images
        await checkBoundaries(fileResult.data)
        setLoading(false)
        return
      }
    }
    // Load most recent image
    const result = await actions.getImageByTimestamp(null, 'latest', id)
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
    const newerResult = await actions.getImageByTimestamp(timestamp, 'next', id)
    setHasNewer(newerResult.success && newerResult.data !== null)
    // Check for older
    const olderResult = await actions.getImageByTimestamp(timestamp, 'prev', id)
    setHasOlder(olderResult.success && olderResult.data !== null)
  }

  const jumpToDateTime = async () => {
    if (!selectedDate) return
    setLoading(true)
    const [h, m] = (selectedTime || '00:00').split(':')
    const dt = new Date(selectedDate)
    dt.setHours(parseInt(h || '0'), parseInt(m || '0'), 0, 0)
    const result = await actions.getImageByTimestamp(dt.toISOString(), 'closest', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
    setDatePickerOpen(false)
  }

  const jumpToCurrent = async () => {
    setLoading(true)
    const result = await actions.getImageByTimestamp(null, 'latest', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
  }

  const skipToPreviousDay = useCallback(async () => {
    if (!selectedImage || loadingMore) return
    setLoadingMore(true)
    const currentDate = new Date(selectedImage.created || selectedImage.created_at)
    currentDate.setDate(currentDate.getDate() - 1)
    const result = await actions.getImageByTimestamp(currentDate.toISOString(), 'closest', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }, [selectedImage, loadingMore, actions, id])

  const skipToNextDay = useCallback(async () => {
    if (!selectedImage || loadingMore) return
    setLoadingMore(true)
    const currentDate = new Date(selectedImage.created || selectedImage.created_at)
    currentDate.setDate(currentDate.getDate() + 1)
    const result = await actions.getImageByTimestamp(currentDate.toISOString(), 'closest', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }, [selectedImage, loadingMore, actions, id])

  const stepToOlderImage = useCallback(async () => {
    if (!selectedImage || loadingMore || !hasOlder) return
    setLoadingMore(true)
    const timestamp = selectedImage.created || selectedImage.created_at
    const result = await actions.getImageByTimestamp(timestamp, 'prev', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }, [selectedImage, loadingMore, hasOlder, actions, id])

  const stepToNewerImage = useCallback(async () => {
    if (!selectedImage || loadingMore || !hasNewer) return
    setLoadingMore(true)
    const timestamp = selectedImage.created || selectedImage.created_at
    const result = await actions.getImageByTimestamp(timestamp, 'next', id)
    if (result.success && result.data) {
      setSelectedImage(result.data)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }, [selectedImage, loadingMore, hasNewer, actions, id])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          stepToOlderImage()
          break
        case 'ArrowRight':
          e.preventDefault()
          stepToNewerImage()
          break
        case 'ArrowUp':
          e.preventDefault()
          skipToNextDay()
          break
        case 'ArrowDown':
          e.preventDefault()
          skipToPreviousDay()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [stepToOlderImage, stepToNewerImage, skipToNextDay, skipToPreviousDay])

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

  return (
    <div className='h-full flex flex-col bg-accent-foreground'>
      {/* Main image area */}
      <div className='flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-black'>
        {loading && <div className="text-white">Loading...</div>}
        {!loading && selectedImage && (
          <img
            src={selectedImage.url || selectedImage.image_url || '/placeholder.jpg'}
            alt={selectedImage.filename || 'Camera image'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        {!loading && !selectedImage && (
          <div className="text-gray-400">
            <p>No images available</p>
          </div>
        )}
      </div>

      {/* Bottom control bar with all buttons */}
      <div className='shrink-0 w-full border-t border-gray-300 bg-white px-4 py-3'>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={skipToPreviousDay}
            disabled={!selectedImage || loadingMore}
            title="Previous day (↓)"
          >
            {ChevronLeft ? <ChevronLeft className="h-4 w-4" /> : '<'} Day
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={stepToOlderImage}
            disabled={!hasOlder || loadingMore}
            title="Previous image (←)"
          >
            {ChevronLeft ? <ChevronLeft className="h-4 w-4" /> : '<'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={stepToNewerImage}
            disabled={!hasNewer || loadingMore}
            title="Next image (→)"
          >
            {ChevronRight ? <ChevronRight className="h-4 w-4" /> : '>'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={skipToNextDay}
            disabled={!selectedImage || loadingMore || !hasNewer}
            title="Next day (↑)"
          >
            Day {ChevronRight ? <ChevronRight className="h-4 w-4" /> : '>'}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={jumpToCurrent}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            Current
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" title="Date picker">
                {CalendarIcon ? <CalendarIcon className="h-4 w-4" /> : '📅'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} disabled={isDateDisabled} initialFocus />
              <div className="border-t p-3 flex items-center gap-2">
                <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-[120px]" />
                <Button onClick={jumpToDateTime} disabled={!selectedDate || loading} size="sm">Go</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" title="Keyboard shortcuts">
                {Keyboard ? <Keyboard className="h-4 w-4" /> : '⌨'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="center">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Keyboard Shortcuts</h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Previous image</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">←</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Next image</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">→</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Next day</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">↑</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Previous day</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">↓</kbd>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Debug footer with image info - only shown when ?debug=true */}
      {debugMode && selectedImage && (
        <div className='shrink-0 w-full border-t border-gray-300 bg-gray-100 px-4 py-2'>
          <div className="flex flex-wrap items-center justify-center gap-4 text-gray-600 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Timestamp</span>
              <span>{formatDate(selectedImage.created || selectedImage.created_at)}</span>
            </div>
            {selectedImage.width && selectedImage.height && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Resolution</span>
                <span>{selectedImage.width}x{selectedImage.height}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">File Size</span>
              <span>{formatFileSize(selectedImage.size || selectedImage.file_size)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
