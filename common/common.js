/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import Configs from '/extlib/Configs.js';

export function getDefaultBrowser() {
  /* Assume Chrome if UA is not accessible */
  if (!navigator || !navigator.userAgent)
    return 'chrome';

  if (/Edg/.test(navigator.userAgent))
    return 'edge';

  return 'chrome';
}

export const configs = new Configs({
  ieapp            : '',
  ieargs           : '',
  forceielist      : '',
  disableForce     : false,
  closeReloadPage  : true,
  closeReloadPageMaxDelayMsec: 150,
  contextMenu      : true,
  onlyMainFrame    : true,
  ignoreQueryString: false,
  sitesOpenedBySelf: '',
  disableException : false,
  logging          : true,
  logRotationCount : 12,
  logRotationTime  : 24,
  talkEnabled      : false,
  talkServerName   : 'com.clear_code.browserselector_talk',
  talkAlarmMinutes : 1,
  talkBrowserName  : getDefaultBrowser(),
  debug            : false
}, {logging: true});

export function log(aMessage, ...aArgs)
{
  if (!configs || !configs.logging)
    return;

  console.log('ieview-we: ' + aMessage, ...aArgs);
}

export function debug(aMessage, ...aArgs)
{
  if (!configs || !configs.debug)
    return;

  log('[DEBUG] ' + aMessage, ...aArgs);
}
