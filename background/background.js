'use strict';

import {
  configs,
  log,
  debug,
} from '/common/common.js';

let isFirefox  = !!browser.runtime.getBrowserInfo;
let isChromium = !browser.runtime.getBrowserInfo;
const BROWSER = isFirefox ? 'Firefox' :
  /Edg/.test(navigator.userAgent) ? 'Edge' :
    'Chrome';

const CANCEL_RESPONSE = isChromium ?
  { redirectUrl: `data:text/html,${escape('<script type="application/javascript">history.back()</script>')}` } :
  { cancel: true } ;

const VALID_MATCH_PATTERN = (() => {
  const schemeSegment = '(\\*|http|https|file|ftp)';
  const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';
  const pathSegment = '(.*)';
  const regex = new RegExp(
    `^${schemeSegment}://${hostSegment}/${pathSegment}$`
  );
  return regex;
})();

let sitesOpenedBySelfList = [];
let sitesOpenedBySelfRegex = null;
const openingTabs = new Map();


function installMenuItems() {
  browser.contextMenus.create({
    id: 'page',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu_page_label'),
    contexts: installMenuItems.supportsTabContext ? ['page', 'tab'] : ['page']
  });
  browser.contextMenus.create({
    id: 'link',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu_link_label'),
    contexts: ['link']
  });
}
installMenuItems.supportsTabContext = false;


let forceIEListRegex = null;

function installBlocker() {
  if (configs.talkEnabled)
    return;

  const list = configs.forceielist.trim().split(/\s+/).filter((aItem) => !!aItem);
  log('force list: ', list);

  const types = ['main_frame'];
  if (!configs.onlyMainFrame)
    types.push('sub_frame');

  debug('frame types: ', types);
  let urls = list;
  forceIEListRegex = new RegExp(list.map(pattern => {
    if (!VALID_MATCH_PATTERN.exec(pattern)) {
      urls = ['<all_urls>'];
      return `${migratePatternToRegExp(pattern)}`.replace(/^\/(.+)\//, '$1')
    }
    else {
      return `${matchPatternToRegExp(pattern)}`.replace(/^\/(.+)\//, '$1');
    }
  }).join('|'));
  log('forceIEListRegex:', forceIEListRegex);

  if (list.length > 0 &&
      !browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls, types },
      ['blocking']
    );
}
function uninstallBlocker() {
  if (browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
  forceIEListRegex = null;
}
function onBeforeRequest(details) {
  log('onBeforeRequest', details);
  let redirected = true;

  if (details.tabId < 0) {
    log('invalid tabId: ', details.tabId);
    redirected = false;
  }
  else {
    let targetURL = details.url;
    if (configs.ignoreQueryString)
      targetURL = details.url.replace(/\?.*/, '');

    debug('targetURL: ', targetURL);
    if (forceIEListRegex) {
      debug('forceIEListRegex: ', forceIEListRegex);
      const matched = forceIEListRegex.test(targetURL);
      debug('matched to forceIEListRegex?: ', matched);
      if (matched)
        redirected = true;
      else {
        redirected = false;
      }
    }
    else {
      redirected = false;
    }
    if (sitesOpenedBySelfRegex) {
      debug('sitesOpenedBySelfList: ', sitesOpenedBySelfList);
      debug('sitesOpenedBySelfRegex: ', sitesOpenedBySelfRegex);
      debug('test url:', targetURL);
      const matched = sitesOpenedBySelfRegex.test(targetURL);
      debug('matched to sitesOpenedBySelfRegex?: ', matched);
      if (matched)
        redirected = false;
    }
    debug('redirected?: ', redirected);
    if (redirected) {
      launch(details.url);
      log('is opening tab?: ', openingTabs.has(details.tabId));
      if (configs.closeReloadPage &&
          openingTabs.has(details.tabId)) {
        openingTabs.delete(details.tabId);
        browser.tabs.remove(details.tabId);
      }
    }
    else {
      log('url is not redirected: ', details.url);
    }
  }

  if (!redirected)
    return {};

  return CANCEL_RESPONSE;
}

/*
 * Talk Protocol Support
 *
 * This implements the "bridge" mode that delegates the URL handling
 * to Talk-compatible host programs (like BrowserSelector).
 *
 * For more details, visit the project page of BrowserSelector.
 * https://gitlab.com/clear-code/browserselector/
 */
const TalkClient = {

  init() {
    if (this.running)
      return;

    this.isNewTab = {};
    this.callback = this.onBeforeRequest.bind(this);
    this.listen();
    this.running = true;
    log('Running as Talk client');
  },

  listen() {
    browser.webRequest.onBeforeRequest.addListener(
      this.callback,
      {
        urls: ['<all_urls>'],
        types: ['main_frame']
      },
      ['blocking']
    );

    /* Tab book-keeping for intelligent tab handlings */
    browser.tabs.onCreated.addListener(tab => {
      this.isNewTab[tab.id] = 1;
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
      if (changeInfo.status === 'complete') {
        if (changeInfo.url && !/^(about:(blank|newtab|home))$/.test(changeInfo.url)) {
          delete this.isNewTab[tabId];
        }
      }
    });
  },

  async onBeforeRequest(details) {
    const server = configs.talkServerName;
    const query = `Q firefox ${details.url}`;

    debug(`Query "${query}" to ${server}`);
    const response = await browser.runtime.sendNativeMessage(server, query);

    debug('Response was', JSON.stringify(response));
    if (!response)
      return {};  // Continue anyway

    if (response.open) {
      if (response.close_tab && this.isNewTab[details.tabId]) {
        debug('Cloding tab', details.tabId);
        delete this.isNewTab[details.tabId];
        await browser.tabs.remove(details.tabId);
      }
      return CANCEL_RESPONSE;  // Stop the request
    }
    return {};
  }
};

/*
 * Talk Client for Chrome (and Edge).
 *
 * We need a separate implementation for Google Chrome since
 * chrome.webRequest won't allow to communicate with the host
 * program within onBeforeRequest().
 */
const ChromeTalkClient = {

  NAME: 'ChromeTalkClient',

  init() {
    if (this.running)
      return;

    this.cached = null;
    this.isNewTab = {};
    this.configure();
    this.listen();
    this.running = true;
    log('Running as Talk client for', configs.talkBrowserName);
  },

  configure() {
    const server = configs.talkServerName;
    const query = new String(`C ${configs.talkBrowserName}`);

    browser.runtime.sendNativeMessage(server, query).then(response => {
      this.cached = response.config;
      debug('[Talk] configure', JSON.stringify(response.config));
    });
  },

  listen() {
    browser.webRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      {
        urls: ['<all_urls>'],
        types: ['main_frame']
      },
      ['blocking']
    );

    /* Refresh config for every N minute */
    log('[Talk] poll config for every', configs.talkAlarmMinutes, 'minutes');
    browser.alarms.create(this.NAME, {'periodInMinutes': configs.talkAlarmMinutes});

    browser.alarms.onAlarm.addListener(alarm => {
      if (alarm.name != this.NAME)
        return;
      this.configure();
    });

    /* Tab book-keeping for intelligent tab handlings */
    browser.tabs.onCreated.addListener(tab => {
      this.isNewTab[tab.id] = 1;
    });

    browser.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'complete') {
        delete this.isNewTab[tab.id];
      }
    });
  },

  /* Convert BrowserSelector's pattern into RegExp */
  regex(pattern, bs) {
    if (bs.UseRegex)
      return RegExp(pattern);

    // BrowserSelector support a 'simple' pattern that allows to use
    // `*` for any strings, and `?` for any single character.
    const specials = /(\.|\+|\(|\)|\[|\]|\\|\^|\$|\|)/g;
    //                .  +  (  )  [  ]  \  ^  $  |

    pattern = pattern.replace(specials, '\\$1');
    pattern = pattern.replace(/\*/g, '.*');
    pattern = pattern.replace(/\?/g, '.');

    return RegExp(`^${pattern}$`, 'i');
  },

  redirect(bs, details) {
    const server = configs.talkServerName;
    const query = new String(`Q ${configs.talkBrowserName} ${details.url}`);

    if (details.tabId < 0)
      return;

    browser.tabs.get(details.tabId).then(tab => {
      /* This is required for Chrome's "preload" tabs */
      if (browser.runtime.lastError) return;
      if (!tab) return;

      /* Open another browser via Query */
      browser.runtime.sendNativeMessage(server, query);

      /* Close the opening tab automatically (if required) */
      if (bs.CloseEmptyTab && this.isNewTab[details.tabId]) {
        browser.tabs.remove(details.tabId);
      }
    });
    return CANCEL_RESPONSE;
  },

  onBeforeRequest(details) {
    const bs = this.cached;
    const host = details.url.split('/')[2];

    if (!bs) {
      log('[Talk] config cache is empty. Fetching...');
      this.configure();
      return;
    }

    /* URLPatterns */
    for (let i = 0; i < bs.URLPatterns.length; i++) {
      const pattern = bs.URLPatterns[i][0];
      const browser = bs.URLPatterns[i][1].toLowerCase();

      if (this.regex(pattern, bs).test(details.url)) {
        debug('[Talk] Match', JSON.stringify({pattern: pattern, url: details.url, browser: browser}))
        if (browser == configs.talkBrowserName)
          return;
        if (browser == '' && bs.SecondBrowser == configs.talkBrowserName)
          return;
        return this.redirect(bs, details);
      }
    }

    /* HostNamePatterns */
    for (let i = 0; i < bs.HostNamePatterns.length; i++) {
      const pattern = bs.HostNamePatterns[i][0];
      const browser = bs.HostNamePatterns[i][1].toLowerCase();

      if (this.regex(pattern, bs).test(host)) {
        debug('[Talk] Match', JSON.stringify({pattern: pattern, host: host, browser: browser}))
        if (browser == configs.talkBrowserName)
          return;
        if (browser == '' && bs.SecondBrowser == configs.talkBrowserName)
          return;
        return this.redirect(bs, details);
      }
    }

    /* No pattern matched */
    debug('[Talk] No pattern matched', {url: details.url})
    if (bs.DefaultBrowser !== configs.talkBrowserName)
      return this.redirect(bs, details);
  }
};

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
 * Talk Client for ThinBridge (Google Chrome).
 *
 * This class is used when configs.talkServerName is configured
 * to 'com.clear_code.thinbridge'.
 */
const ThinBridgeTalkClient = {

  NAME: 'ThinBridgeTalkClient',

  init() {
    if (this.running)
      return;

    this.cached = null;
    this.isNewTab = {};
    this.configure();
    this.listen();
    this.running = true;
    console.log('Running as Thinbridge Talk client');
  },

  configure() {
    const query = new String('C chrome');

    browser.runtime.sendNativeMessage(configs.talkServerName, query).then(response => {
      if (browser.runtime.lastError) {
        console.log('Cannot fetch config', JSON.stringify(browser.runtime.lastError));
        return;
      }
      const isStartup = (this.cached == null);
      this.cached = response.config || {};
      console.log('Fetch config', JSON.stringify(this.cached));
      if (this.cached.Sections) { // full mode
        const sectionsByName = {};
        for (const section of this.cached.Sections) {
          sectionsByName[(section.Name || '').toLowerCase()] = section;
        }
        for (const section of this.cached.Sections) {
          if (!section.ExcludeGroups)
            continue;
          for (const name of section.ExcludeGroups) {
            const referredSection = sectionsByName[name.toLowerCase()];
            if (!referredSection)
              continue;
            section.URLExcludePatterns = [
              ...(section.URLExcludePatterns || []),
              ...(referredSection.URLPatterns || []),
            ];
          }
        }
        this.cached.Sections = [
          ...(sectionsByName.custom18 ? [sectionsByName.custom18] : []),
          ...this.cached.Sections.filter(section => (section.Name || '').toLowerCase() != 'custom18'),
        ];
        console.log('Populated config', JSON.stringify(this.cached));
      }

      if (isStartup) {
        this.handleStartup(this.cached);
      }
    });
  },

  listen() {
    browser.webRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      {
        urls: ['<all_urls>'],
        types: ['main_frame','sub_frame']
      },
      ['blocking']
    );

    /* Refresh config for every N minute */
    console.log('Poll config for every', configs.talkAlarmMinutes, 'minutes');
    browser.alarms.create(this.NAME, {'periodInMinutes': configs.talkAlarmMinutes});

    browser.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === this.NAME) {
        this.configure();
      }
    });

    /* Tab book-keeping for intelligent tab handlings */
    browser.tabs.onCreated.addListener(tab => {
      this.isNewTab[tab.id] = 1;
    });

    browser.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'complete') {
        delete this.isNewTab[tab.id];
      }
    });
  },

  redirect(url, tabId, closeTab) {
    browser.tabs.get(tabId).then(tab => {
      if (browser.runtime.lastError) {
        console.log(`* Ignore prefetch request`);
        return;
      }
      if (!tab) {
        console.log(`* URL is not coming from an actual tab`);
        return;
      }

      const query = new String(`Q chrome ${url}`);
      browser.runtime.sendNativeMessage(configs.talkServerName, query).then(_response => {
        if (closeTab) {
          browser.tabs.remove(tabId);
        }
      });
    });
  },

  isMatchedURL(tbconfig, url) {
    if (tbconfig.IgnoreQueryString) {
      url = url.replace(/\?.*/, '');
    }
    console.log(`* Check patterns for ${url}`);

    for (let i = 0; i < tbconfig.URLExcludePatterns.length; i++) {
      if (wildcmp(tbconfig.URLExcludePatterns[i][0], url)) {
        console.log(`* Match Exclude [${tbconfig.URLExcludePatterns[i][0]}]`)
        return false;
      }
    }

    for (let i = 0; i < tbconfig.URLPatterns.length; i++) {
      if (wildcmp(tbconfig.URLPatterns[i][0], url)) {
        console.log(`* Match [${tbconfig.URLPatterns[i][0]}]`)
        return true;
      }
    }
    console.log(`* No pattern matched`);
    return false;
  },

  isMatchedURLLegacy(tbconfig, url) {
    if (tbconfig.IgnoreQueryString) {
      url = url.replace(/\?.*/, '');
    }
    console.log(`* Check patterns for ${url}`);

    for (let i = 0; i < tbconfig.URLExcludePatterns.length; i++) {
      if (wildcmp(tbconfig.URLExcludePatterns[i][0], url)) {
        console.log(`* Match Exclude [${tbconfig.URLExcludePatterns[i][0]}]`)
        return true;
      }
    }

    for (let i = 0; i < tbconfig.URLPatterns.length; i++) {
      if (wildcmp(tbconfig.URLPatterns[i][0], url)) {
        console.log(`* Match [${tbconfig.URLPatterns[i][0]}]`)
        return false;
      }
    }
    console.log(`* No pattern matched`);
    return true;
  },

  handleURLAndBlock({ tbconfig, tabId, url, isClosableTab }) {
    if (!url) {
      console.log(`* Empty URL found`);
      return false;
    }

    if (!/^https?:/.test(url)) {
      console.log(`* Ignore non-HTTP/HTTPS URL (${url})`);
      return false;
    }

    if (tbconfig.Sections) {
      // full mode
      let loadCount     = 0;
      let redirectCount = 0;
      let closeTabCount = 0;
      const matchedSectionNames = [];
      sectionsLoop:
      for (const section of tbconfig.Sections) {
        const config = {
          IgnoreQueryString: tbconfig.IgnoreQueryString,
          CloseEmptyTab:     tbconfig.CloseEmptyTab,
          ...section,
        };
        console.log(`handleURLAndBlock: check for section ${section.Name} (${JSON.stringify(config)})`);
        if (!this.isMatchedURL(config, url)) {
          console.log(` => unmached`);
          continue;
        }

        const sectionName = (config.Name || '').toLowerCase();
        matchedSectionNames.push(sectionName);

        if (config.CloseEmptyTab && isClosableTab)
          closeTabCount++;

        console.log(` => matched, action = ${config.Action}`);
        if (config.Action) {
          switch(config.Action.toLowerCase()) {
            case 'redirect':
              redirectCount++;
              break;

            case 'load':
            default:
              loadCount++;
              break;
          }
          if (sectionName == 'custom18' || sectionName == 'custom19')
            break sectionsLoop;
        }
        else {
          switch (sectionName) {
            case 'custom18':
              console.log(` => action not defined, default action for CUSTMO18: load`);
              loadCount++;
              break sectionsLoop;

            case BROWSER.toLowerCase():
              console.log(` => action not defined, default action for ${BROWSER}: load`);
              loadCount++;
              break;

            default:
              console.log(` => action not defined, default action: redirect`);
              redirectCount++;
              if (sectionName == 'custom19')
                break sectionsLoop;
              break;
          }
        }
      }

      if (redirectCount == 0) {
        console.log(`* No redirection: fallback to default`);
        if (tbconfig.DefaultBrowser == '' ||
            String(tbconfig.DefaultBrowser).toLowerCase() == BROWSER.toLowerCase()) {
          console.log(`* Continue to load as the default reaction`);
          loadCount++;
        }
        else {
          console.log(`* Redirect to the default browser ${tbconfig.DefaultBrowser}`);
          redirectCount++;
        }
      }

      if (redirectCount > 0 || loadCount == 0) {
        console.log(`* Redirect to another browser`);
        this.redirect(url, tabId, closeTabCount > 0);
      }
      console.log(`* Continue to load: ${loadCount > 0}`);
      return loadCount == 0;
    }
    else {
      // legacy mode
      if (!this.isMatchedURLLegacy(tbconfig, url))
        return false;

      console.log(`* Redirect to another browser`);
      this.redirect(url, tabId, tbconfig.CloseEmptyTab && isClosableTab);
      return true;
    }
  },

  /* Handle startup tabs preceding to onBeforeRequest */
  handleStartup(tbconfig) {
    browser.tabs.query({}).then(tabs => {
      tabs.forEach((tab) => {
        const url = tab.url || tab.pendingUrl;
        console.log(`handleStartup ${url} (tab=${tab.id})`);
        this.handleURLAndBlock({ tbconfig, tabId: tab.id, url, isClosableTab: true });
      });
    });
  },

  /* Callback for webRequest.onBeforeRequest */
  onBeforeRequest(details) {
    const tbconfig = this.cached;
    const isMainFrame = (details.type == 'main_frame');

    console.log(`onBeforeRequest ${details.url} (tab=${details.tabId})`);

    if (!tbconfig) {
      console.log('* Config cache is empty. Fetching...');
      this.configure();
      return;
    }

    if (details.tabId < 0) {
      console.log(`* Ignore internal request`);
      return;
    }

    if (tbconfig.OnlyMainFrame && !isMainFrame) {
      console.log(`* Ignore subframe request`);
      return;
    }

    const isClosableTab = isMainFrame && this.isNewTab[details.tabId];

    if (this.handleURLAndBlock({ tbconfig, tabId: details.tabId, url: details.url, isClosableTab })) {
      return CANCEL_RESPONSE;
    }
  },
};

function runTalkServer() {
  if (configs.talkServerName == 'com.clear_code.thinbridge')
    return ThinBridgeTalkClient.init();

  if (isChromium)
    return ChromeTalkClient.init();

  return TalkClient.init();
}

/*
 * Listen `chrome.storage.onChange` to launch talkServer on
 * delay-loaded GPO settings.
 */
function onTalkEnabled(data, storageName) {
  if (data.talkBrowserName)
    configs.talkBrowserName = data.talkBrowserName.newValue;

  if (data.talkServerName)
    configs.talkServerName = data.talkServerName.newValue;

  if (data.talkEnabled)
    configs.talkEnabled = data.talkEnabled.newValue;

  if (data.talkEnabled && data.talkEnabled.newValue) {
    log('[Talk] talkEnabled is turned on. Launch a client...');
    uninstallBlocker();
    runTalkServer();
  }
  log('browser.storage.onChange: ', storageName, JSON.stringify(data));
}

/*
 * This is a safety lock to ensure ThinBridgeTalkClient is running.
 *
 * We have seen a few stability issues on Chrome where IEView WE
 * fails to get managed policy on startup, so we check the running
 * state a few seconds later.
 */
function checkThinBridgeMode() {
  if (!browser.storage.managed)
    log('[managed] managed storage is null')

  browser.storage.managed.get().then((m) => {
    log(`[managed] config = `, JSON.stringify(m));

    if (!isChromium) {
      log('[managed] browser was not chrome');
      return;
    }
    if (ChromeTalkClient.running) {
      log('[managed] ChromeTalkClient already running');
      return;
    }
    if (ThinBridgeTalkClient.running) {
      log('[managed] ThinBridgeTalkClient already running');
      return;
    }

    if (m.talkEnabled && m.talkServerName == 'com.clear_code.thinbridge') {
      log('[managed] Do dispatch ThinBridgeClient')
      configs.talkEnabled = m.talkEnabled;
      configs.talkServerName = m.talkServerName;
      uninstallBlocker();
      runTalkServer();
    }
  });
}

/*
 * main
 */

/**
 * Transforms a pattern with wildcards (for original IE View) into a
 * regular expression
 * Note that two pass conversion is executed. First, pattern is converted into match patterns,
 * then it is converted into regular expressions finally.
 *
 * @param  {string}  pattern  The pattern to transform.
 * @return {RegExp}           The pattern's equivalent as a RegExp.
 */
function migratePatternToRegExp(invalidPattern) {
  let pattern = invalidPattern;
  if (pattern.charAt(0) === '*' && pattern.charAt(pattern.length - 1) === '*') {
    const extracted = pattern.substring(1, pattern.length - 1);
    log('convert host to regex:', `*://*.${extracted}/*`);
    const hostRegex = matchPatternToRegExp(`*://*.${extracted}/*`);
    log('convert path to regex:', `*://*/${pattern}`);
    const pathRegex = matchPatternToRegExp(`*://*/${pattern}`);
    log('migrated match pattern based regex:', `${hostRegex}|${pathRegex}`);
    return new RegExp(`${hostRegex.replace(/^\/(.+)\//, '$1')}|${pathRegex.replace(/^\/(.+)\//, '$1')}`);
  } else {
    // Just convert * and ?
    pattern = pattern.replace(/\*/g, '.*');
    pattern = pattern.replace(/\?/g, '.?');
    log('migrated regex pattern:', pattern);
    return new RegExp(pattern);
  }
}

/**
 * Transforms a valid match pattern into a regular expression
 * which matches all URLs included by that pattern.
 *
 * See https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns
 *
 * @param  {string}  pattern  The pattern to transform.
 * @return {RegExp}           The pattern's equivalent as a RegExp.
 * @throws {TypeError}        If the pattern is not a valid MatchPattern
 */
function matchPatternToRegExp(pattern) {
  if (pattern === '')
    return (/^(?:http|https|file|ftp|app):\/\//);

  const match = VALID_MATCH_PATTERN.exec(pattern);
  if (!match) {
    log('pattern is not a valid MatchPattern', pattern);
    throw new TypeError(`"${pattern}" is not a valid MatchPattern`);
  }

  // eslint-disable-next-line prefer-const
  let [, scheme, host, path] = match;
  if (!host)
    throw new TypeError(`"${pattern}" does not have a valid host`);

  let regex = '^';

  if (scheme === '*') {
    regex += '(http|https)';
  }
  else {
    regex += scheme;
  }

  regex += '://';

  if (host && host === '*') {
    regex += '[^/]+?';
  }
  else if (host) {
    if (host.match(/^\*\./)) {
      regex += '[^/]*?';
      host = host.substring(2);
    }
    regex += host.replace(/\./g, '\\.');
  }

  if (path) {
    if (path === '*') {
      regex += '(/.*)?';
    }
    else if (path.charAt(0) !== '/') {
      regex += '/';
      regex += path.replace(/\./g, '\\.').replace(/\*/g, '.*?');
      regex += '/?';
    }
  }

  regex += '$';
  return new RegExp(regex);
}

(async () => {
  await configs.$loaded;

  if (configs.talkEnabled)
    return runTalkServer();

  log('Running as a stand-alone mode')

  await applyMCDConfigs();
  await setDefaultPath();

  const browserInfo = browser.runtime.getBrowserInfo && await browser.runtime.getBrowserInfo();
  isFirefox  = browserInfo && browserInfo.name == 'Firefox';
  isChromium = !isFirefox;
  if (isFirefox &&
      parseInt(browserInfo.version.split('.')[0]) >= 53)
    installMenuItems.supportsTabContext = true;

  if (configs.contextMenu)
    installMenuItems();

  if (!configs.disableForce)
    installBlocker();

  setSitesOpenedBySelf();

  configs.$addObserver(onConfigUpdated);

  browser.storage.onChanged.addListener(onTalkEnabled);

  browser.tabs.onCreated.addListener(tab => {
    debug('new tab: ', tab.id);
    openingTabs.set(tab.id, true);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (changeInfo.status == 'complete' ||
        (changeInfo.url &&
         !/^(about:(blank|newtab|home))$/.test(changeInfo.url))) {
      const alarmName = `onUpdated-${tabId}`;
      browser.alarms.create(alarmName, { delayInMinutes: configs.closeReloadPageMaxDelayMsec / 1000 / 60 });
      browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name != alarmName)
          return;
        debug('remove tab from opening tabs list: ', tabId);
        // This needs to be done after the onBeforeRequest listener is processed.
        openingTabs.delete(tabId);
        browser.alarms.clear(alarmName);
      });
    }
  });

  browser.alarms.create('checkThinBridgeMode', { delayInMinutes: 2500 / 1000 / 60 });
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name != 'checkThinBridgeMode')
      return;
    checkThinBridgeMode();
  });
})();

async function applyMCDConfigs() {
  try {
    const response = await send({ command: 'read-mcd-configs' });
    log('loaded MCD configs: ', JSON.stringify(response));
    if ('loadedKeys' in response) {
      if (Array.isArray(response.loadedKeys))
        response.loadedKeys.forEach(key => {
          configs[key] = response[key];
          configs.$lock(key);
        });
    }
    else {
      Object.keys(response).forEach(key => {
        configs[key] = response[key];
        configs.$lock(key);
      });
    }
  }
  catch(error) {
    log('Failed to read MCD configs: ', error);
  }
}

async function setDefaultPath() {
  if (configs.ieapp)
    return;
  try {
    const response = await send({ command: 'get-ie-path' });
    if (response) {
      log('Received: ', JSON.stringify(response));
      if (response.path)
        configs.ieapp = response.path;
    }
  }
  catch(error) {
    log('Error: ', error);
  }
}

function setSitesOpenedBySelf() {
  if (configs.disableException) {
    sitesOpenedBySelfList = [];
    sitesOpenedBySelfRegex = null;
  }
  else {
    sitesOpenedBySelfList = configs.sitesOpenedBySelf.trim().split(/\s+/).filter(item => !!item);
    if (sitesOpenedBySelfList.length > 0)
      sitesOpenedBySelfRegex = new RegExp(sitesOpenedBySelfList.map(pattern => {
        if (VALID_MATCH_PATTERN.exec(pattern)) {
          return `${matchPatternToRegExp(pattern)}`.replace(/^\/(.+)\//, '$1');
        }
        else {
          return `${migratePatternToRegExp(pattern)}`.replace(/^\/(.+)\//, '$1');
        }
      }).join('|'));
    else
      sitesOpenedBySelfRegex = null;
  }
}

function onConfigUpdated(key) {
  switch (key) {
    case 'contextMenu':
      if (configs.contextMenu) {
        installMenuItems();
      }
      else {
        browser.contextMenus.removeAll();
      }
      break;

    case 'onlyMainFrame':
      // fall through
    case 'forceielist':
      uninstallBlocker();
      if (!configs.disableForce)
        installBlocker();
      break;

    case 'disableForce':
      if (configs.disableForce) {
        uninstallBlocker();
      }
      else {
        installBlocker();
      }
      break;
    case 'sitesOpenedBySelf':
      // fall through
    case 'disableException':
      setSitesOpenedBySelf()
      break;
  }
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab.url;
  log(`procesing url = ${url}`);

  launch(url);
});


async function launch(url) {
  if (!configs.ieapp && !configs.ieargs)
    return;

  const message = {
    command: 'launch',
    params: {
      path: configs.ieapp,
      args: configs.ieargs.trim().split(/\s+/).filter(item => !!item),
      url
    }
  };
  try{
    const response = await send(message);
    log('Received: ', JSON.stringify(response));
  }
  catch(error) {
    log('Error: ', error);
  }
}

function send(message) {
  if (configs.logging)
    message.logging = true;
  if (configs.debug)
    message.debug = true;
  message.logRotationCount = configs.logRotationCount;
  message.logRotationTime = configs.logRotationTime;
  log('Sending: ', JSON.stringify(message));
  return browser.runtime.sendNativeMessage('com.clear_code.ieview_we_host', message);
}
