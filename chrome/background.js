/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

/*
 * Basic settings for modern browsers
 *
 * Programming Note: Just tweak these constants for each browser.
 * It should work fine across Edge, Chrome and Firefox without any
 * further modifications.
 */
const BROWSER = 'chrome';
const DMZ_SECTION = 'custom18';
const CONTINUOUS_SECTION = 'custom19';
const SERVER_NAME = 'com.clear_code.thinbridge';
const ALARM_MINUTES = 0.5;
/*
 * When `{cancel: 1}` is used to block loading, Edge shows a warning page which
 * indicates that loading is canceled by an add-on. To avoid it, move back to
 * the previous page instead of blocking.
 */
const CANCEL_REQUEST = {redirectUrl:`data:text/html,${escape('<script type="application/javascript">history.back()</script>')}`};
/*
 *  Although even if we return `CANCEL_REQUEST` from `onBeforeRequest()` on a
 *  sub-frame, `history.back()` will be performed against it's parent main
 *  frame when there is no page to back in the sub-frame. As a result main
 *  frame moves back to the previous page unexpectedly.
 *  To avoid it, just move to blank page instead.
 */
const CANCEL_REQUEST_FOR_SUBFRAME = {redirectUrl:'about:blank'};
const REDIRECT_INTERVAL_LIMIT = 1000;

/*
 * ThinBridge's matching function (See BHORedirector/URLRedirectCore.h)
 *
 *  1. `?` represents a single character.
 *  2. `*` represents an arbitrary substring.
 *
 * >>> wildcmp("http?://*.example.com/*", "https://www.example.com/")
 * true
 */
function wildcmp(wild, string) {
  let i = 0;
  let j = 0;
  let mp, cp;

  while ((j < string.length) && (wild[i] != '*')) {
    if ((wild[i] != string[j]) && (wild[i] != '?')) {
      return 0;
    }
    i += 1;
    j += 1;
  }
  while (j < string.length) {
    if (wild[i] == '*') {
      i += 1;

      if (i == wild.length) {
        return 1;
      }
      mp = i;
      cp = j + 1
    } else if ((wild[i] == string[j]) || (wild[i] == '?')) {
      i += 1;
      j += 1;
    } else {
      i = mp;
      j = cp;
      cp += 1;
    }
  }
  while (wild[i] == '*' && i < wild.length) {
    i += 1;
  }
  return i >= wild.length;
};

/*
 * Observe WebRequests with config fetched from ThinBridge.
 *
 * A typical configuration looks like this:
 *
 * {
 *   CloseEmptyTab:1, OnlyMainFrame:1, IgnoreQueryString:1, DefaultBrowser:"IE",
 *   Sections: [
 *     {Name:"ie", Path:"", Patterns:["*://example.com/*"], Excludes:[]},
 *     ...
 *   ]
 * }
 */
const ThinBridgeTalkClient = {
  newTabIds: new Set(),
  knownTabIds: new Set(),
  resumed: false,

  init() {
    this.cached = null;
    this.ensureLoadedAndConfigured();
    this.recentRequests = {};
    console.log('Running as Thinbridge Talk client');
  },

  async ensureLoadedAndConfigured() {
    return Promise.all([
      !this.cached && this.configure(),
      this.load(),
    ]);
  },

  async configure() {
    const query = new String('C ' + BROWSER);

    const resp = await chrome.runtime.sendNativeMessage(SERVER_NAME, query);
    if (chrome.runtime.lastError) {
      console.log('Cannot fetch config', JSON.stringify(chrome.runtime.lastError));
      return;
    }
    const isStartup = (this.cached == null);
    this.cached = resp.config;
    this.cached.NamedSections = Object.fromEntries(resp.config.Sections.map(section => [section.Name, section]));
    console.log('Fetch config', JSON.stringify(this.cached));

    if (isStartup && !this.resumed) {
      this.handleStartup(this.cached);
    }
  },

  save() {
    chrome.storage.session.set({
      newTabIds: [...this.newTabIds],
      knownTabIds: [...this.knownTabIds],
    });
  },

  async load() {
    if (this.$promisedLoaded)
      return this.$promisedLoaded;

    console.log(`Redirector: loading previous state`);
    return this.$promisedLoaded = new Promise(async (resolve, _reject) => {
      try {
        const { newTabIds, knownTabIds } = await chrome.storage.session.get({ newTabIds: null, knownTabIds: null });
        console.log(`ThinBridgeTalkClient: loaded newTabIds, knownTabIds => `, JSON.stringify(newTabIds), JSON.stringify(knownTabIds));
        this.resumed = !!(newTabIds || knownTabIds);
        if (newTabIds) {
          for (const tabId of newTabIds) {
            this.newTabIds.add(tabId);
          }
        }
        if (knownTabIds) {
          for (const tabId of knownTabIds) {
            this.knownTabIds.add(tabId);
          }
        }
      }
      catch(error) {
        console.log('ThinBridgeTalkClient: failed to load previous state: ', error.name, error.message);
      }
      resolve();
    });
  },

  /*
   * Request redirection to Native Messaging Hosts.
   *
   * * chrome.tabs.get() is to confirm that the URL is originated from
   *   an actual tab (= not an internal prefetch request).
   *
   * * Request Example: "Q edge https://example.com/".
   */
  redirect(url, tabId, closeTab) {
    chrome.tabs.get(tabId).then(async tab => {
      if (chrome.runtime.lastError) {
        console.log(`* Ignore prefetch request`);
        return;
      }
      if (!tab) {
        console.log(`* URL is not coming from an actual tab`);
        return;
      }

      const query = new String('Q ' + BROWSER + ' ' + url);
      await chrome.runtime.sendNativeMessage(SERVER_NAME, query);

      if (!closeTab)
        return;

      let existingTab = tab;
      let counter = 0;
      do {
        if (!existingTab)
          break;
        if (counter > 100) {
          console.log(`couldn't close tab ${tabId} within ${counter} times retry.`);
          break;
        }
        if (counter++ > 0)
          console.log(`tab ${tabId} still exists: trying to close (${counter})`);
        await chrome.tabs.remove(tabId);
      } while (existingTab = await chrome.tabs.get(tabId).catch(_error => null));
    });
  },

  match(section, url, namedSections) {
    for (const name of (section.ExcludeGroups || [])) {
      const foreignSection = namedSections[name.toLowerCase()];
      //console.log(`* Referring exclude group ${name}: ${JSON.stringify(foreignSection && foreignSection.Patterns)}`);
      if (!foreignSection)
        continue;
      for (const pattern of foreignSection.Patterns) {
        if (wildcmp(pattern, url)) {
          console.log(`* Match Exclude ${section.Name} (referring ${name}) [${pattern}]`);
          return false;
        }
      }
    }

    for (const pattern of (section.Excludes || [])) {
      if (wildcmp(pattern, url)) {
        console.log(`* Match Exclude ${section.Name} [${pattern}]`);
        return false;
      }
    }

    for (const pattern of (section.Patterns || [])) {
      if (wildcmp(pattern, url)) {
        console.log(`* Match ${section.Name} [${pattern}]`);
        return true;
      }
    }
    return false;
  },

  getBrowserName(section) {
    const name = section.Name.toLowerCase();

    if (name == DMZ_SECTION)
      return name;

    /* Guess the browser name from the executable path */
    if (name.match(/^custom/i)) {
      if (section.Path.match(RegExp(BROWSER, 'i')))
        return BROWSER;
    }
    return name;
  },

  checkRedirectIntervalLimit(tabId, url) {
    const now = Date.now();
    let skip = false;
    if (!this.recentRequests) {
      // in unit test
      return false;
    }
    for (const key in this.recentRequests) {
      if (Math.abs(now - this.recentRequests[key].time) > REDIRECT_INTERVAL_LIMIT)
        delete this.recentRequests[key];
    }
    const recent = this.recentRequests[tabId];
    if (recent && recent.url === url) {
      skip = true;
    }
    this.recentRequests[tabId] = { tabId: tabId, url: url, time: now }
    return skip;
  },

  handleURLAndBlock(config, tabId, url, isClosableTab) {
    if (!url) {
      console.log(`* Empty URL found`);
      return false;
    }

    if (!/^https?:/.test(url)) {
      console.log(`* Ignore non-HTTP/HTTPS URL ${url}`);
      return false;
    }

    // Just store recent request, don't block here.
    // It should be determined by caller.
    // （onBeforeRequest() should always block loading redirect URL.）
    this.checkRedirectIntervalLimit(tabId, url);

    const urlToMatch = config.IgnoreQueryString ? url.replace(/\?.*/, '') : url;

    console.log(`* Lookup sections for ${urlToMatch}`);

    const closeTabOnRedirect = config.CloseEmptyTab && isClosableTab;

    let loadCount     = 0;
    let redirectCount = 0;
    let isActionMode  = false;
    const matchedSectionNames = [];
    sectionsLoop:
    for (const section of config.Sections) {
      console.log(`handleURLAndBlock: check for section ${section.Name} (${JSON.stringify(section)})`);

      if (section.Action)
        isActionMode = true;

      if (!this.match(section, urlToMatch, config.NamedSections)) {
        console.log(` => unmatched`);
        continue;
      }

      const sectionName = (section.Name || '').toLowerCase();
      matchedSectionNames.push(sectionName);

      console.log(` => matched, action = ${section.Action}`);
      if (section.Action) {
        // a.k.a "full mode" in IE View WE
        switch(section.Action.toLowerCase()) {
          case 'redirect':
            redirectCount++;
            break;

          case 'load':
          default:
            loadCount++;
            break;
        }
        if (sectionName == DMZ_SECTION || sectionName == CONTINUOUS_SECTION)
          break sectionsLoop;
      }
      else {
        // Compatible mode with ManifestV2 version of this add-on
        switch (this.getBrowserName(section)) {
          case DMZ_SECTION:
            console.log(` => action not defined, default action for CUSTOM18: load`);
            loadCount++;
            break sectionsLoop;

          case BROWSER.toLowerCase():
            console.log(` => action not defined, default action for ${BROWSER}: load`);
            loadCount++;
            break;

          default:
            console.log(` => action not defined, default action: redirect`);
            redirectCount++;
            if (sectionName == CONTINUOUS_SECTION)
              break sectionsLoop;
            break;
        }
      }
    }
    console.log(`* Result: [${matchedSectionNames.join(', ')}]`);

    if (isActionMode) {
      // a.k.a "full mode" in IE View WE
      console.log(`* Dispatch as action mode`);
      if (redirectCount > 0 || loadCount == 0) {
        console.log(`* Redirect to another browser`);
        this.redirect(url, tabId, closeTabOnRedirect);
      }
      console.log(`* Continue to load: ${loadCount > 0}`);
      return loadCount == 0;
    }
    else {
      // Compatible mode with ManifestV2 version of this add-on
      console.log(`* Dispatch as compatible mode`);

      if (loadCount > 0) {
        console.log(`* Continue to load`);
        return false;
      }

      if (redirectCount > 0) {
        console.log(`* Redirect to another browser`);
        this.redirect(url, tabId, closeTabOnRedirect);
        return true;
      }

      if (config.DefaultBrowser) {
        console.log(`* Use DefaultBrowser: ${config.DefaultBrowser}`);
        if (String(config.DefaultBrowser).toLowerCase() == BROWSER.toLowerCase()) {
          return false;
        } else {
          this.redirect(url, tabId, closeTabOnRedirect);
          return true;
        }
      } else {
        console.log(`* DefaultBrowser is blank`);
        return false;
      }
    }
  },

  /* Handle startup tabs preceding to onBeforeRequest */
  handleStartup(config) {
    chrome.tabs.query({}).then(tabs => {
      tabs.forEach((tab) => {
        const url = tab.url || tab.pendingUrl;
        console.log(`handleStartup ${url} (tab=${tab.id})`);
        if (!this.handleURLAndBlock(config, tab.id, url, true))
          this.knownTabIds.add(tab.id);
      });
    });
  },

  async onTabCreated(tab) {
    await this.ensureLoadedAndConfigured();
    this.newTabIds.add(tab.id);
    this.save();
  },

  async onTabRemoved(tabId, _removeInfo) {
    await this.ensureLoadedAndConfigured();
    this.newTabIds.delete(tabId);
    this.knownTabIds.delete(tabId);
    this.save();
  },

  async onTabUpdated(tabId, info, tab) {
    await this.ensureLoadedAndConfigured();

    // We should close new (empty) tab, but not for already handled tab by
    // handleStartup or onBeforeReqeust that are possible to be called before
    // onTabCreated. The later condition is the guard for it.
    const isClosableTab = this.newTabIds.has(tabId) && !this.knownTabIds.has(tabId)
    this.knownTabIds.add(tabId);
    this.newTabIds.delete(tabId);

    const config = this.cached;
    const url = tab.pendingUrl || tab.url;

    if (!config) {
      this.save();
      return;
    }

    console.log(`onTabUpdated ${url} (tab=${tabId}, windowId=${tab.windowId}, status=${info.status}/${tab.status})`);

    if (info.status !== 'loading' &&
        info.status !== undefined /* IE Mode tab on Edge will have undefined status */)
      return;

    if (this.checkRedirectIntervalLimit(tabId, url)) {
      console.log(`A request for same URL and same tabId already occurred in ${REDIRECT_INTERVAL_LIMIT} msec. Skip it.`);
      return false;
    }

    // If onBeforeRequest() fails to redirect due to missing config, the next chance to do it is here.
    if (!this.handleURLAndBlock(config, tabId, url, isClosableTab))
      return;

    if (isClosableTab) {
      // The tab is considered to be closed by handleURLAndBlock().
      return;
    }

    /* Call executeScript() to stop the page loading immediately.
     * Then let the tab go back to the previous page.
     */
    chrome.scripting.executeScript({
      target: { tabId },
      func: function goBack() {
        window.stop();
        window.history.back();
      },
    });
  },

  /* Callback for webRequest.onBeforeRequest */
  onBeforeRequest(details) {
    const config = this.cached;
    const isMainFrame = (details.type == 'main_frame');

    console.log(`onBeforeRequest ${details.url} (tab=${details.tabId})`);

    if (!config) {
      console.log('* Config cache is empty. Fetching...');
      this.configure();
      return;
    }

    if (details.tabId < 0) {
      console.log(`* Ignore internal request`);
      return;
    }

    if (config.OnlyMainFrame && !isMainFrame) {
      console.log(`* Ignore subframe request`);
      return;
    }

    const isClosableTab = isMainFrame && (this.newTabIds.has(details.tabId) || !this.knownTabIds.has(details.tabId));

    if (this.handleURLAndBlock(config, details.tabId, details.url, isClosableTab)) {
      if (isMainFrame)
        return CANCEL_REQUEST;
      else
        return CANCEL_REQUEST_FOR_SUBFRAME;
    }

    this.knownTabIds.add(details.tabId);
  },
};

chrome.webRequest.onBeforeRequest.addListener(
  ThinBridgeTalkClient.onBeforeRequest.bind(ThinBridgeTalkClient),
  {
    urls: ['<all_urls>'],
    types: ['main_frame','sub_frame']
  },
  ['blocking']
);

/* Refresh config for every N minute */
console.log('Poll config for every', ALARM_MINUTES , 'minutes');
chrome.alarms.create('poll-config', {'periodInMinutes': ALARM_MINUTES});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll-config') {
    ThinBridgeTalkClient.configure();
  }
});

/* Tab book-keeping for intelligent tab handlings */
chrome.tabs.onCreated.addListener(ThinBridgeTalkClient.onTabCreated.bind(ThinBridgeTalkClient));
chrome.tabs.onUpdated.addListener(ThinBridgeTalkClient.onTabUpdated.bind(ThinBridgeTalkClient));


/*
 * Support ThinBridge's resource cap feature
 */
const ResourceCap = {

  init() {
    console.log('Running Resource Cap client');
  },

  /*
   * On each navigation, we ask the host program to check the
   * current resource usage.
   */
  onNavigationCommitted(details) {
    console.log(`onNavigationCommitted: ${details.url}`);

    /* frameId != 0 indicates iframe requests */
    if (details.frameId) {
      console.log(`* Ignore subframe requests`);
      return;
    }

    chrome.tabs.query({}).then(tabs => {
      const ntabs = this.count(tabs);
      console.log(`* Perform resource check (ntabs=${ntabs})`);
      this.check(details.tabId, ntabs);
    });
  },

  check(tabId, ntabs) {
    const query = new String(`R ${BROWSER} ${ntabs}`);
    chrome.runtime.sendNativeMessage(SERVER_NAME, query).then(resp => {
      // Need this to support ThinBridge v4.0.2.3 (or before)
      if (chrome.runtime.lastError) {
        return;
      }

      if (resp.closeTab) {
        chrome.tabs.remove(tabId).then(() => {
          if (chrome.runtime.lastError) {
            console.log(`* ${chrome.runtime.lastError}`);
            return;
          }
          console.log(`* Close Tab#${tabId}`)
        });
      }
    });
  },

  count(tabs) {
    /* Exclude the internal pages such as "edge://blank" */
    tabs = tabs.filter((tab) => {
      const url = tab.url || tab.pendingUrl;
      return /^https?:/.test(url);
    });
    return tabs.length;
  }
};

chrome.webNavigation.onCommitted.addListener(ResourceCap.onNavigationCommitted.bind(ResourceCap));

ThinBridgeTalkClient.init();
ResourceCap.init();
