import { ClipboardList, X, FileDown, FileText } from 'lucide-react'
import RichTextEditor from '../RichTextEditor/RichTextEditor'

/**
 * Кнопка + всплывающая панель заметок для мобильного shell плана (рядом с «Инструменты»).
 */
export default function PlanMobileNotesPopover({
  isOpen,
  onToggle,
  onClose,
  title,
  onTitleChange,
  showTitle,
  exerciseIndex,
  exerciseCount,
  textContent,
  onTextChange,
  onExportPdf,
  onExportWord,
  showWordExport,
  autoSaved
}) {
  return (
    <div className="plan-mobile-notes-wrap">
      <button
        type="button"
        className="plan-mobile-notes-toggle board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--outline"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title="Заметки к схеме и экспорт"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Заметки к схеме и экспорт"
      >
        <ClipboardList size={20} strokeWidth={2} aria-hidden />
      </button>
      {isOpen && (
        <div
          className="plan-mobile-notes-popover"
          role="dialog"
          aria-label="Заметки к схеме"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="plan-mobile-notes-popover-header">
            <span className="plan-mobile-notes-popover-heading">Заметки к схеме</span>
            <button
              type="button"
              className="plan-mobile-notes-popover-close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <X size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {showTitle && autoSaved && (
            <span className="plan-mobile-notes-autosaved">Сохранено</span>
          )}
          {showTitle && (
            <input
              type="text"
              className="plan-mobile-notes-title-input"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Название план-конспекта"
            />
          )}
          {exerciseCount > 1 && (
            <p className="plan-mobile-notes-exercise-label">
              Упражнение {exerciseIndex + 1}
            </p>
          )}
          <label className="plan-mobile-notes-editor-label">Текст к схеме</label>
          <div className="plan-mobile-notes-editor">
            <RichTextEditor
              value={textContent}
              onChange={onTextChange}
              placeholder="Опишите тренировку, упражнение, тактическую схему..."
              className="plan-text-editor plan-text-editor--mobile-popover"
            />
          </div>
          <div className="plan-mobile-notes-popover-exports">
            <button type="button" className="plan-mobile-notes-export-btn" onClick={onExportPdf}>
              <FileDown size={18} strokeWidth={2} aria-hidden />
              Сохранить в PDF
            </button>
            {showWordExport && (
              <button type="button" className="plan-mobile-notes-export-btn" onClick={onExportWord}>
                <FileText size={18} strokeWidth={2} aria-hidden />
                Сохранить в Word
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
