import { useBoothStore } from '../../store/useBoothStore'

export function TransformPanel() {
  const selectedId = useBoothStore((s) => s.selectedId)
  const objects = useBoothStore((s) => s.objects)
  const editorMode = useBoothStore((s) => s.editorMode)
  const transformMode = useBoothStore((s) => s.transformMode)
  const setTransformMode = useBoothStore((s) => s.setTransformMode)
  const selectObject = useBoothStore((s) => s.selectObject)

  if (!selectedId || editorMode !== 'edit') return null

  const selected = objects.find((o) => o.id === selectedId)
  if (!selected) return null

  const fmt = (n: number) => n.toFixed(2)

  return (
    <div className="panel">
      <h3>Transform</h3>

      <div className="transform-modes">
        <button
          className={`btn ${transformMode === 'translate' ? 'btn-active' : ''}`}
          onClick={() => setTransformMode('translate')}
        >
          Move
        </button>
        <button
          className={`btn ${transformMode === 'rotate' ? 'btn-active' : ''}`}
          onClick={() => setTransformMode('rotate')}
        >
          Rotate
        </button>
        <button
          className={`btn ${transformMode === 'scale' ? 'btn-active' : ''}`}
          onClick={() => setTransformMode('scale')}
        >
          Scale
        </button>
      </div>

      <div className="transform-info">
        <div>
          <strong>Position:</strong>{' '}
          {fmt(selected.position[0])}, {fmt(selected.position[1])}, {fmt(selected.position[2])}
        </div>
        <div>
          <strong>Scale:</strong>{' '}
          {fmt(selected.scale[0])}, {fmt(selected.scale[1])}, {fmt(selected.scale[2])}
        </div>
      </div>

      <button className="btn" onClick={() => selectObject(null)}>
        Deselect
      </button>
    </div>
  )
}
