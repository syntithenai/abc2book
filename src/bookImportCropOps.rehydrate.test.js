/**
 * Unit coverage for PDF crop rehydrate helpers.
 */
jest.mock('./tuneFilePdfRasterize');

import { rehydrateCropBlobFromPdf } from './bookImportCropOps';
import { rasterizePdfPageToPng } from './tuneFilePdfRasterize';

describe('rehydrateCropBlobFromPdf', function() {
  beforeEach(function() {
    rasterizePdfPageToPng.mockReset();
    rasterizePdfPageToPng.mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      width: 200,
      height: 400,
    });
  });

  test('returns null without tune or pdf', async function() {
    expect(await rehydrateCropBlobFromPdf(null, new Blob(['x']))).toBeNull();
    expect(await rehydrateCropBlobFromPdf({ page: 1 }, null)).toBeNull();
    expect(rasterizePdfPageToPng).not.toHaveBeenCalled();
  });

  test('rasterizes page using stored scale when no bbox', async function() {
    const out = await rehydrateCropBlobFromPdf(
      { page: 3, sourcePdfPage: 3, rasterScale: 2.75, bbox: null },
      new Blob(['pdf'], { type: 'application/pdf' })
    );
    expect(rasterizePdfPageToPng).toHaveBeenCalledTimes(1);
    const call = rasterizePdfPageToPng.mock.calls[0];
    expect(call[1]).toBe(3);
    expect(call[2].scale).toBe(2.75);
    expect(out).toBeTruthy();
    expect(out.type).toBe('image/png');
  });
});
