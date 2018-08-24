# ccxtoken
Support for Stellar exchange

The Stellar cryptocurrency (XLM) has a built-in decentralized exchange (DEX). This repository includes
Javascript code for exchanging tokens on the exchange with real Conceal cryptocurrency (CCX).

Stellar provides a [guide](https://www.stellar.org/developers/guides/walkthroughs/custom-assets.html)
for creating a token on their exchange. A website is needed to support the token. The one for
CCX is hosted on github [here](https://github.com/ccxtoken/ccxtoken.github.io) and
[here](https://ccxtoken.github.io/).

A separate server that supports *node-js* is needed host the code for exchanging tokens.
[conceal-core](https://github.com/TheCircleFoundation/conceal-core) must be installed, and
conceald (daemon) and two instances of concealwallet (simplewallet) must be launched and left
running.

It is recommended to use the linux *screen* program to launch several concurrent programs and leave
them running after logging off the server.

* Start *screen*
* Start conceald on ports 15000 (P2P)/16000 (RPC) using *daemon.sh*
* Start the live wallet on port 3333 using *live-rpc.sh*
* Start the messages wallet or port 3334 using *messages-rpc.sh*
* Start the token exchanger *ccx.js*
* Start the monitor server on port 4444 *server.js*

Ports 15000 and 4444 should be open on the server.
The two wallets require passwords.
*ccx.js* requires *npm stellar-sdk* and must be edited to add a Stellar secret key and a
Conceal public address.
When run for the first time, use the last two commented lines in ccx.js to initialize
*pointer* and *register*, by uncommenting them one at at time, while commenting the
the last uncommented line.
