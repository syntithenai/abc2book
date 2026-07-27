import { inferTitleArtistFromQuery } from './mediaSearchQueryUtils';

describe('mediaSearchQueryUtils', function() {
  test('splits artist and title for common song searches', function() {
    expect(inferTitleArtistFromQuery('elvis presley love me')).toEqual({
      query: 'elvis presley love me',
      title: 'love me',
      artist: 'elvis presley',
    });
  });

  test('keeps multi-word folk titles intact', function() {
    expect(inferTitleArtistFromQuery('After The Battle Of Aughrim')).toEqual({
      query: 'After The Battle Of Aughrim',
      title: 'After The Battle Of Aughrim',
      artist: '',
    });
  });

  test('keeps short artist queries intact', function() {
    expect(inferTitleArtistFromQuery('zarochi')).toEqual({
      query: 'zarochi',
      title: 'zarochi',
      artist: '',
    });
  });
});
