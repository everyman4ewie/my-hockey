import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const MARGIN = 10
const PAGE_W = 210
const PAGE_H = 297
const USABLE_W = PAGE_W - MARGIN * 2
const CELL_W = USABLE_W / 2
const CELL_PADDING = 3
const INNER_W = CELL_W - CELL_PADDING * 2
const CANVAS_ASPECT = 800 / 400
const ROW_PADDING = 4
const BORDER_COLOR = [0.4, 0.4, 0.4]

function createTextImage(html, widthPx) {
  const div = document.createElement('div')
  div.style.cssText = `
    position: absolute; left: -9999px; top: 0;
    width: ${widthPx}px; padding: 8px; font-size: 11px; line-height: 1.4;
    font-family: Arial, sans-serif; color: #000; background: #fff;
    box-sizing: border-box; white-space: pre-wrap; word-wrap: break-word;
  `
  div.innerHTML = html || '&nbsp;'
  document.body.appendChild(div)
  return html2canvas(div, { scale: 2, useCORS: true, logging: false })
    .then(canvas => {
      document.body.removeChild(div)
      const data = canvas.toDataURL('image/png')
      const hPx = canvas.height / 2
      const hMm = hPx * 0.264583
      return { data, heightMm: Math.min(hMm, 80) }
    })
    .catch(() => {
      document.body.removeChild(div)
      return null
    })
}

function createTitleImage(title) {
  const div = document.createElement('div')
  div.style.cssText = `
    position: absolute; left: -9999px; top: 0;
    font-size: 18px; font-weight: bold; font-family: Arial, sans-serif;
    color: #000; background: transparent; padding: 4px 0;
  `
  div.textContent = title || 'План-конспект'
  document.body.appendChild(div)
  return html2canvas(div, { scale: 2, logging: false })
    .then(canvas => {
      document.body.removeChild(div)
      return canvas.toDataURL('image/png')
    })
    .catch(() => {
      document.body.removeChild(div)
      return null
    })
}

export async function exportPlanToPdf(title, exercises, getCanvasById) {
  const doc = new jsPDF()
  let y = MARGIN

  const titleImg = await createTitleImage(title)
  if (titleImg) {
    doc.addImage(titleImg, 'PNG', MARGIN, y, 80, 8)
  }
  y += 12

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    const canvas = getCanvasById ? getCanvasById(i) : document.getElementById(`exercise-canvas-${i}`)
    const textHtml = ex.textContent || ''

    const textWidthPx = Math.round(INNER_W * 3.78)
    const textResult = await createTextImage(textHtml, textWidthPx)
    const textHeightMm = textResult ? textResult.heightMm : 0
    const maxImgH = INNER_W / CANVAS_ASPECT
    const rowH = Math.max(maxImgH + CELL_PADDING * 2, textHeightMm + CELL_PADDING * 2, 24)

    if (y + rowH > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }

    const rowStartY = y
    const leftX = MARGIN
    const rightX = MARGIN + CELL_W

    doc.setDrawColor(...BORDER_COLOR)
    doc.setLineWidth(0.3)
    doc.rect(leftX, y, CELL_W, rowH)
    doc.rect(rightX, y, CELL_W, rowH)

    if (canvas) {
      try {
        const imgData = canvas.toDataURL('image/png')
        const availW = INNER_W
        const availH = rowH - CELL_PADDING * 2
        let imgW = availW
        let imgH = imgW / CANVAS_ASPECT
        if (imgH > availH) {
          imgH = availH
          imgW = imgH * CANVAS_ASPECT
        }
        doc.addImage(imgData, 'PNG', leftX + CELL_PADDING, y + CELL_PADDING, imgW, imgH)
      } catch (_) {}
    }

    if (textResult?.data) {
      try {
        const th = Math.min(rowH - CELL_PADDING * 2, textResult.heightMm)
        doc.addImage(textResult.data, 'PNG', rightX + CELL_PADDING, y + CELL_PADDING, INNER_W, th)
      } catch (_) {}
    }

    y = rowStartY + rowH + ROW_PADDING
  }

  const safeName = (title || 'plan').replace(/[/\\?*:"<>|]/g, '-').trim() || 'plan'
  doc.save(`${safeName}-${Date.now()}.pdf`)
}
