import { parseMarkdownBlocks } from '../markdownUtils';

function renderInline(nodes, keyPrefix) {
  return nodes.map(function(node, index) {
    const key = keyPrefix + '-' + index;
    if (node.type === 'text') {
      return <span key={key}>{node.value}</span>;
    }
    if (node.type === 'strong') {
      return <strong key={key}>{renderInline(node.children, key)}</strong>;
    }
    if (node.type === 'em') {
      return <em key={key}>{renderInline(node.children, key)}</em>;
    }
    if (node.type === 'link') {
      return (
        <a key={key} href={node.href} target="_blank" rel="noreferrer">
          {renderInline(node.children, key)}
        </a>
      );
    }
    return null;
  });
}

function renderParagraphLines(lines, keyPrefix) {
  const rendered = [];
  lines.forEach(function(inlineNodes, lineIndex) {
    if (lineIndex > 0) {
      rendered.push(<br key={keyPrefix + '-br-' + lineIndex} />);
    }
    rendered.push(
      <span key={keyPrefix + '-line-' + lineIndex}>
        {renderInline(inlineNodes, keyPrefix + '-line-' + lineIndex)}
      </span>
    );
  });
  return rendered;
}

export default function MarkdownContent({ text, className }) {
  const source = typeof text === 'string' ? text : '';
  const blocks = parseMarkdownBlocks(source);

  return (
    <div className={'markdown-content' + (className ? ' ' + className : '')}>
      {blocks.map(function(block, index) {
        const key = 'block-' + index;
        if (block.type === 'heading') {
          const Tag = 'h' + Math.min(6, Math.max(1, block.level));
          return <Tag key={key}>{renderInline(block.children, key)}</Tag>;
        }
        if (block.type === 'ul') {
          return (
            <ul key={key}>
              {block.items.map(function(item, itemIndex) {
                return <li key={key + '-' + itemIndex}>{renderInline(item, key + '-' + itemIndex)}</li>;
              })}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={key}>
              {block.items.map(function(item, itemIndex) {
                return <li key={key + '-' + itemIndex}>{renderInline(item, key + '-' + itemIndex)}</li>;
              })}
            </ol>
          );
        }
        return <p key={key}>{renderParagraphLines(block.lines, key)}</p>;
      })}
    </div>
  );
}
