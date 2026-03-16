import { useRef } from 'react'
import { useBoothStore } from '../../store/useBoothStore'

export function ObjectManager() {
  const fileInputRef = useRef<HTMLInputElement>(null!)
  const objects = useBoothStore((s) => s.objects)
  const selectedId = useBoothStore((s) => s.selectedId)
  const addObject = useBoothStore((s) => s.addObject)
  const removeObject = useBoothStore((s) => s.removeObject)
  const selectObject = useBoothStore((s) => s.selectObject)
  const editorReady = useBoothStore((s) => s.editorReady)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    addObject(file.name, buffer)
    fileInputRef.current.value = ''
  }

  return (
    <div className="panel">
      <h3>Objects</h3>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
      <button
        className="btn btn-primary"
        onClick={() => fileInputRef.current.click()}
        disabled={!editorReady}
      >
        Upload GLB Model
      </button>

      <div className="object-list">
        {objects.length === 0 && (
          <p className="hint">No objects yet. Upload a .glb file to get started.</p>
        )}
        {objects.map((obj) => (
          <div
            key={obj.id}
            className={`object-item ${selectedId === obj.id ? 'selected' : ''}`}
          >
            <span
              className="object-name"
              onClick={() => selectObject(obj.id)}
              title={obj.name}
            >
              {obj.name}
            </span>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => removeObject(obj.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
