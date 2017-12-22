function installMenuItems() {
  browser.contextMenus.create({
    id: 'page',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu.page.label'),
    contexts: installMenuItems.supportsTabContext ? ['page', 'tab'] : ['page']
  });
  browser.contextMenus.create({
    id: 'link',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu.link.label'),
    contexts: ['link']
  });
}
installMenuItems.supportsTabContext = true;

function installBlocker() {
  var list = configs.forceielist.trim().split(/\s+/).filter((aItem) => !!aItem);
  log('force list: ', list);
  var types = ['main_frame'];
  if (!configs.onlyMainFrame)
    types.push('sub_frame');
  if (list.length > 0 &&
      !browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls: list,
        types },
      ['blocking']
    );
}
function uninstallBlocker() {
  if (browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
}
function onBeforeRequest(aDetails) {
  log('onBeforeRequest', aDetails);
  var redirected = true;

  var targetURL = aDetails.url;
  if (configs.ignoreQueryString)
    targetURL = aDetails.url.replace(/\?.*/, '');

  if (sitesOpenedBySelfRegex) {
    log('sitesOpenedBySelfList: ', sitesOpenedBySelfList);
    var matched = false;
    log('test url:', targetURL);
    matched = sitesOpenedBySelfRegex.test(targetURL);
    log('matched?: ', matched);
    if (matched)
      redirected = false;
    log('redirected?: ', redirected);
  }
  if (redirected) {
    launch(aDetails.url);
  }
  else {
    log('url is not redirected: ', aDetails.url);
  }
  return { cancel: redirected };
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

  const schemeSegment = '(\\*|http|https|file|ftp)';
  const hostSegment = '(\\*|(?:\\*\\.)?(?:[^/*]+))?';
  const pathSegment = '(.*)';
  const matchPatternRegExp = new RegExp(
    `^${schemeSegment}://${hostSegment}/${pathSegment}$`
  );

  let match = matchPatternRegExp.exec(pattern);
  if (!match)
    throw new TypeError(`"${pattern}" is not a valid MatchPattern`);

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
  await configs.$load();
  await applyMCDConfigs();
  await setDefaultPath();

  var browserInfo = await browser.runtime.getBrowserInfo();
  if (browserInfo.name == 'Firefox' &&
      parseInt(browserInfo.version.split('.')[0]) < 53)
    installMenuItems.supportsTabContext = false;

  if (configs.contextMenu)
    installMenuItems();

  if (!configs.disableForce)
    installBlocker();

  setSitesOpenedBySelf();

  configs.$addObserver(onConfigUpdated);
})();

async function applyMCDConfigs() {
  try {
    var response = await send({ command: 'read-mcd-configs' });
    log('loaded MCD configs: ', response);
    Object.keys(response).forEach((aKey) => {
      configs[aKey] = response[aKey];
      configs.$lock(aKey);
    });
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
      log('Received: ', response);
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
    sitesOpenedBySelfRegex = new RegExp('(' + sitesOpenedBySelfList.map(matchPatternToRegExp).join('|') + ')');
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
    log('Received: ', response);
  }
  catch(aError) {
    log('Error: ', aError);
  }
}

function send(aMessage) {
  log('Sending: ', aMessage);
  if (configs.debug)
    aMessage.logging = true;
  return browser.runtime.sendNativeMessage('com.clear_code.ieview_we_host', aMessage);
}
