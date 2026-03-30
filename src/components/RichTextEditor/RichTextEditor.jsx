import { useRef, useEffect, useCallback } from 'react'
import './RichTextEditor.css'

const FONTS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Courier New', label: 'Courier New' }
]

const FONT_SIZES = [
  { value: '1', label: '10' },
  { value: '2', label: '12' },
  { value: '3', label: '14' },
  { value: '4', label: '18' },
  { value: '5', label: '24' },
  { value: '6', label: '36' }
]

export default function RichTextEditor({ value = '', onChange, placeholder, className }) {
  const editorRef = useRef(null)
  const savedRangeRef = useRef(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (el.innerHTML !== value) {
      el.innerHTML = value || ''
    }
  }, [value])

  const saveSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    } else {
      savedRangeRef.current = null
    }
  }, [])

  const restoreSelection = useCallback(() => {
    if (savedRangeRef.current && editorRef.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
  }, [])

  const notifyChange = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? ''
    onChange?.(html)
  }, [onChange])

  const exec = useCallback((cmd, valueArg = null) => {
    editorRef.current?.focus()
    restoreSelection()
    document.execCommand(cmd, false, valueArg)
    notifyChange()
  }, [notifyChange, restoreSelection])

  const applyFontSize = useCallback((size) => {
    exec('fontSize', size)
  }, [exec])

  const handleToolbarMouseDown = useCallback((e) => {
    saveSelection()
  }, [saveSelection])

  return (
    <div className={`rich-text-editor ${className || ''}`}>
      <div className="rich-text-toolbar" onMouseDown={handleToolbarMouseDown}>
        <select
          className="rich-text-select"
          onChange={e => exec('fontName', e.target.value)}
          title="Шрифт"
        >
          {FONTS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          className="rich-text-select rich-text-size"
          onChange={e => applyFontSize(e.target.value)}
          title="Размер"
        >
          {FONT_SIZES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <button type="button" className="rich-text-btn" onClick={() => exec('bold')} title="Жирный (Ctrl+B)">
          <b>Ж</b>
        </button>
        <button type="button" className="rich-text-btn" onClick={() => exec('italic')} title="Курсив (Ctrl+I)">
          <i>К</i>
        </button>
        <button type="button" className="rich-text-btn" onClick={() => exec('underline')} title="Подчёркнутый">
          <u>Ч</u>
        </button>
      </div>
      <div
        ref={editorRef}
        className="rich-text-content"
        contentEditable
        data-placeholder={placeholder}
        onInput={notifyChange}
        onBlur={notifyChange}
        suppressContentEditableWarning
      />
    </div>
  )
}
