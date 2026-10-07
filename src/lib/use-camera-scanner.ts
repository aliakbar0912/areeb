'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ScannerState {
  stream: MediaStream | null
  error: string | null
  isReady: boolean
  facingMode: 'environment' | 'user'
}

/**
 * Hook for accessing the device camera via getUserMedia.
 * Prefers the rear (environment) camera for medicine scanning.
 */
export function useCameraScanner() {
  const [state, setState] = useState<ScannerState>({
    stream: null,
    error: null,
    isReady: false,
    facingMode: 'environment',
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async (facing: 'environment' | 'user' = 'environment') => {
    setState(prev => ({ ...prev, error: null }))

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState(prev => ({ ...prev, error: 'Camera API not supported in this browser.' }))
      return false
    }

    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      setState({
        stream,
        error: null,
        isReady: true,
        facingMode: facing,
      })
      return true
    } catch (err: any) {
      let msg = 'Could not access camera.'
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in your browser settings.'
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        msg = 'No camera found on this device.'
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application.'
      } else if (err?.name === 'OverconstrainedError') {
        // Fallback: try without facingMode constraint
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => {})
          }
          setState({ stream, error: null, isReady: true, facingMode: facing })
          return true
        } catch (fallbackErr: any) {
          msg = `Camera constraint error: ${fallbackErr?.message || 'Unknown'}`
        }
      } else if (err?.message) {
        msg = err.message
      }
      setState(prev => ({ ...prev, error: msg, isReady: false }))
      return false
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setState({ stream: null, error: null, isReady: false, facingMode: 'environment' })
  }, [])

  const switchCamera = useCallback(async () => {
    const next = state.facingMode === 'environment' ? 'user' : 'environment'
    await startCamera(next)
  }, [state.facingMode, startCamera])

  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !state.isReady) return null

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to JPEG data URL (smaller than PNG for upload)
    // Quality 0.85 balances size and OCR accuracy
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return dataUrl
  }, [state.isReady])

  const captureFromGallery = useCallback((file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        resolve(e.target?.result as string || null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  return {
    videoRef,
    state,
    startCamera,
    stopCamera,
    switchCamera,
    capturePhoto,
    captureFromGallery,
  }
}
