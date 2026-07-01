import { linkifyBackgroundInfo } from './backgroundInfoUtils';

describe('backgroundInfoUtils', function() {
  test('linkifyBackgroundInfo splits URLs from text', function() {
    const parts = linkifyBackgroundInfo('See https://example.com/page for more.');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ type: 'text', value: 'See ', key: 'text-0' });
    expect(parts[1]).toEqual({
      type: 'link',
      href: 'https://example.com/page',
      key: 'link-1',
    });
    expect(parts[2]).toEqual({ type: 'text', value: ' for more.', key: 'text-2' });
  });
});
