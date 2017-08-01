function installMenuItems() {
  browser.contextMenus.create({
    id: 'page',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu.page.label'),
    contexts: ['page', 'tab']
  });
  browser.contextMenus.create({
    id: 'link',
    type: 'normal',
    title: browser.i18n.getMessage('contextMenu.link.label'),
    contexts: ['link']
  });
}

var gForceList = [];
function initForceList() {
  gForceList = configs.forceielist.trim().split(/\s+/);
}

function installBlocker() {
  if (!browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, '<all_urls>', { blocking: true });
}
function uninstallBlocker() {
  if (browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
}
function onBeforeRequest(aDetails) {
  log('onBeforeRequest', url);
  return { cancel: false };
}

installMenuItems();
initForceList();

configs.$load().then(() => {
  if (configs.contextMenu)
    installMenuItems();

  initForceList();

  if (!configs.disableForce)
    installBlocker();
});
configs.$addObserver((aKey) => {
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
      initForceList();
      break;

    case 'disableForce':
      if (configs.disableForce) {
        uninstallBlocker();
      }
      else {
        installBlocker();
      }
      break;
  }
});

browser.contextMenus.onClicked.addListener(function(aInfo, aTab) {
  let url = aInfo.linkUrl || aInfo.pageUrl || aTab.url;
  log('procesing url = ' + url);

  open(url);
});
