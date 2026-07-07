import { useEffect, useRef } from 'react';
import useQRCode from '../useQRCode';
import {
  getInlineText,
  getMarkdownBlockTitleText,
  groupMarkdownBlocksIntoLayoutSections,
  isSectionStartBlock,
} from '../printBackgroundInfoLayout';

function renderInline(nodes, keyPrefix) {
  return (nodes || []).map(function(node, index) {
    const key = keyPrefix + '-' + index;
    if (!node) return null;
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
  (lines || []).forEach(function(inlineNodes, lineIndex) {
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

function PrintRecordingLinkRow(props) {
  const qrRef = useRef(null);
  const QRCode = useQRCode();

  useEffect(function() {
    if (!props.href || !QRCode || !qrRef.current) return;
    while (qrRef.current.firstChild) {
      qrRef.current.removeChild(qrRef.current.firstChild);
    }
    new QRCode(qrRef.current, {
      text: props.href,
      width: 72,
      height: 72,
      colorDark: '#000000',
      colorLight: '#ffffff',
      useSVG: true,
      correctLevel: QRCode.CorrectLevel.M,
    });
  }, [props.href, QRCode]);

  return (
    <div className="print-pdf-recording-link-row avoidbreak">
      <div className="print-pdf-recording-link-qr">
        <div className="print-pdf-recording-link-qr-box" ref={qrRef} aria-hidden="true" />
      </div>
      <div className="print-pdf-recording-link-text">
        <div className="print-pdf-recording-link-title">{props.label}</div>
        <div className="print-pdf-recording-link-url">{props.href}</div>
      </div>
    </div>
  );
}

function renderBlock(block, key) {
  if (!block) return null;
  if (block.type === 'printRecordingLink') {
    return (
      <PrintRecordingLinkRow
        key={key}
        href={block.href}
        label={block.label || block.href}
      />
    );
  }
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
}

export function renderPrintBackgroundMeasureBlock(block, keyPrefix) {
  if (!block) return null;
  if (block.type === 'printRecordingLink') {
    return (
      <div className="print-pdf-recording-link-row avoidbreak" key={keyPrefix}>
        <div className="print-pdf-recording-link-qr">
          <div className="print-pdf-recording-link-qr-box" style={{ width: '72px', height: '72px' }} />
        </div>
        <div className="print-pdf-recording-link-text">
          <div className="print-pdf-recording-link-title">{block.label || block.href}</div>
          <div className="print-pdf-recording-link-url">{block.href}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="print-pdf-bg-block-measure" key={keyPrefix}>
      {renderBlock(block, keyPrefix + '-block')}
    </div>
  );
}

export default function PrintBackgroundMarkdown(props) {
  const blocks = Array.isArray(props.blocks) ? props.blocks : [];
  const className = props.className || '';
  const sections = groupMarkdownBlocksIntoLayoutSections(blocks);

  return (
    <div className={'markdown-content print-pdf-background-markdown' + (className ? ' ' + className : '')}>
      {sections.map(function(section, sectionIndex) {
        const sectionBlocks = [];
        for (let i = section.start; i <= section.end; i += 1) {
          sectionBlocks.push(blocks[i]);
        }
        const titleBlock = sectionBlocks.find(isSectionStartBlock);
        const sectionTitle = titleBlock ? getMarkdownBlockTitleText(titleBlock) : '';
        return (
          <div
            className="print-pdf-bg-section avoidbreak"
            key={'bg-section-' + sectionIndex + '-' + sectionTitle}
          >
            {sectionBlocks.map(function(block, blockIndex) {
              return renderBlock(block, 'block-' + section.start + '-' + blockIndex);
            })}
          </div>
        );
      })}
    </div>
  );
}
