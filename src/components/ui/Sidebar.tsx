import { useRef } from 'react'
import { useBoothStore } from '../../store/useBoothStore'
import { ObjectManager } from './ObjectManager'
import { TransformPanel } from './TransformPanel'

export function Sidebar() {
  const fileInputRef = useRef<HTMLInputElement>(null!)
  const editorMode = useBoothStore((s) => s.editorMode)
  const setEditorMode = useBoothStore((s) => s.setEditorMode)
  const editorReady = useBoothStore((s) => s.editorReady)
  const editorStatus = useBoothStore((s) => s.editorStatus)
  const setHtmlSource = useBoothStore((s) => s.setHtmlSource)
  const _sendMessage = useBoothStore((s) => s._sendMessage)
  const exportStatus = useBoothStore((s) => s.exportStatus)

  const handleScreenshot = () => {
    if (_sendMessage) {
      _sendMessage({ type: 'CAPTURE_SCREENSHOT', width: 1920, height: 1080 })
    }
  }

  const handleExportGlb = () => {
    if (_sendMessage) {
      _sendMessage({ type: 'EXPORT_GLB' })
    }
  }

  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setHtmlSource(reader.result as string)
    }
    reader.readAsText(file)
    fileInputRef.current.value = ''
  }

  return (
    <div className="sidebar">
      <h2>Booth Simulator</h2>

      <div className="panel">
        <h3>Booth HTML</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
          onChange={handleHtmlUpload}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn-primary"
          onClick={() => fileInputRef.current.click()}
        >
          Load Booth HTML
        </button>
        <p className="hint">
          {editorReady
            ? 'Editor connected'
            : editorStatus || 'Waiting for editor...'}
        </p>
      </div>

      <div className="mode-toggle">
        <button
          className={`btn ${editorMode === 'edit' ? 'btn-active' : ''}`}
          onClick={() => setEditorMode('edit')}
        >
          Edit
        </button>
        <button
          className={`btn ${editorMode === 'preview' ? 'btn-active' : ''}`}
          onClick={() => setEditorMode('preview')}
        >
          Preview
        </button>
      </div>

      <ObjectManager />
      <TransformPanel />

      <div className="panel">
        <h3>Export</h3>
        <button
          className="btn btn-primary"
          onClick={handleScreenshot}
          disabled={!editorReady}
        >
          Screenshot (16:9 PNG)
        </button>
        <button
          className="btn btn-primary"
          onClick={handleExportGlb}
          disabled={!editorReady}
          style={{ marginTop: 4 }}
        >
          Download GLTF
        </button>
        {exportStatus && (
          <p className={`hint ${exportStatus.startsWith('Error') ? 'error' : ''}`}>
            {exportStatus}
          </p>
        )}
        <p className="hint">GLTF preserves geometry, materials & textures — open in Blender, SketchUp, 3DViewer.net, etc.</p>
      </div>
    </div>
  )
}
