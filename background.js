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
      return `${migratePatternToRegExp(pattern)}`.replace(/^\/(.+)\//, "$1")
    } else {
      return `${matchPatternToRegExp(pattern)}`.replace(/^\/(.+)\//, "$1");
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
      debug('redirected?: ', redirected);
    }
    if (redirected) {
      launch(aDetails.url);
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
    this.callback = this.onBeforeRequest.bind(this);
    this.listen();
    log('Running as Talk client');
  },

  listen: function() {
    browser.webRequest.onBeforeRequest.addListener(
      this.callback,
      {
        urls: ["<all_urls>"],
        types: ["main_frame"]
      },
      ["blocking"]
    );
  },

  onBeforeRequest: async function(details) {
    var server = configs.talkServerName;
    var query = "Q firefox " + details.url;

    debug('Query "' + query + '" to ' + server);
    var resp = await browser.runtime.sendNativeMessage(server, query);

    debug('Response was', JSON.stringify(resp));
    if (!resp) {
        return {};  // Continue anyway
    }
    if (resp.open) {
        if (resp.close_tab) {
            await browser.tabs.remove(details.tabId);
        }
        return CANCEL_RESPONSE;  // Stop the request
    }
    return {};
  }
};

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
    return new RegExp(`${hostRegex}`.replace(/^\/(.+)\//, "$1") + '|' + `${pathRegex}`.replace(/^\/(.+)\//, "$1"));
  } else {
    // Just convert * and ?
    pattern = pattern.replace(/\*/g, ".*");
    pattern = pattern.replace(/\?/g, ".?");
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
  await applyMCDConfigs();
  await setDefaultPath();

  if (configs.talkEnabled) {
    return TalkClient.init();
  }

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


  browser.tabs.onCreated.addListener(aTab => {
    gOpeningTabs.set(aTab.id, true);
  });
  browser.tabs.onUpdated.addListener((aTabId, aChangeInfo, aTab) => {
    if (aChangeInfo.status == 'complete' ||
        (aChangeInfo.url &&
         !/^(about:(blank|newtab|home))$/.test(aChangeInfo.url))) {
      gOpeningTabs.delete(aTabId);
    }
  });
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
          return `${matchPatternToRegExp(pattern)}`.replace(/^\/(.+)\//, "$1");
        }
        else {
          return `${migratePatternToRegExp(pattern)}`.replace(/^\/(.+)\//, "$1");
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
