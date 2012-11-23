var events = require('events'),
    util = require('util'),
    term = require('./terminal'),
    _ = require('underscore');





var TerminalManager = function(conf) {
  events.EventEmitter.call(this);
  var self = this, connections = {}, entries = {};

  var conf = _.defaults(conf,{
    maxTotalRam: 10*1024,
    maxPerIP: 3,
    ramPerTerminal: 7*1024
  });

  var last_status = {
    connections: 0,
    list: [],
    total: {
      ram: 0,
      dataOut: 0,
      dataIn: 0
    }
  };

  this.get = function(socket) {
    return connections[socket.id];
  }

  this.getEntry = function(socket) {
    return entries[socket.id];
  }

  this.request = function(socket,entry) {

    // Check if fits in max ram
    if ( (last_status.total.ram + conf.ramPerTerminal) > conf.maxTotalRam ) {
      socket.emit('msg','Sorry, max available ram for terminals exceeded.');
      return;
    }

    var terminal = new term.Terminal({
      exec : 'mongo',
      args : [entry.mongo["name"]]
    });

    terminal.on('data',function(data) {
      setTimeout(function() {
        socket.emit('data',data);
      },1);
    });

    terminal.on('msg',function(msg) {
      socket.emit('msg',msg);
    });

    terminal.on('killed',function() {
      delete connections[socket.id];
      delete entries[socket.id];
    });

    entries[socket.id] = entry;
    connections[socket.id] = terminal;
  }

  this.write = function(socket,data) {
    var terminal = self.get(socket);
    if (terminal) {
      terminal.write(data);
    }
  }

  this.send_update = function() {

    var new_status = {
      connections: Object.keys(connections).length,
      total: {
        ram: 0,
        dataOut: 0,
        dataIn: 0
      }
    }

    var list = []
    _.each(connections, function(terminal,socket) {
      var terminalStatus = terminal.getLastStatus();
      
      new_status.total.ram      += terminalStatus.ram;
      new_status.total.dataIn   += terminalStatus.dataIn;
      new_status.total.dataOut  += terminalStatus.dataOut;
      
      list.push(terminalStatus);
    });

    new_status.list = list;


    if (!_.isEqual(new_status,self.last_status)) {
      self.last_status = new_status
      conf.sockets.volatile.emit('status', self.last_status);
    }
  }

  setInterval(self.send_update,1000)

}
util.inherits(TerminalManager, events.EventEmitter);


exports.TerminalManager = TerminalManager;
