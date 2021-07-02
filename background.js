var gIsFirefox  = browser.runtime.getBrowserInfo;
var gIsChromium = !browser.runtime.getBrowserInfo;

var CANCEL_RESPONSE = gIsChromium ?
  { redirectUrl: `data:text/html,${escape('<script type="application/javascript">history.back()</script>')}` } :
  { cancel: true } ;

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

var forceIEListRegex = null;
function installBlocker() {
  if (configs.talkEnabled) {
      return;
  }
  var list = configs.forceielist.trim().split(/\s+/).filter((aItem) => !!aItem);
  log('force list: ', list);
  var types = ['main_frame'];
  if (!configs.onlyMainFrame)
    types.push('sub_frame');
  debug('frame types: ', types);
  let urls = list;
  forceIEListRegex = new RegExp(list.map((pattern) => {
    if (!VALID_MATCH_PATTERN.exec(pattern)) {
      urls = ['<all_urls>'];
      return `${migratePatternToRegExp(pattern)}`.replace(/^\/(.+)\//, '$1')
    } else {
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
function onBeforeRequest(aDetails) {
  log('onBeforeRequest', aDetails);
  var redirected = true;

  if (aDetails.tabId < 0) {
    log('invalid tabId: ', aDetails.tabId);
    redirected = false;
  }
  else {
    var targetURL = aDetails.url;
    if (configs.ignoreQueryString)
      targetURL = aDetails.url.replace(/\?.*/, '');

    debug('targetURL: ', targetURL);
    if (forceIEListRegex) {
      debug('forceIEListRegex: ', forceIEListRegex);
      matched = forceIEListRegex.test(targetURL);
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
      var matched = false;
      debug('test url:', targetURL);
      matched = sitesOpenedBySelfRegex.test(targetURL);
      debug('matched to sitesOpenedBySelfRegex?: ', matched);
      if (matched)
        redirected = false;
    }
    debug('redirected?: ', redirected);
    if (redirected) {
      launch(aDetails.url);
      log('is opening tab?: ', gOpeningTabs.has(aDetails.tabId));
      if (configs.closeReloadPage &&
          gOpeningTabs.has(aDetails.tabId)) {
        gOpeningTabs.delete(aDetails.tabId);
        browser.tabs.remove(aDetails.tabId);
      }
    }
    else {
      log('url is not redirected: ', aDetails.url);
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
var TalkClient = {

  init: function() {
    if (this.running) {
        return;
    }
    this.isNewTab = {};
    this.callback = this.onBeforeRequest.bind(this);
    this.listen();
    this.running = true;
    log('Running as Talk client');
  },

  listen: function() {
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

    browser.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'complete') {
        if (info.url && !/^(about:(blank|newtab|home))$/.test(info.url)) {
          delete this.isNewTab[tab.id];
        }
      }
    });
  },

  onBeforeRequest: async function(details) {
    var server = configs.talkServerName;
    var query = 'Q firefox ' + details.url;

    debug('Query "' + query + '" to ' + server);
    var resp = await browser.runtime.sendNativeMessage(server, query);

    debug('Response was', JSON.stringify(resp));
    if (!resp) {
        return {};  // Continue anyway
    }
    if (resp.open) {
        if (resp.close_tab && this.isNewTab[details.tabId]) {
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
var ChromeTalkClient = {

  NAME: 'ChromeTalkClient',

  init: function() {
    if (this.running) {
        return;
    }
    this.cached = null;
    this.isNewTab = {};
    this.configure();
    this.listen();
    this.running = true;
    log('Running as Talk client for', configs.talkBrowserName);
  },

  configure: function() {
    var server = configs.talkServerName;
    var query = new String('C ' + configs.talkBrowserName);

    chrome.runtime.sendNativeMessage(server, query, (resp) => {
      this.cached = resp.config;
      debug('[Talk] configure', resp.config);
    });
  },

  listen: function() {
    chrome.webRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      {
        urls: ['<all_urls>'],
        types: ['main_frame']
      },
      ['blocking']
    );

    /* Refresh config for every N minute */
    log('[Talk] poll config for every', configs.talkAlarmMinutes, 'minutes');
    chrome.alarms.create(this.NAME, {'periodInMinutes': configs.talkAlarmMinutes});

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.NAME) {
        this.configure();
      }
    });

    /* Tab book-keeping for intelligent tab handlings */
    chrome.tabs.onCreated.addListener(tab => {
      this.isNewTab[tab.id] = 1;
    });

    chrome.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'complete') {
        delete this.isNewTab[tab.id];
      }
    });
  },

  /* Convert BrowserSelector's pattern into RegExp */
  regex: function(pattern, bs) {
    if (bs.UseRegex)
        return RegExp(pattern);

    // BrowserSelector support a 'simple' pattern that allows to use
    // `*` for any strings, and `?` for any single character.
    var specials = /(\.|\+|\(|\)|\[|\]|\\|\^|\$|\|)/g;
    //                .  +  (  )  [  ]  \  ^  $  |

    pattern = pattern.replace(specials, '\\$1');
    pattern = pattern.replace(/\*/g, '.*');
    pattern = pattern.replace(/\?/g, '.');

    return RegExp('^' + pattern + '$', 'i');
  },

  redirect: function(bs, details) {
    var server = configs.talkServerName;
    var query = new String('Q ' + configs.talkBrowserName + ' ' + details.url);

    if (details.tabId < 0) {
        return;
    }

    chrome.tabs.get(details.tabId, (tab) => {
      /* This is required for Chrome's "preload" tabs */
      if (chrome.runtime.lastError) return;
      if (!tab) return;

      /* Open another browser via Query */
      chrome.runtime.sendNativeMessage(server, query);

      /* Close the opening tab automatically (if required) */
      if (bs.CloseEmptyTab && this.isNewTab[details.tabId]) {
        chrome.tabs.remove(details.tabId);
      }
    });
    return CANCEL_RESPONSE;
  },

  onBeforeRequest: function(details) {
    var bs = this.cached;
    var host = details.url.split('/')[2];

    if (!bs) {
      log('[Talk] config cache is empty. Fetching...');
      this.configure();
      return;
    }

    /* URLPatterns */
    for (var i = 0; i < bs.URLPatterns.length; i++) {
      var pattern = bs.URLPatterns[i][0];
      var browser = bs.URLPatterns[i][1].toLowerCase();

      if (this.regex(pattern, bs).test(details.url)) {
        debug('[Talk] Match', {pattern: pattern, url: details.url, browser: browser})
        if (browser == configs.talkBrowserName)
          return;
        if (browser == '' && bs.SecondBrowser == configs.talkBrowserName)
          return;
        return this.redirect(bs, details);
      }
    }

    /* HostNamePatterns */
    for (var i = 0; i < bs.HostNamePatterns.length; i++) {
      var pattern = bs.HostNamePatterns[i][0];
      var browser = bs.HostNamePatterns[i][1].toLowerCase();

      if (this.regex(pattern, bs).test(host)) {
        debug('[Talk] Match', {pattern: pattern, host: host, browser: browser})
        if (browser == configs.talkBrowserName)
          return;
        if (browser == '' && bs.SecondBrowser == configs.talkBrowserName)
          return;
        return this.redirect(bs, details);
      }
    }

    /* No pattern matched */
    debug('[Talk] No pattern matched', {url: details.url})
    if (bs.DefaultBrowser !== configs.talkBrowserName) {
      return this.redirect(bs, details);
    }
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
  var i = 0;
  var j = 0;
  var mp, cp;

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
var ThinBridgeTalkClient = {

  NAME: 'ThinBridgeTalkClient',

  init: function() {
    if (this.running) {
        return;
    }
    this.cached = null;
    this.isNewTab = {};
    this.configure();
    this.listen();
    this.running = true;
    console.log('Running as Thinbridge Talk client');
  },

  configure: function() {
    var query = new String('C chrome');

    chrome.runtime.sendNativeMessage(configs.talkServerName, query, (resp) => {
      if (chrome.runtime.lastError) {
        console.log('Cannot fetch config', JSON.stringify(chrome.runtime.lastError));
        return;
      }
      var isStartup = (this.cached == null);
      this.cached = resp.config;
      console.log('Fetch config', JSON.stringify(this.cached));

      if (isStartup) {
        this.handleStartup(this.cached);
      }
    });
  },

  listen: function() {
    chrome.webRequest.onBeforeRequest.addListener(
      this.onBeforeRequest.bind(this),
      {
        urls: ['<all_urls>'],
        types: ['main_frame','sub_frame']
      },
      ['blocking']
    );

    /* Refresh config for every N minute */
    log('[Talk] poll config for every', configs.talkAlarmMinutes, 'minutes');
    chrome.alarms.create(this.NAME, {'periodInMinutes': configs.talkAlarmMinutes});

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === this.NAME) {
        this.configure();
      }
    });

    /* Tab book-keeping for intelligent tab handlings */
    chrome.tabs.onCreated.addListener(tab => {
      this.isNewTab[tab.id] = 1;
    });

    chrome.tabs.onUpdated.addListener((id, info, tab) => {
      if (info.status === 'complete') {
        delete this.isNewTab[tab.id];
      }
    });
  },

  redirect: function(url, tabId, closeTab) {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.log(`* Ignore prefetch request`);
        return;
      }
      if (!tab) {
        console.log(`* URL is not coming from an actual tab`);
        return;
      }

      var query = new String('Q chrome ' + url);
      chrome.runtime.sendNativeMessage(configs.talkServerName, query);

      if (closeTab) {
        chrome.tabs.remove(tabId);
      }
    });
  },

  isRedirectURL: function(tbconfig, url) {
    if (!url) {
      console.log(`* Empty URL found`);
      return false;
    }

    if (!/^https?:/.test(url)) {
      console.log(`* Ignore non-HTTP/HTTPS URL`);
      return false;
    }

    if (tbconfig.IgnoreQueryString) {
      url = url.replace(/\?.*/, '');
    }
    console.log(`* Check patterns for ${url}`);

    var i;
    for (i = 0; i < tbconfig.URLExcludePatterns.length; i++) {
      if (wildcmp(tbconfig.URLExcludePatterns[i][0], url)) {
        console.log(`* Match Exclude [${tbconfig.URLExcludePatterns[i][0]}]`)
        return true;
      }
    }

    for (i = 0; i < tbconfig.URLPatterns.length; i++) {
      if (wildcmp(tbconfig.URLPatterns[i][0], url)) {
        console.log(`* Match [${tbconfig.URLPatterns[i][0]}]`)
        return false;
      }
    }
    console.log(`* No pattern matched`);
    return true;
  },

  /* Handle startup tabs preceding to onBeforeRequest */
  handleStartup: function(tbconfig) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        var url = tab.url || tab.pendingUrl;
        console.log(`handleStartup ${url} (tab=${tab.id})`);
        if (this.isRedirectURL(tbconfig, url)) {
          console.log(`* Redirect to another browser`);
          this.redirect(url, tab.id, tbconfig.CloseEmptyTab);
        }
      });
    });
  },

  /* Callback for webRequest.onBeforeRequest */
  onBeforeRequest: function(details) {
    var tbconfig = this.cached;
    var closeTab = false;
    var isMainFrame = (details.type == 'main_frame');

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

    if (tbconfig.CloseEmptyTab && isMainFrame && this.isNewTab[details.tabId]) {
      closeTab = true;
    }

    if (this.isRedirectURL(tbconfig, details.url)) {
      console.log(`* Redirect to another browser`);
      this.redirect(details.url, details.tabId, closeTab);
      return CANCEL_RESPONSE;
    }
  }
};

function runTalkServer() {
    if (configs.talkServerName == 'com.clear_code.thinbridge') {
        return ThinBridgeTalkClient.init();
    } else if (gIsChromium) {
        return ChromeTalkClient.init();
    } else {
        return TalkClient.init();
    }
}

/*
 * Listen `chrome.storage.onChange` to launch talkServer on
 * delay-loaded GPO settings.
 */
function onTalkEnabled(data, storageName) {
    if (data.talkBrowserName) {
        configs.talkBrowserName = data.talkBrowserName.newValue;
    }

    if (data.talkServerName) {
        configs.talkServerName = data.talkServerName.newValue;
    }

    if (data.talkEnabled) {
        configs.talkEnabled = data.talkEnabled.newValue;
    }

    if (data.talkEnabled && data.talkEnabled.newValue) {
        log('[Talk] talkEnabled is turned on. Launch a client...');
        uninstallBlocker();
        runTalkServer();
    }
    log('chrome.storage.onChange: ', storageName, JSON.stringify(data));
}

/*
 * This is a safety lock to ensure ThinBridgeTalkClient is running.
 *
 * We have seen a few stability issues on Chrome where IEView WE
 * fails to get managed policy on startup, so we check the running
 * state a few seconds later.
 */
function checkThinBridgeMode() {
    if (!browser.storage.managed) {
        log('[managed] managed storage is null')
    }

    browser.storage.managed.get().then((m) => {
        log(`[managed] config = `, JSON.stringify(m));

        if (!gIsChromium) {
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

        if (m.talkEnabled && m.talkServerName == "com.clear_code.thinbridge") {
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
const VALID_MATCH_PATTERN = (() => {
  const schemeSegment = '(\\*|http|https|file|ftp)';
  const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';
  const pathSegment = '(.*)';
  const regex = new RegExp(
    `^${schemeSegment}://${hostSegment}/${pathSegment}$`
  );
  return regex;
})();

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
    let extracted = pattern.substring(1, pattern.length - 1);
    log('convert host to regex:', '*://*.' + extracted + '/*');
    let hostRegex = matchPatternToRegExp('*://*.' + extracted + '/*');
    log('convert path to regex:', '*://*/' + pattern);
    let pathRegex = matchPatternToRegExp('*://*/' + pattern);
    log('migrated match pattern based regex:', hostRegex + '|' + pathRegex);
    return new RegExp(`${hostRegex}`.replace(/^\/(.+)\//, '$1') + '|' + `${pathRegex}`.replace(/^\/(.+)\//, '$1'));
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

  let match = VALID_MATCH_PATTERN.exec(pattern);
  if (!match) {
    log('pattern is not a valid MatchPattern', pattern);
    throw new TypeError(`"${pattern}" is not a valid MatchPattern`);
  }

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

var gOpeningTabs = new Map();

(async () => {
  await configs.$loaded;

  if (configs.talkEnabled) {
      return runTalkServer();
  }
  log('Running as a stand-alone mode')

  await applyMCDConfigs();
  await setDefaultPath();

  var browserInfo = browser.runtime.getBrowserInfo && await browser.runtime.getBrowserInfo();
  gIsFirefox  = browserInfo && browserInfo.name == 'Firefox';
  gIsChromium = !gIsFirefox;
  if (gIsFirefox &&
      parseInt(browserInfo.version.split('.')[0]) >= 53)
    installMenuItems.supportsTabContext = true;

  if (configs.contextMenu)
    installMenuItems();

  if (!configs.disableForce)
    installBlocker();

  setSitesOpenedBySelf();

  configs.$addObserver(onConfigUpdated);

  browser.storage.onChanged.addListener(onTalkEnabled);

  browser.tabs.onCreated.addListener(aTab => {
    debug('new tab: ', aTab.id);
    gOpeningTabs.set(aTab.id, true);
  });
  browser.tabs.onUpdated.addListener((aTabId, aChangeInfo, aTab) => {
    if (aChangeInfo.status == 'complete' ||
        (aChangeInfo.url &&
         !/^(about:(blank|newtab|home))$/.test(aChangeInfo.url))) {
      setTimeout(() => {
        debug('remove tab from opening tabs list: ', aTab.id);
        // This needs to be done after the onBeforeRequest listener is processed.
        gOpeningTabs.delete(aTabId);
      }, configs.closeReloadPageMaxDelayMsec);
    }
  });
  setTimeout(checkThinBridgeMode, 2500);
})();

async function applyMCDConfigs() {
  try {
    var response = await send({ command: 'read-mcd-configs' });
    log('loaded MCD configs: ', JSON.stringify(response));
    if ('loadedKeys' in response) {
      if (Array.isArray(response.loadedKeys))
        response.loadedKeys.forEach((aKey) => {
          configs[aKey] = response[aKey];
          configs.$lock(aKey);
        });
    }
    else {
      Object.keys(response).forEach((aKey) => {
        configs[aKey] = response[aKey];
        configs.$lock(aKey);
      });
    }
  }
  catch(aError) {
    log('Failed to read MCD configs: ', aError);
  }
}

async function setDefaultPath() {
  if (configs.ieapp)
    return;
  try {
    let response = await send({ command: 'get-ie-path' });
    if (response) {
      log('Received: ', JSON.stringify(response));
      if (response.path)
        configs.ieapp = response.path;
    }
  }
  catch(aError) {
    log('Error: ', aError);
  }
}

var sitesOpenedBySelfList = [];
var sitesOpenedBySelfRegex = null;
function setSitesOpenedBySelf() {
  if (configs.disableException) {
    sitesOpenedBySelfList = [];
    sitesOpenedBySelfRegex = null;
  }
  else {
    sitesOpenedBySelfList = configs.sitesOpenedBySelf.trim().split(/\s+/).filter((aItem) => !!aItem);
    if (sitesOpenedBySelfList.length > 0)
      sitesOpenedBySelfRegex = new RegExp(sitesOpenedBySelfList.map((pattern) => {
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

function onConfigUpdated(aKey) {
  switch (aKey) {
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

browser.contextMenus.onClicked.addListener(function(aInfo, aTab) {
  let url = aInfo.linkUrl || aInfo.pageUrl || aTab.url;
  log('procesing url = ' + url);

  launch(url);
});


async function launch(aURL) {
  if (!configs.ieapp && !configs.ieargs)
    return;

  let message = {
    command: 'launch',
    params: {
      path: configs.ieapp,
      args: configs.ieargs.trim().split(/\s+/).filter((aItem) => !!aItem),
      url:  aURL
    }
  };
  try{
    let response = await send(message);
    log('Received: ', JSON.stringify(response));
  }
  catch(aError) {
    log('Error: ', aError);
  }
}

function send(aMessage) {
  if (configs.logging)
    aMessage.logging = true;
  if (configs.debug)
    aMessage.debug = true;
  aMessage.logRotationCount = configs.logRotationCount;
  aMessage.logRotationTime = configs.logRotationTime;
  log('Sending: ', JSON.stringify(aMessage));
  return browser.runtime.sendNativeMessage('com.clear_code.ieview_we_host', aMessage);
}
