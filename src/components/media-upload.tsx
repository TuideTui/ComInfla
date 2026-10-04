'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'cominfla-media'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function compressImage(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.')

  const bitmap = await createImageBitmap(file)
  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar a imagem.')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
  if (!blob) throw new Error('Não foi possível compactar a imagem.')
  if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem ficou maior que 5 MB. Escolha uma imagem menor.')
  return blob
}

export function MediaUpload({
  name,
  userId,
  folder,
  initialPath = '',
  initialUrl = '',
  label = 'Foto',
}: {
  name: string
  userId: string
  folder: 'products' | 'establishments'
  initialPath?: string | null
  initialUrl?: string | null
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [path, setPath] = useState(initialPath ?? '')
  const [preview, setPreview] = useState(initialUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function chooseFile(file?: File) {
    if (!file) return
    setUploading(true)
    setError('')

    try {
      const supabase = createClient()
      const blob = await compressImage(file)
      const nextPath = `${userId}/${folder}/${crypto.randomUUID()}.webp`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(nextPath, blob, {
        contentType: 'image/webp',
        upsert: false,
      })
      if (uploadError) throw uploadError

      if (path && path !== initialPath) {
        await supabase.storage.from(BUCKET).remove([path])
      }

      setPath(nextPath)
      setPreview(URL.createObjectURL(blob))
    } catch (uploadError) {
      const text = uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar a imagem.'
      setError(text)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removePhoto() {
    if (path && path !== initialPath) {
      const supabase = createClient()
      await supabase.storage.from(BUCKET).remove([path])
    }
    setPath('')
    setPreview('')
    setError('')
  }

  return (
    <div className="media-upload">
      <input type="hidden" name={name} value={path} />
      <input
        ref={inputRef}
        className="media-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />

      <div className="media-preview">
        {preview ? <img src={preview} alt="Prévia da imagem" /> : <div className="media-placeholder">Sem foto</div>}
      </div>
      <div className="media-copy">
        <span>{label}</span>
        <small>Opcional · JPG, PNG ou WebP · a imagem é reduzida antes do envio.</small>
        {error ? <em>{error}</em> : null}
        <div className="media-actions">
          <button type="button" className="ghost-button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Enviando…' : preview ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {preview ? <button type="button" className="danger-link" onClick={removePhoto}>Remover</button> : null}
        </div>
      </div>
    </div>
  )
}
