/**
 * Network (PeerJS)
 * =================
 *
 * An abstraction over PeerJS.
 */
"use strict";
let dependencies = {
  Channel: require('./channel-peerjs'),
  Constants: require('./constants').Default.Network,
  extend: require('./extend'),
  Peer: require('peerjs'),
  Random: require('./random'),
  Struct: require('./struct')
};

function inject(deps) {
  let Channel = deps.Channel;
  let Constants = deps.Constants;
  let extend = deps.extend;
  let Peer = deps.Peer;
  let Random = deps.Random;
  let Struct = deps.Struct;

  function Network(opts, netstream, awaits) {
    if (!(this instanceof Network))
      return new Network(opts, netstream, awaits);
    this.initialize();
    this.fromObject({
      opts: opts,
      netstream: netstream,
      awaits: awaits
    });
  }

  Network.prototype.fromObject = Struct.prototype.fromObject;

  Network.prototype.initialize = function() {
    this.opts = {};
    this.awaits = [];
  };

  Network.prototype.createNetstream = function() {
    let id = this.opts.id;
    if (!id) {
      id = Random.getRandomBuffer(16).toString('hex');
      this.opts.id = id;
    }
    this.netstream = new Peer(id, Constants.rendezvous);
    this.netstream.on('connection', this.onConnection.bind(this));
    return this;
  };

  Network.prototype.open = function() {
    if (!this.netstream)
      this.createNetstream();
    let opts = extend({}, Constants, this.opts);
    return new Promise(function(resolve, reject) {
      this.netstream.on('open', resolve);
      this.netstream.on('error', function(error) {
        reject(error);
      });
    }.bind(this));
  };

  Network.prototype.address = function() {
    return {id: this.opts.id};
  };

  Network.prototype.onConnection = function(bufstream) {
    let channel = Channel({}, bufstream);
    channel.monitor();
    this.awaits.forEach(function(await) {
      await.resolve(channel);
    });
    return this;
  };

  Network.prototype.awaitChannels = function*() {
    while (this.netstream) {
      yield new Promise(function(resolve, reject) {
        this.awaits.push({
          resolve: resolve,
          reject: reject
        });
      }.bind(this));
    }
  };

  Network.prototype.connect = function(opts) {
    return new Promise(function(resolve, reject) {
      let bufstream = this.netstream.connect(opts.id);
      bufstream.on('open', function() {
        let channel = Channel(opts, bufstream);
        channel.monitor();
        resolve(channel);
      });
      bufstream.on('error', reject);
    }.bind(this));
  };

  Network.prototype.close = function() {
    return new Promise(function(resolve, reject) {
      this.netstream.disconnect();
      this.netstream.on('disconnected', resolve);
      this.netstream.on('error', reject);
      delete this.netstream;
    }.bind(this));
  };

  return Network;
};

inject = require('./injector')(inject, dependencies);
let Network = inject();
module.exports = Network;
