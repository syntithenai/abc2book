import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { isAndroidApp } from './platformUtils';
import { saveBlobToDevice, shareBlobForPrint } from './nativeFileSave';

export const PRINT_PAGE_WIDTH_PX = 794;
export const PRINT_PAGE_HEIGHT_PX = 1123;
export const PRINT_PAGE_PADDING_PX = 40;
export const PRINT_INNER_WIDTH_PX = PRINT_PAGE_WIDTH_PX - (PRINT_PAGE_PADDING_PX * 2);
export const PRINT_NOTATION_COL_WIDTH_PX = Math.floor(PRINT_INNER_WIDTH_PX * 0.58);
export const PRINT_CHORDS_COL_WIDTH_PX = PRINT_INNER_WIDTH_PX - PRINT_NOTATION_COL_WIDTH_PX;
export const PRINT_CHORDS_FLOAT_WIDTH_PX = Math.floor(PRINT_INNER_WIDTH_PX * 0.3);
/** Capture / SVG raster scale (~300dpi relative to 96dpi CSS page width). */
export const PRINT_PDF_CAPTURE_SCALE = 3;

function getOffsetTopWithin(child, ancestor) {
  if (!child || !ancestor) return 0;
  const childRect = child.getBoundingClientRect();
  const ancestorRect = ancestor.getBoundingClientRect();
  return childRect.top - ancestorRect.top + ancestor.scrollTop;
}

/**
 * True when background info follows other print content and would cross a page boundary.
 */
export function shouldSplitPrintBackgroundInfo(pageEl, bgEl, pageHeightPx) {
  if (!pageEl || !bgEl || !(pageHeightPx > 0)) return false;
  const bgTop = getOffsetTopWithin(bgEl, pageEl);
  const bgHeight = bgEl.offsetHeight;
  if (!(bgHeight > 0) || !(bgTop > 0)) return false;
  const positionOnPage = bgTop % pageHeightPx;
  const remaining = pageHeightPx - positionOnPage;
  if (bgHeight > remaining) return true;
  if (bgTop >= pageHeightPx) return true;
  return false;
}

export function getPrintNotationColumnWidth(withBlockChords) {
  return withBlockChords ? PRINT_NOTATION_COL_WIDTH_PX : PRINT_INNER_WIDTH_PX;
}

export function getPrintNotationPaper(options) {
  const withBlockChords = !!(options && options.withBlockChords);
  return {
    availW: getPrintNotationColumnWidth(withBlockChords),
    availH: 820,
  };
}

function applyPrintCloneStyles(clonedDoc) {
  if (!clonedDoc || !clonedDoc.head) return;
  const style = clonedDoc.createElement('style');
  style.textContent = [
    '#print-pdf-render-host,.print-pdf-render-host{opacity:1!important;visibility:visible!important;position:relative!important;left:0!important;top:0!important;width:' + PRINT_PAGE_WIDTH_PX + 'px!important;min-width:' + PRINT_PAGE_WIDTH_PX + 'px!important;background:#fff!important;}',
    '.print-pdf-tune-page{width:' + PRINT_PAGE_WIDTH_PX + 'px!important;min-width:' + PRINT_PAGE_WIDTH_PX + 'px!important;box-sizing:border-box!important;padding:' + PRINT_PAGE_PADDING_PX + 'px!important;}',
    '.print-pdf-tune-inner,.tune-background-info-view,.markdown-content,.full-lyrics-panel{width:' + PRINT_INNER_WIDTH_PX + 'px!important;min-width:' + PRINT_INNER_WIDTH_PX + 'px!important;max-width:none!important;}',
    '.music-view-split--with-chords .music-view-main .print-pdf-lyrics-full-width,.music-view-split--with-chords .music-view-main .music-view-lyrics,.music-view-split--with-chords .music-view-main .timed-lyrics-chords-view,.music-view-split--with-chords .music-view-main .full-lyrics-panel{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;}',
    '.music-view-split--with-chords .music-view-main{overflow:hidden!important;}',
    '.print-pdf-view-split,.music-view-split{display:flex!important;flex-direction:row!important;align-items:flex-start!important;width:' + PRINT_INNER_WIDTH_PX + 'px!important;min-width:' + PRINT_INNER_WIDTH_PX + 'px!important;max-width:none!important;}',
    '.music-view-split--with-chords .music-view-main{flex:0 0 ' + PRINT_NOTATION_COL_WIDTH_PX + 'px!important;width:' + PRINT_NOTATION_COL_WIDTH_PX + 'px!important;min-width:' + PRINT_NOTATION_COL_WIDTH_PX + 'px!important;max-width:' + PRINT_NOTATION_COL_WIDTH_PX + 'px!important;padding:0 0.5em 0 0!important;}',
    '.music-view-split:not(.music-view-split--with-chords) .music-view-main{width:' + PRINT_INNER_WIDTH_PX + 'px!important;min-width:' + PRINT_INNER_WIDTH_PX + 'px!important;max-width:none!important;flex:1 1 auto!important;}',
    '.music-chords-block-col{flex:0 0 ' + PRINT_CHORDS_COL_WIDTH_PX + 'px!important;width:' + PRINT_CHORDS_COL_WIDTH_PX + 'px!important;min-width:' + PRINT_CHORDS_COL_WIDTH_PX + 'px!important;max-width:none!important;}',
    '.print-pdf-chords-lyrics-flow{display:flex!important;flex-direction:row!important;align-items:flex-start!important;gap:1em!important;width:100%!important;}',
    '.print-pdf-chords-lyrics-flow .print-pdf-lyrics-flow--beside-chords{flex:1 1 70%!important;min-width:0!important;order:1!important;margin:0!important;padding:0!important;}',
    '.print-pdf-chords-lyrics-flow .music-chords-block-col.print-pdf-chords-side{flex:0 0 30%!important;order:2!important;float:none!important;width:30%!important;min-width:0!important;max-width:none!important;margin:0!important;padding:0.25em 0.35em!important;box-sizing:border-box!important;}',
    '.print-pdf-chords-lyrics-flow .chord-blocks-only{padding:0!important;margin:0!important;width:100%!important;}',
    '.print-pdf-chords-lyrics-flow .chord-chart{width:100%!important;}',
    '.print-pdf-chords-lyrics-flow .chord-chart-line{display:block!important;width:100%!important;font-size:12px!important;line-height:1.3!important;padding:0.2em 0.32em!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;box-sizing:border-box!important;}',
    '.print-pdf-chords-lyrics-flow .print-pdf-structure-chords,.print-pdf-chords-lyrics-flow .structure-chord-block,.print-pdf-chords-lyrics-flow .chord-block-lines{width:100%!important;margin:0!important;padding:0!important;}',
    '.print-pdf-chords-lyrics-flow .chord-block-line{display:block!important;width:100%!important;font-size:12px!important;line-height:1.3!important;padding:0.2em 0.32em!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;box-sizing:border-box!important;}',
    '.print-pdf-chords-lyrics-flow .print-pdf-lyrics-beside-chords,.print-pdf-chords-lyrics-flow .print-pdf-lyrics-beside-chords .print-pdf-lyrics-full-width,.print-pdf-chords-lyrics-flow .print-pdf-lyrics-beside-chords .music-view-lyrics{width:100%!important;max-width:none!important;}',
    '.music-notation-section,.print-pdf-notation-col,.print-pdf-notation-paper,.print-pdf-notation-render,.music-view-notation{width:100%!important;max-width:none!important;}',
    '.print-pdf-notation-render svg,.print-pdf-notation-render img{width:100%!important;max-width:100%!important;height:auto!important;display:block!important;}',
    '.print-pdf-lyrics-columns--2{column-count:2!important;column-gap:1.25em!important;width:100%!important;}',
    '.print-pdf-lyrics-columns--3{column-count:3!important;column-gap:1.25em!important;width:100%!important;}',
    '.music-view-lyrics,.timed-lyrics-chords-view,.chord-chart,.chord-chart-line,.structure-chord-block,.chord-block-line,.print-pdf-structure-chords{width:100%!important;max-width:none!important;}',
  ].join('');
  clonedDoc.head.appendChild(style);

  clonedDoc.querySelectorAll('.print-pdf-tune-inner').forEach(function(el) {
    el.style.width = PRINT_INNER_WIDTH_PX + 'px';
    el.style.minWidth = PRINT_INNER_WIDTH_PX + 'px';
  });
  clonedDoc.querySelectorAll('.print-pdf-view-split, .music-view-split, .print-pdf-chords-lyrics-flow').forEach(function(el) {
    el.style.width = PRINT_INNER_WIDTH_PX + 'px';
    el.style.minWidth = PRINT_INNER_WIDTH_PX + 'px';
    if (el.classList.contains('print-pdf-chords-lyrics-flow')) {
      el.style.display = 'flex';
      el.style.flexDirection = 'row';
      el.style.alignItems = 'flex-start';
    } else {
      el.style.display = 'flex';
      el.style.flexDirection = 'row';
    }
  });
}

function assertPrintLayoutReady(container) {
  const page = container && container.querySelector('.print-pdf-tune-page');
  const inner = page && page.querySelector('.print-pdf-tune-inner');
  if (!inner || inner.offsetWidth < PRINT_INNER_WIDTH_PX - 8) {
    throw new Error('Print layout did not reach full page width.');
  }
}

function nextFrame() {
  return new Promise(function(resolve) {
    requestAnimationFrame(function() {
      requestAnimationFrame(resolve);
    });
  });
}

export async function waitForPrintRender(container) {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await nextFrame();
    if (container) {
      const pages = container.querySelectorAll('.print-pdf-tune-page');
      const page = pages[0];
      const inner = page && page.querySelector('.print-pdf-tune-inner');
      const split = page && page.querySelector('.print-pdf-view-split');
      const innerWide = inner && inner.offsetWidth >= PRINT_INNER_WIDTH_PX - 4;
      const splitWide = !split || split.offsetWidth >= PRINT_INNER_WIDTH_PX - 4;
      const svg = page && page.querySelector('.print-pdf-notation-render svg');
      const notationReady = !page || !page.querySelector('.print-pdf-notation-render') || !!svg;
      const layoutPending = container.querySelector('[data-print-layout-ready="false"]');
      const pagesReady = pages.length > 0 && Array.from(pages).every(function(pageEl) {
        return pageEl.offsetHeight >= PRINT_PAGE_HEIGHT_PX - 4;
      });
      if (innerWide && splitWide && notationReady && !layoutPending && pagesReady) {
        break;
      }
    }
    await new Promise(function(resolve) {
      setTimeout(resolve, 50);
    });
  }
  await new Promise(function(resolve) {
    setTimeout(resolve, 200);
  });
  if (container) {
    void container.offsetHeight;
  }
  assertPrintLayoutReady(container);
}

export function getPrintSvgRasterSize(cssWidth, cssHeight, scale) {
  const rasterScale = scale > 0 ? scale : PRINT_PDF_CAPTURE_SCALE;
  const width = Math.max(1, cssWidth || 800);
  const height = Math.max(1, cssHeight || 600);
  return {
    cssWidth: width,
    cssHeight: height,
    canvasWidth: Math.max(1, Math.ceil(width * rasterScale)),
    canvasHeight: Math.max(1, Math.ceil(height * rasterScale)),
  };
}

function svgElementToDataUrl(svg, scale) {
  return new Promise(function(resolve, reject) {
    const serializer = new XMLSerializer();
    let svgClone = svg.cloneNode(true);
    if (!svgClone.getAttribute('xmlns')) {
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function() {
      const cssWidth = parseFloat(svg.getAttribute('width')) || svg.clientWidth || img.width || 800;
      const cssHeight = parseFloat(svg.getAttribute('height')) || svg.clientHeight || img.height || 600;
      const size = getPrintSvgRasterSize(cssWidth, cssHeight, scale);
      const canvas = document.createElement('canvas');
      canvas.width = size.canvasWidth;
      canvas.height = size.canvasHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      URL.revokeObjectURL(url);
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        cssWidth: size.cssWidth,
        cssHeight: size.cssHeight,
      });
    };
    img.onerror = function(err) {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function replaceSvgsWithImages(root, scale) {
  const rasterScale = scale > 0 ? scale : PRINT_PDF_CAPTURE_SCALE;
  const svgs = Array.from(root.querySelectorAll('svg'));
  const replacements = [];
  for (let i = 0; i < svgs.length; i += 1) {
    const svg = svgs[i];
    try {
      const raster = await svgElementToDataUrl(svg, rasterScale);
      const img = document.createElement('img');
      img.src = raster.dataUrl;
      img.alt = '';
      img.style.width = '100%';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      // Keep layout CSS size while intrinsic PNG is high-DPI for html2canvas.
      img.width = Math.round(raster.cssWidth);
      img.height = Math.round(raster.cssHeight);
      const parent = svg.parentNode;
      if (parent) {
        parent.replaceChild(img, svg);
        replacements.push({ parent: parent, svg: svg, img: img });
      }
    } catch (e) {
      console.log('print svg conversion', e);
    }
  }
  return function restoreSvgs() {
    replacements.forEach(function(entry) {
      if (entry.img.parentNode === entry.parent) {
        entry.parent.replaceChild(entry.svg, entry.img);
      }
    });
  };
}

export function downloadBlob(filename, blob) {
  saveBlobToDevice(blob, filename).catch(function(err) {
    console.warn('downloadBlob failed', err);
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = filename;
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1000);
  });
}

/**
 * Open a PDF blob and trigger the browser print dialog.
 * Uses a hidden iframe on document.body so printing survives route changes.
 */
export function openPdfForPrint(blob, filename) {
  if (!blob) {
    throw new Error('No PDF to print.');
  }
  if (isAndroidApp()) {
    shareBlobForPrint(blob, filename).catch(function(err) {
      console.warn('native print share failed', err);
      if (filename) downloadBlob(filename, blob);
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Print preview');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  iframe.src = url;
  let cleanedUp = false;

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    URL.revokeObjectURL(url);
  }

  function fallbackDownload() {
    cleanup();
    if (filename) {
      downloadBlob(filename, blob);
    }
  }

  iframe.onload = function() {
    setTimeout(function() {
      try {
        const win = iframe.contentWindow;
        if (win) {
          win.focus();
          win.print();
          setTimeout(cleanup, 120000);
          return;
        }
      } catch (e) {
        console.log('print iframe', e);
      }
      try {
        const opened = window.open(url, '_blank');
        if (opened) {
          opened.addEventListener('load', function() {
            opened.focus();
            opened.print();
          });
          setTimeout(cleanup, 120000);
          return;
        }
      } catch (e2) {
        console.log('print window.open', e2);
      }
      fallbackDownload();
    }, 300);
  };

  document.body.appendChild(iframe);
}

/**
 * Render each .print-pdf-tune-page in container to a multi-page A4 PDF.
 * options.onProgress({ current, total, percent, message })
 */
export async function generateTunesPdf(container, filename, options) {
  const opts = options || {}
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function() {}
  if (!container) {
    throw new Error('Nothing to print.');
  }
  await waitForPrintRender(container);
  assertPrintLayoutReady(container);
  const restoreHostVisibility = revealPrintHostForCapture(container);
  const restoreSvgs = await replaceSvgsWithImages(container, PRINT_PDF_CAPTURE_SCALE);
  const originalHostTransform = container.style.transform;
  const originalHostTransition = container.style.transition;
  container.style.transition = 'none';
  try {
    const pages = container.querySelectorAll('.print-pdf-tune-page');
    if (!pages || pages.length === 0) {
      throw new Error('No tunes to print.');
    }
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
      compress: true,
    });
    pdf.autoPrint({ variant: 'non-conform' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    let pdfPageIndex = 0;
    const pageCount = pages.length
    for (let i = 0; i < pages.length; i += 1) {
      onProgress({
        current: i + 1,
        total: pageCount,
        percent: pageCount > 0 ? Math.round(((i + 1) / pageCount) * 100) : 0,
        message: 'Preparing tune ' + (i + 1) + ' of ' + pageCount,
      })
      const pageEl = pages[i];
      const pageTop = pageEl.offsetTop;
      container.style.transform = 'translateY(-' + pageTop + 'px)';
      await nextFrame();
      const pageHeight = pageEl.offsetHeight || PRINT_PAGE_HEIGHT_PX;
      if (pageHeight > PRINT_PAGE_HEIGHT_PX + 2) {
        console.warn('Print page exceeds layout height; slicing across PDF pages.', pageHeight);
      }
      const canvas = await html2canvas(pageEl, {
        scale: PRINT_PDF_CAPTURE_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: PRINT_PAGE_WIDTH_PX,
        windowHeight: pageHeight,
        width: PRINT_PAGE_WIDTH_PX,
        height: pageHeight,
        scrollX: 0,
        scrollY: 0,
        onclone: function(clonedDoc) {
          applyPrintCloneStyles(clonedDoc);
        },
      });
      if (canvas.width < PRINT_PAGE_WIDTH_PX * (PRINT_PDF_CAPTURE_SCALE * 0.95)) {
        throw new Error('Print capture did not reach full page width.');
      }
      const pagesAdded = addCanvasPagesToPdf(
        pdf,
        canvas,
        pdfWidth,
        pdfHeight,
        pdfPageIndex > 0
      );
      pdfPageIndex += pagesAdded;
    }

    const blob = pdf.output('blob');
    if (filename && !isAndroidApp()) {
      downloadBlob(filename, blob);
    }
    openPdfForPrint(blob, filename);
    return blob;
  } finally {
    container.style.transform = originalHostTransform;
    container.style.transition = originalHostTransition;
    restoreHostVisibility();
    restoreSvgs();
  }
}

function addCanvasPagesToPdf(pdf, canvas, pdfWidth, pdfHeight, addPageBeforeFirst) {
  const scale = pdfWidth / canvas.width;
  const totalPdfHeight = canvas.height * scale;
  // PNG keeps thin stave lines crisp; JPEG adds grain under zoom.
  if (totalPdfHeight <= pdfHeight + 1) {
    if (addPageBeforeFirst) {
      pdf.addPage();
    }
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, totalPdfHeight);
    return 1;
  }

  const sliceHeightPx = Math.max(1, Math.floor(pdfHeight / scale));
  let sourceY = 0;
  let pagesAdded = 0;
  while (sourceY < canvas.height) {
    if (addPageBeforeFirst || pagesAdded > 0) {
      pdf.addPage();
    }
    pagesAdded += 1;
    const remainingPx = canvas.height - sourceY;
    const chunkHeightPx = Math.min(sliceHeightPx, remainingPx);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = chunkHeightPx;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        chunkHeightPx,
        0,
        0,
        canvas.width,
        chunkHeightPx
      );
    }
    pdf.addImage(
      sliceCanvas.toDataURL('image/png'),
      'PNG',
      0,
      0,
      pdfWidth,
      chunkHeightPx * scale
    );
    sourceY += chunkHeightPx;
  }
  return pagesAdded;
}

function revealPrintHostForCapture(host) {
  if (!host) return function() {};
  const prev = {
    opacity: host.style.opacity,
    visibility: host.style.visibility,
    zIndex: host.style.zIndex,
    pointerEvents: host.style.pointerEvents,
  };
  host.style.opacity = '1';
  host.style.visibility = 'visible';
  host.style.zIndex = '200000';
  host.style.pointerEvents = 'none';
  return function restorePrintHostVisibility() {
    host.style.opacity = prev.opacity;
    host.style.visibility = prev.visibility;
    host.style.zIndex = prev.zIndex;
    host.style.pointerEvents = prev.pointerEvents;
  };
}
