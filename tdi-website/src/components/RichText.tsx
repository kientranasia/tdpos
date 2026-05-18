type LexicalNode = {
  type?: string
  text?: string
  tag?: string
  format?: string
  children?: LexicalNode[]
  fields?: { url?: string; newTab?: boolean }
}

export function RichText({ content, fallback }: { content?: any; fallback?: React.ReactNode }) {
  const nodes = content?.root?.children
  if (!Array.isArray(nodes) || nodes.length === 0) return <div className="rich-content">{fallback}</div>
  return <div className="rich-content">{nodes.map((node: LexicalNode, index: number) => renderNode(node, index))}</div>
}

function renderChildren(node: LexicalNode) {
  return node.children?.map((child, index) => renderNode(child, index)) || null
}

function renderNode(node: LexicalNode, key: React.Key): React.ReactNode {
  if (node.text) {
    let value: React.ReactNode = node.text
    if (node.format?.includes('bold')) value = <strong>{value}</strong>
    if (node.format?.includes('italic')) value = <em>{value}</em>
    return <span key={key}>{value}</span>
  }

  switch (node.type) {
    case 'heading':
      if (node.tag === 'h3') return <h3 key={key}>{renderChildren(node)}</h3>
      return <h2 key={key}>{renderChildren(node)}</h2>
    case 'paragraph':
      return <p key={key}>{renderChildren(node)}</p>
    case 'list':
      return <ul key={key}>{renderChildren(node)}</ul>
    case 'listitem':
      return <li key={key}>{renderChildren(node)}</li>
    case 'link':
      return <a key={key} href={node.fields?.url || '#'} target={node.fields?.newTab ? '_blank' : undefined}>{renderChildren(node)}</a>
    default:
      return <div key={key}>{renderChildren(node)}</div>
  }
}
