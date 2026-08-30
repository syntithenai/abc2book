/**
 * Client crop prep helpers.
 */
import { applyCropPrep } from './bookImportCropPrep'

describe('applyCropPrep', function() {
  test('rejects missing blob', async function() {
    await expect(applyCropPrep(null, {})).rejects.toThrow(/required/i)
  })
})
