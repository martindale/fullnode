/**
 * Peer-to-Peer Network Connection
 * ===============================
 */
"use strict";
let dependencies = {
  Channel: require('./channel'),
  Msg: require('./msg'),
  Struct: require('./struct'),
  Work: require('./work')
};

function inject(deps) {
  let Channel = deps.Channel;
  let Msg = deps.Msg;
  let Struct = deps.Struct;
  let Work = deps.Work;

  function Connection(opts, channel, buffers, msgassembler, awaits) {
    if (!(this instanceof Connection))
      return new Connection(opts, channel, buffers, msgassembler, awaits);
    this.initialize();
    this.fromObject({
      opts: opts,
      channel: channel,
      buffers: buffers,
      msgassembler: msgassembler,
      awaits: awaits
    });
  }

  Connection.prototype.fromObject = Struct.prototype.fromObject;

  Connection.prototype.initialize = function() {
    this.awaits = [];
    return this;
  };

  Connection.prototype.monitor = function() {
    if (!this.buffers)
      this.buffers = this.channel.awaitBuffers();
    let promise = this.buffers.next().value;
    if (promise)
      promise.then(this.onBuffer.bind(this));
    return this;
  };

  Connection.prototype.onBuffer = function(buf) {
    if (!this.msgassembler) {
      this.msg = Msg();
      this.msgassembler = this.msg.fromBuffers({strict: true});
      this.msgassembler.next();
    }
    let nextmsg;
    try {
      nextmsg = this.msgassembler.next(buf);
    } catch (error) {
      this.close();
      return Promise.reject(new Error('cannot parse message: ' + error.message));
    }
    if (nextmsg.done) {
      let promise = this.onMsg(this.msg);
      delete this.msgassembler;
      let remainderbuf = nextmsg.value;
      if (remainderbuf.length > 0) {
        return promise.then(function() {
          return this.onBuffer(remainderbuf);
        }.bind(this));
      }
      return promise;
    }
    return Promise.resolve();
  };

  Connection.prototype.onMsg = function(msg) {
    return Work(msg, 'isValid').buffer()
    .then(function(isValid) {
      return isValid ? this.autorespond(msg) : Promise.reject(new Error('invalid message'));
    }.bind(this))
    .then(function() {
      this.awaits.forEach(function(await) {
        await.resolve(msg);
      }.bind(this));
      this.awaits = [];
      return Promise.resolve();
    }.bind(this))
    .catch(function(error) {
      this.close();
      this.awaits.forEach(function(await) {
        await.reject(error);
      }.bind(this));
      this.awaits = [];
    }.bind(this));
  };

  /**
   * Returns an iterator of promises to received messages.
   */
  Connection.prototype.awaitMsgs = function*() {
    while (this.channel) {
      yield new Promise(function(resolve, reject) {
        this.awaits.push({
          resolve: resolve,
          reject: reject
        });
      }.bind(this));
    }
  };

  Connection.prototype.send = function(msg) {
    return this.channel.send(msg.toBuffer());
  };

  Connection.prototype.close = function() {
    return this.channel.close();
  };

  /**
   * Handle connection-level responses, particularly ping/pong and veracks. For
   * higher-level responses, see the server.
   */
  Connection.prototype.autorespond = function(msg) {
    let cmd = msg.getCmd();
    let response;
    switch (cmd) {
      case "ping":
          response = Msg().fromPongFromPing(msg);
        break;
      default:
        break;
    }
    if (response)
      return this.send(response);
    else
      return Promise.resolve();
  };

  return Connection;
}

inject = require('./injector')(inject, dependencies);
let Connection = inject();
module.exports = Connection;
