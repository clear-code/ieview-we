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

function installBlocker() {
  var list = configs.forceielist.trim().split(/\s+/).filter((aItem) => !!aItem);
  log('force list: ', list);
  if (list.length > 0 &&
      !browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls: list,
        types: ['main_frame', 'sub_frame'] },
      ['blocking']
    );
}
function uninstallBlocker() {
  if (browser.webRequest.onBeforeRequest.hasListener(onBeforeRequest))
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
}
function onBeforeRequest(aDetails) {
  log('onBeforeRequest', aDetails);
  open(aDetails.url);
  return { cancel: true };
}

configs.$load().then(() => {
  applyMCDConfigs()
    .then(() => {
      return setDefaultPath();
    })
    .then(() => {
      if (configs.contextMenu)
        installMenuItems();

      if (!configs.disableForce)
        installBlocker();

      configs.$addObserver(onConfigUpdated);
    });
});

function applyMCDConfigs() {
  return send({ command: 'read-mcd-configs' }).then(
    (aResponse) => {
      log('loaded MCD configs: ', aResponse);
      Object.keys(aResponse).forEach((aKey) => {
        configs[aKey] = aResponse[aKey];
        configs.$lock(aKey);
      });
    },
    (aError) => {
      log('Failed to read MCD configs: ', aError);
    }
  );
}

function setDefaultPath() {
  if (!configs.ieapp) {
    return send({ command: 'get-ie-path' }).then(
      (aResponse) => {
        log('Received: ', aResponse);
        if (aResponse.path)
          configs.ieapp = aResponse.path;
      },
      (aError) => {
        log('Error: ', aError);
      }
    );
  }
  else {
    return Promise.resolve();
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
  }
}

browser.contextMenus.onClicked.addListener(function(aInfo, aTab) {
  let url = aInfo.linkUrl || aInfo.pageUrl || aTab.url;
  log('procesing url = ' + url);

  launch(url);
});


function launch(aURL) {
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
  return send(message).then(
    (aResponse) => {
      log('Received: ', aResponse);
    },
    (aError) => {
      log('Error: ', aError);
    }
  );
}

function send(aMessage) {
  log('Sending: ', aMessage);
  return browser.runtime.sendNativeMessage('com.clear_code.ieview_we_host', aMessage);
}
