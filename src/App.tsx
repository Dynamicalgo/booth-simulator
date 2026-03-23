import { useEffect, useRef, useCallback, useState } from 'react'
import { Sidebar } from './components/ui/Sidebar'
import { useBoothStore } from './store/useBoothStore'
import { injectEditorIntoHtml } from './utils/injectEditor'
import './App.css'

function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const htmlSource = useBoothStore((s) => s.htmlSource)
  const setHtmlSource = useBoothStore((s) => s.setHtmlSource)
  const setEditorReady = useBoothStore((s) => s.setEditorReady)
  const onObjectAdded = useBoothStore((s) => s.onObjectAdded)
  const updateObjectTransform = useBoothStore((s) => s.updateObjectTransform)
  const _setSendMessage = useBoothStore((s) => s._setSendMessage)

  // Load default booth on mount
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'default-booth.html')
      .then((r) => r.text())
      .then((html) => setHtmlSource(html))
      .catch((err) => console.error('Failed to load default booth:', err))
  }, [setHtmlSource])

  // Set up the send function when iframe loads
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    _setSendMessage((msg: Record<string, unknown>, transfer?: Transferable[]) => {
      iframe.contentWindow?.postMessage(msg, '*', transfer || [])
    })
  }, [_setSendMessage])

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || !data.type) return

      switch (data.type) {
        case 'EDITOR_READY':
          setEditorReady(true)
          useBoothStore.setState({ editorStatus: null })
          break
        case 'OBJECT_ADDED':
          onObjectAdded(data.id, data.name)
          break
        case 'OBJECT_SELECTED':
          // Direct setState to avoid sending message back to iframe (loop)
          useBoothStore.setState({ selectedId: data.id ?? null })
          break
        case 'TRANSFORM_CHANGED':
          updateObjectTransform(data.id, data.position, data.scale)
          break
        case 'SCREENSHOT_RESULT': {
          const link = document.createElement('a')
          link.href = data.dataUrl
          link.download = 'booth-screenshot-' + Date.now() + '.png'
          link.click()
          break
        }
        case 'EXPORT_GLTF_RESULT': {
          const blob = new Blob([data.gltf], { type: 'model/gltf+json' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'booth-export-' + Date.now() + '.gltf'
          link.click()
          URL.revokeObjectURL(url)
          useBoothStore.setState({ exportStatus: null })
          break
        }
        case 'EXPORT_GLB_LOADING':
          useBoothStore.setState({ exportStatus: 'Loading exporter...' })
          break
        case 'EXPORT_GLB_ERROR':
          useBoothStore.setState({ exportStatus: 'Error: ' + data.message })
          setTimeout(() => useBoothStore.setState({ exportStatus: null }), 5000)
          break
        case 'EDITOR_WAITING':
          useBoothStore.setState({ editorStatus: `Waiting for scene... (${data.elapsed}s) — missing: ${(data.missing as string[]).join(', ')}` })
          break
        case 'EDITOR_ERROR':
          console.error('Booth Editor Error:', data.message)
          useBoothStore.setState({ editorStatus: 'Error: ' + data.message })
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setEditorReady, onObjectAdded, updateObjectTransform])

  const injectedHtml = htmlSource ? injectEditorIntoHtml(htmlSource) : null
  const blobUrlRef = useRef<string | null>(null)

  // Create a blob URL from the injected HTML so the iframe has a real origin
  // (supports import maps, ES modules, etc.)
  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    if (injectedHtml) {
      const blob = new Blob([injectedHtml], { type: 'text/html' })
      blobUrlRef.current = URL.createObjectURL(blob)
    }
    // Force re-render by updating a state
    setIframeSrc(blobUrlRef.current)
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [injectedHtml])

  const [iframeSrc, setIframeSrc] = useState<string | null>(null)

  return (
    <div className="app">
      <Sidebar />
      <div className="viewport">
        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            onLoad={handleIframeLoad}
            title="Booth Viewer"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <div className="viewport-empty">
            <p>Loading booth...</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
