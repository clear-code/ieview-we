/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import Options from '/extlib/Options.js';
import '/extlib/l10n.js';

import {
  configs,
} from '/common/common.js';

/*const options = */new Options(configs);

/*
 * Control "BrowserSelector" section in the option page.
 */
const BrowserSelector = {

  async init() {
    configs.$addObserver(this.update);
    await configs.$loaded;
    this.update();
    this.detectFirefox();
  },

  update(_key) {
    const fieldset = document.querySelector('#BS');
    if (configs.talkEnabled) {
      fieldset.removeAttribute('disabled');
    } else {
      fieldset.setAttribute('disabled', 'true');
    }
  },

  detectFirefox() {
    if (!browser || !browser.runtime || !browser.runtime.getBrowserInfo)
      return;

    browser.runtime.getBrowserInfo().then((info) => {
      if (info.name === 'Firefox') {
        const fieldset = document.querySelector('#BS');
        fieldset.classList.add('firefox');
      }
    });
  },
}

document.addEventListener('DOMContentLoaded', function() {
  BrowserSelector.init();
});
