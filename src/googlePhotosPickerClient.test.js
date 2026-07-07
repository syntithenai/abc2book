import {
  GOOGLE_PHOTOS_PICKER_SCOPE,
  buildGooglePhotosPickerUrl,
  tokenResponseIncludesPhotosScope,
} from './googlePhotosPickerClient';

describe('googlePhotosPickerClient', function() {
  it('exports the Google Photos picker scope', function() {
    expect(GOOGLE_PHOTOS_PICKER_SCOPE).toBe('https://www.googleapis.com/auth/photospicker.mediaitems.readonly');
  });

  it('appends autoclose to picker URIs', function() {
    expect(buildGooglePhotosPickerUrl('https://photos.google.com/picker/example'))
      .toBe('https://photos.google.com/picker/example/autoclose');
  });

  it('detects the photos scope on token responses', function() {
    expect(tokenResponseIncludesPhotosScope({ scope: 'email openid photospicker.mediaitems.readonly' })).toBe(true);
    expect(tokenResponseIncludesPhotosScope({ scope: 'email drive.file' })).toBe(false);
  });
});
