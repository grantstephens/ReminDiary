/**
 * Pure payload shaping for Umami's server-side event API - no fetch, no
 * storage, so it can be unit tested without either. analytics.native.ts and
 * analytics.web.ts each do their own fetch() with this body; the platform
 * split is about how the request gets sent, not what is in it.
 */

export const UMAMI_ENDPOINT = 'https://a7s.hub13.xyz/api/send';
export const UMAMI_WEBSITE_ID = '71b93641-1b05-43a4-a049-ee9e02b1b73a';

export interface UmamiEventPayload {
  type: 'event';
  payload: {
    website: string;
    hostname: string;
    url: string;
  };
}

/**
 * buildUmamiPayload shapes a screen change as a pageview (no `name` field -
 * a named field turns this into a custom event in Umami's dashboard, which
 * is a different kind of tracking than "which screen was open").
 */
export function buildUmamiPayload(screenName: string, hostname: string): UmamiEventPayload {
  return {
    type: 'event',
    payload: {
      website: UMAMI_WEBSITE_ID,
      hostname,
      url: `/${screenName}`,
    },
  };
}
