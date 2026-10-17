import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { PhotoError, preparePhoto, type PreparedPhoto } from '../lib/image'

export const MAX_PHOTOS = 4

/**
 * Photo attachments for a composer: camera (one shot at a time), gallery
 * (pick several at once), paste and drag-and-drop all feed the same list.
 */
export function usePhotoAttachments(max = MAX_PHOTOS) {
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos

  // Free preview object URLs when the component goes away.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), [])

  const add = useCallback(
    async (files: Iterable<File> | null | undefined) => {
      const list = [...(files ?? [])].filter((f) => !f.type || f.type.startsWith('image/'))
      if (!list.length) return
      setError(null)
      const room = max - photosRef.current.length
      if (room <= 0) {
        setError(`Up to ${max} photos at a time.`)
        return
      }
      const take = list.slice(0, room)
      if (list.length > room) setError(`Only the first ${room} photo${room > 1 ? 's were' : ' was'} added (max ${max}).`)
      setPreparing((n) => n + take.length)
      for (const file of take) {
        try {
          const prepared = await preparePhoto(file)
          setPhotos((prev) => (prev.length < max ? [...prev, prepared] : prev))
        } catch (err) {
          setError(err instanceof PhotoError ? err.message : 'Could not open one of those photos.')
        } finally {
          setPreparing((n) => n - 1)
        }
      }
    },
    [max],
  )

  const remove = useCallback((index: number) => {
    setPhotos((prev) => {
      const gone = prev[index]
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      return []
    })
    setError(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }, [])

  return {
    photos,
    preparing: preparing > 0,
    error,
    setError,
    add,
    remove,
    clear,
    full: photos.length >= max,
    openCamera: () => cameraRef.current?.click(),
    openGallery: () => galleryRef.current?.click(),
    /** Render once inside the composer: the two hidden file inputs. */
    inputs: (
      <>
        {/* `capture` opens the rear camera on phones; the gallery input allows several at once. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void add(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void add(e.target.files)
            e.target.value = ''
          }}
        />
      </>
    ),
  }
}

export type PhotoAttachments = ReturnType<typeof usePhotoAttachments>

/** Thumbnails of attached photos, each removable. */
export function PhotoStrip({
  attachments,
  disabled,
  size = 'size-16',
}: {
  attachments: PhotoAttachments
  disabled?: boolean
  size?: string
}) {
  const { photos, preparing, remove } = attachments
  if (!photos.length && !preparing) return null
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={p.previewUrl} className={`relative ${size} shrink-0 overflow-hidden rounded-lg bg-line`}>
          <img src={p.previewUrl} alt={`Photo ${i + 1}`} className="size-full object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {preparing && <div className={`shimmer ${size} shrink-0 rounded-lg`} aria-label="Preparing photo" />}
    </div>
  )
}

/** "Scan plate" (camera) + gallery buttons. */
export function AttachButtons({
  attachments,
  disabled,
  cameraLabel = 'Scan plate',
}: {
  attachments: PhotoAttachments
  disabled?: boolean
  cameraLabel?: string | null
}) {
  const off = disabled || attachments.preparing || attachments.full
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={attachments.openCamera}
        disabled={off}
        aria-label={cameraLabel ?? 'Take a photo'}
        title={attachments.full ? `Up to ${MAX_PHOTOS} photos` : 'Take a photo'}
        className={cameraLabel ? 'btn-ghost gap-1.5 px-2.5 py-2 text-[13px]' : 'icon-btn'}
      >
        <Camera className="size-4.5" aria-hidden />
        {cameraLabel}
      </button>
      <button
        type="button"
        onClick={attachments.openGallery}
        disabled={off}
        aria-label="Choose photos from your gallery"
        title={attachments.full ? `Up to ${MAX_PHOTOS} photos` : 'Choose photos (several at once)'}
        className="icon-btn"
      >
        <ImagePlus className="size-4.5" aria-hidden />
      </button>
    </div>
  )
}
