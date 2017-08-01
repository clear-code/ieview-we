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

installMenuItems();
initForceList();

configs.$load().then(() => {
  installMenuItems();
  initForceList();
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
  }
});

browser.contextMenus.onClicked.addListener(function(aInfo, aTab) {
  let url = aInfo.linkUrl || aInfo.pageUrl || aTab.url;
  log('procesing url = ' + url);

  open(url);
});
