import { embedSrcFromVideoUrl } from './helpEmbed'
import './HelpCenterBlocks.css'

export function HelpCenterBlocks({ blocks }) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return <p className="help-center-empty-blocks">Материал скоро появится.</p>
  }
  return (
    <div className="help-center-blocks">
      {blocks.map((b, i) => (
        <HelpBlock key={i} block={b} />
      ))}
    </div>
  )
}

function HelpBlock({ block }) {
  if (!block || typeof block !== 'object') return null
  if (block.type === 'paragraph') {
    return (
      <div className="help-block help-block--paragraph">
        {String(block.text || '')
          .split('\n')
          .map((line, j) => (
            <p key={j}>{line}</p>
          ))}
      </div>
    )
  }
  if (block.type === 'heading') {
    const Tag = block.level === 3 ? 'h3' : 'h2'
    return (
      <Tag className="help-block help-block--heading">{block.text}</Tag>
    )
  }
  if (block.type === 'image') {
    const src = String(block.src || '').trim()
    if (!src) return null
    return (
      <figure className="help-block help-block--image">
        <img src={src} alt={block.alt || ''} loading="lazy" />
        {block.alt ? <figcaption>{block.alt}</figcaption> : null}
      </figure>
    )
  }
  if (block.type === 'video') {
    const src = String(block.src || '').trim()
    if (!src) return null
    if (block.kind === 'embed') {
      const embed = embedSrcFromVideoUrl(src)
      if (embed) {
        return (
          <div className="help-block help-block--video help-block--embed">
            <iframe
              title="Видео"
              src={embed}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )
      }
      return (
        <p className="help-block help-block--video-link">
          <a href={src} target="_blank" rel="noopener noreferrer">
            Открыть видео
          </a>
        </p>
      )
    }
    return (
      <div className="help-block help-block--video">
        <video controls src={src} preload="metadata">
          <track kind="captions" />
        </video>
      </div>
    )
  }
  return null
}
