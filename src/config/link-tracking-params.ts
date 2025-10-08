/**
 * Common tracking and marketing parameters to remove from URLs
 * These parameters are typically used for analytics and don't affect the actual content
 */
export const TRACKING_PARAMS = [
  // Google Analytics UTM parameters
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',

  // Google Ads
  'gclid',
  'gbraid',
  'wbraid',

  // Microsoft/Bing Ads
  'msclkid',

  // Facebook
  'fbclid',

  // Twitter/X
  'twclid',

  // TikTok
  'ttclid',

  // YouTube
  'si',

  // Adobe Analytics
  's_kwcid',

  // HubSpot
  '_hsenc',
  '_hsmi',
  '__hssc',
  '__hstc',
  '__hsfp',
  'hsCtaTracking',

  // Mailchimp
  'mc_cid',
  'mc_eid',

  // General tracking/referrer parameters
  'ref',
  'referrer',
  'source',
  'track',
  'trk',
  'pk_campaign',
  'pk_kwd',
  'pk_keyword',
  'piwik_campaign',
  'piwik_kwd',
  'piwik_keyword'
];

export default TRACKING_PARAMS;