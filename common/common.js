/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

var configs;

function log(aMessage, ...aArgs)
{
	if (!configs || !configs.debug)
		return;

	console.log('ieview-we: ' + aMessage, ...aArgs);
}

configs = new Configs({
	ieapp        : '',
	ieargs       : '',
	forceielist  : '',
	disableForce : false,
	contextMenu  : true,
	debug        : false
});

function open(aURL) {
  if (!configs.ieapp && !configs.ieargs)
    return;

  let message = {
    cmd: 'exec',
    command: configs.ieapp,
    arguments: configs.ieargs.split(/\s+/).concat([aURL])
  };
  log('Sending: ', message);
  return browser.runtime.sendNativeMessage('com.add0n.node', message).then(
    (aResponse) => {
      log('Received: ', aResponse);
    },
    (aError) => {
      log('Error: ', aError);
    }
  );
}
