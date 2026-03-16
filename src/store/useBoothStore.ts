import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface PlacedObject {
  id: string
  name: string
  position: [number, number, number]
  scale: [number, number, number]
}

export type EditorMode = 'edit' | 'preview'
export type TransformMode = 'translate' | 'rotate' | 'scale'

type SendMessageFn = (msg: Record<string, unknown>, transfer?: Transferable[]) => void

interface BoothStore {
  htmlSource: string | null
  setHtmlSource: (html: string) => void

  editorReady: boolean
  setEditorReady: (ready: boolean) => void

  objects: PlacedObject[]
  addObject: (name: string, buffer: ArrayBuffer) => void
  removeObject: (id: string) => void
  updateObjectTransform: (
    id: string,
    position: [number, number, number],
    scale: [number, number, number]
  ) => void
  onObjectAdded: (id: string, name: string) => void

  selectedId: string | null
  selectObject: (id: string | null) => void

  editorMode: EditorMode
  setEditorMode: (mode: EditorMode) => void
  transformMode: TransformMode
  setTransformMode: (mode: TransformMode) => void

  exportStatus: string | null
  editorStatus: string | null

  _sendMessage: SendMessageFn | null
  _setSendMessage: (fn: SendMessageFn) => void
}

export const useBoothStore = create<BoothStore>((set, get) => ({
  htmlSource: null,
  setHtmlSource: (html) =>
    set({ htmlSource: html, editorReady: false, objects: [], selectedId: null }),

  editorReady: false,
  setEditorReady: (ready) => set({ editorReady: ready }),

  objects: [],
  addObject: (name, buffer) => {
    const id = uuidv4()
    const send = get()._sendMessage
    if (send) {
      send({ type: 'ADD_OBJECT', id, name, buffer }, [buffer])
    }
  },
  removeObject: (id) => {
    const send = get()._sendMessage
    if (send) {
      send({ type: 'REMOVE_OBJECT', id })
    }
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }))
  },
  updateObjectTransform: (id, position, scale) =>
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, position, scale } : o
      ),
    })),
  onObjectAdded: (id, name) =>
    set((state) => ({
      objects: [
        ...state.objects,
        { id, name, position: [0, 0, 0], scale: [1, 1, 1] },
      ],
    })),

  selectedId: null,
  selectObject: (id) => {
    const send = get()._sendMessage
    if (send) {
      send({ type: 'SELECT_OBJECT', id })
    }
    set({ selectedId: id })
  },

  editorMode: 'edit',
  setEditorMode: (mode) => {
    const send = get()._sendMessage
    if (send) {
      send({ type: 'SET_EDITOR_MODE', mode })
    }
    set({
      editorMode: mode,
      selectedId: mode === 'preview' ? null : get().selectedId,
    })
  },

  transformMode: 'translate',
  setTransformMode: (mode) => {
    const send = get()._sendMessage
    if (send) {
      send({ type: 'SET_TRANSFORM_MODE', mode })
    }
    set({ transformMode: mode })
  },

  exportStatus: null,
  editorStatus: null,

  _sendMessage: null,
  _setSendMessage: (fn) => set({ _sendMessage: fn }),
}))
