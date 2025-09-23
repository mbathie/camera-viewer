"use client"
import { use, useEffect, useMemo, useState } from 'react'

// CamViewer is UI-agnostic: pass your UI components via the ui prop.
// Required ui props: Button, Calendar, Popover, PopoverTrigger, PopoverContent, Input, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger
export default function CamViewer({ params, actions, ui }) {
  const { id } = use(params || { id: undefined })
  const {
    Button,
    Calendar,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Input,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger,
    icons = {}
  } = ui
  const {
    ChevronLeft: ChevronLeftIcon,
    ChevronRight: ChevronRightIcon,
    CalendarIcon,
    Camera: CameraIcon,
  } = icons

  const [images, setImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imagesSidebarOpen, setImagesSidebarOpen] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [hasNewer, setHasNewer] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [availableDates, setAvailableDates] = useState([])
  const [desktopDatePickerOpen, setDesktopDatePickerOpen] = useState(false)
  const [mobileDatePickerOpen, setMobileDatePickerOpen] = useState(false)

  useEffect(() => {
    loadImages()
    loadAvailableDates()
  }, [])

  const loadAvailableDates = async () => {
    const result = await actions.getAvailableImageDates()
    if (result.success) setAvailableDates(result.availableDates)
  }

  const loadImages = async () => {
    setLoading(true)
    const result = await actions.getCameraImagesPaginated(14)
    if (result.success && result.data.length) {
      setImages(result.data)
      setSelectedImage(result.data[0])
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
  }

  const loadNewerImages = async () => {
    if (!images.length || loadingMore || !hasNewer) return
    setLoadingMore(true)
    const highestId = Math.max(...images.map((i) => i.id))
    const result = await actions.getCameraImagesPaginated(14, null, highestId)
    if (result.success && result.data.length) {
      setImages(result.data)
      setSelectedImage(result.data[0])
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const loadOlderImages = async () => {
    if (!images.length || loadingMore || !hasOlder) return
    setLoadingMore(true)
    const lowestId = Math.min(...images.map((i) => i.id))
    const result = await actions.getCameraImagesPaginated(14, lowestId, null)
    if (result.success && result.data.length) {
      setImages(result.data)
      setSelectedImage(result.data[0])
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoadingMore(false)
  }

  const jumpToDateTime = async () => {
    if (!selectedDate) return
    setLoading(true)
    const [h, m] = (selectedTime || '00:00').split(':')
    const dt = new Date(selectedDate)
    dt.setHours(parseInt(h || '0'), parseInt(m || '0'), 0, 0)
    const result = await actions.getCameraImagesByDateTime(dt.toISOString(), 14)
    if (result.success && result.data.length) {
      setImages(result.data)
      const closest = result.closestImage || result.data[0]
      setSelectedImage(closest)
      setHasOlder(result.hasOlder)
      setHasNewer(result.hasNewer)
    }
    setLoading(false)
    setDesktopDatePickerOpen(false)
    setMobileDatePickerOpen(false)
  }

  const isDateDisabled = (date) => {
    const dateStr = new Date(date).toISOString().split('T')[0]
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

  const ThumbnailGrid = ({ onImageSelect }) => (
    <div className="flex-1 overflow-y-auto p-4">
      {loading ? (
        <div className="text-gray-400 text-center py-4">Loading...</div>
      ) : images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {images.map((image, index) => (
            <div key={image.id || index} onClick={() => { setSelectedImage(image); if (onImageSelect) onImageSelect() }} className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:opacity-100 ${selectedImage?.id === image.id ? 'border-blue-500 opacity-100' : 'border-gray-600 opacity-70 hover:border-gray-500'}`}>
              <div className="aspect-square bg-gray-900 relative">
                <img src={image.url || image.image_url || '/placeholder.jpg'} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-[11px] truncate text-center">
                    {new Date(image.created || image.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-center py-4">No images found</div>
      )}
    </div>
  )

  return (
    <div className='h-full flex flex-col bg-accent-foreground'>
      <div className='flex-1 flex flex-row relative overflow-hidden'>
        <div className='w-full h-full flex flex-col'>
          <div className='w-full flex-1 bg-white flex items-center justify-center relative overflow-hidden'>
            {loading && <div className="text-white">Loading images...</div>}
            {!loading && selectedImage && (
              <div className="relative w-full h-full flex items-center justify-center">
                <img src={selectedImage.url || selectedImage.image_url || '/placeholder.jpg'} alt={selectedImage.filename || 'Camera image'} className="max-w-full max-h-full object-contain" />
              </div>
            )}
            {!loading && !selectedImage && (<div className="text-gray-400 flex flex-col items-center gap-4"><p>No images available</p></div>)}
          </div>
        </div>

        <div className="hidden md:flex w-96 border-l border-gray-700 flex-col">
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={loadOlderImages} disabled={!hasOlder || loadingMore}>
                  {ChevronLeftIcon ? <ChevronLeftIcon className="h-4 w-4" /> : <span>◀</span>}
                </Button>
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={loadNewerImages} disabled={!hasNewer || loadingMore}>
                  {ChevronRightIcon ? <ChevronRightIcon className="h-4 w-4" /> : <span>▶</span>}
                </Button>
              </div>
              <div className="flex items-center">
                <Popover open={desktopDatePickerOpen} onOpenChange={setDesktopDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                      {CalendarIcon ? <CalendarIcon className="mr-2 h-4 w-4" /> : <span className="mr-2">📅</span>}
                      {selectedDate ? new Date(selectedDate).toLocaleDateString() + ' ' + selectedTime : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} disabled={isDateDisabled} initialFocus />
                    <div className="border-t p-3 flex items-center gap-2">
                      <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-[140px]" />
                      <Button onClick={jumpToDateTime} disabled={!selectedDate || loading} size="sm">Go</Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <ThumbnailGrid />
        </div>

        <Sheet open={imagesSidebarOpen} onOpenChange={setImagesSidebarOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden absolute top-1 right-2 z-40">
              {CameraIcon ? <CameraIcon className="size-6" /> : <span>📷</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 bg-primary border-none" hideClose>
            <SheetHeader className="p-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="sr-only">Recent Images</SheetTitle>
                <div className="flex gap-1">
                  <Button size="icon" className="h-8 w-8" onClick={loadOlderImages} disabled={!hasOlder || loadingMore}>
                    {ChevronLeftIcon ? <ChevronLeftIcon className="h-4 w-4" /> : <span>◀</span>}
                  </Button>
                  <Button size="icon" className="h-8 w-8" onClick={loadNewerImages} disabled={!hasNewer || loadingMore}>
                    {ChevronRightIcon ? <ChevronRightIcon className="h-4 w-4" /> : <span>▶</span>}
                  </Button>
                </div>
                <div className="flex items-center">
                  <Popover open={mobileDatePickerOpen} onOpenChange={setMobileDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                        {CalendarIcon ? <CalendarIcon className="mr-2 h-4 w-4" /> : <span className="mr-2">📅</span>}
                        {selectedDate ? new Date(selectedDate).toLocaleDateString() + ' ' + selectedTime : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} disabled={isDateDisabled} initialFocus />
                      <div className="border-t p-3 flex items-center gap-2">
                        <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="w-[140px]" />
                        <Button onClick={jumpToDateTime} disabled={!selectedDate || loading} size="sm">Go</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <SheetDescription className="sr-only">Browse recent camera images</SheetDescription>
            </SheetHeader>
            <ThumbnailGrid onImageSelect={() => setImagesSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className='w-full border-t border-gray-700 bg-accent-foreground px-4 py-3'>
        {selectedImage ? (
          <div className="flex flex-wrap gap-4 md:gap-8 text-gray-300 text-sm">
            <div className="flex items-center gap-2"><span className="text-gray-400">Timestamp</span><span>{formatDate(selectedImage.created || selectedImage.created_at)}</span></div>
            {selectedImage.width && selectedImage.height && (<div className="flex items-center gap-2"><span className="text-gray-400">Resolution</span><span>{selectedImage.width}×{selectedImage.height}</span></div>)}
            <div className="flex items-center gap-2"><span className="text-gray-400">File Size</span><span>{formatFileSize(selectedImage.size || selectedImage.file_size)}</span></div>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">No image selected</div>
        )}
      </div>
    </div>
  )
}
