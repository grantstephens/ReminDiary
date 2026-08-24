import { buildUmamiPayload, UMAMI_ENDPOINT, UMAMI_WEBSITE_ID } from './umamiPayload';

test('builds a pageview-shaped event for the given screen and hostname', () => {
  expect(buildUmamiPayload('Write', 'android')).toEqual({
    type: 'event',
    payload: {
      website: UMAMI_WEBSITE_ID,
      hostname: 'android',
      url: '/Write',
    },
  });
});

test('the url is derived from the screen name, not hardcoded', () => {
  expect(buildUmamiPayload('Memories', 'web').payload.url).toBe('/Memories');
  expect(buildUmamiPayload('Settings', 'web').payload.url).toBe('/Settings');
});

test('carries the caller-supplied hostname through unchanged', () => {
  expect(buildUmamiPayload('Write', 'web').payload.hostname).toBe('web');
  expect(buildUmamiPayload('Write', 'android').payload.hostname).toBe('android');
});

test('never carries a name field - this is a pageview, not a named custom event', () => {
  expect(buildUmamiPayload('Write', 'android').payload).not.toHaveProperty('name');
});

test('exports the real Umami collect endpoint', () => {
  expect(UMAMI_ENDPOINT).toBe('https://a7s.hub13.xyz/api/send');
});

test('exports the real Umami website id', () => {
  expect(UMAMI_WEBSITE_ID).toBe('71b93641-1b05-43a4-a049-ee9e02b1b73a');
});
