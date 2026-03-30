import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TableBorders,
  BorderStyle,
  ImageRun,
  TextRun,
  WidthType,
  HeadingLevel,
  HeightRule,
  TableLayoutType
} from 'docx'
import { saveAs } from 'file-saver'

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim()
}

function base64ToUint8Array(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export async function exportPlanToWord(title, exercises, getCanvasById) {
  const rows = []

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    const canvas = getCanvasById ? getCanvasById(i) : document.getElementById(`exercise-canvas-${i}`)
    const text = stripHtml(ex.textContent || '')

    const leftCellChildren = []
    if (canvas) {
      try {
        const imgData = canvas.toDataURL('image/png')
        const arr = base64ToUint8Array(imgData)
        leftCellChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: arr,
                transformation: { width: 260, height: 130 }
              })
            ]
          })
        )
      } catch (_) {}
    }
    if (leftCellChildren.length === 0) {
      leftCellChildren.push(new Paragraph({ text: '' }))
    }

    const rightCellChildren = [
      new Paragraph({
        children: [new TextRun({ text: text || ' ' })]
      })
    ]

    rows.push(
      new TableRow({
        height: { value: 2500, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            children: leftCellChildren,
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 80, right: 80 }
          }),
          new TableCell({
            children: rightCellChildren,
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 80, right: 80 }
          })
        ]
      })
    )
  }

  const table = new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4320, 4320],
    layout: TableLayoutType.FIXED,
    borders: new TableBorders({
      top: { style: BorderStyle.SINGLE, size: 6, color: '444444' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '444444' },
      left: { style: BorderStyle.SINGLE, size: 6, color: '444444' },
      right: { style: BorderStyle.SINGLE, size: 6, color: '444444' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: '444444' },
      insideVertical: { style: BorderStyle.SINGLE, size: 6, color: '444444' }
    })
  })

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title || 'План-конспект',
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 }
          }),
          table
        ]
      }
    ]
  })

  const blob = await Packer.toBlob(doc)
  const safeName = (title || 'plan').replace(/[/\\?*:"<>|]/g, '-').trim() || 'plan'
  saveAs(blob, `${safeName}-${Date.now()}.docx`)
}
