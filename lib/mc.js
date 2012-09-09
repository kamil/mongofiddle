var pty = require('pty.js');
var events = require('events');
var util = require('util');

var MongoConsole = function(conf) {
  events.EventEmitter.call(this);

  var self = this;

  self.last_command = [];
  self.timeout_command = false;
  self.timeout_console = false;
  self.state = false;
  self.aborted = false;
  self.silent = false;

  var pty_proc = pty.spawn(conf.exec, conf.args, {
    name: 'xterm',
    cols: 150,
    cwd: process.env.HOME,
    env: process.env
  });

  pty_proc.on('exit',function() {
    self.set_state('terminated');
  });

  pty_proc.on('error',function() {
    self.set_state('terminated','error');
  });

  pty_proc.on('close',function() {
    self.set_state('terminated','close');
  });

  pty_proc.on('data',function(data) {

    console.log("DATA>"+data);

    if (self.last_command.indexOf(data) != -1) {
      self.last_command.splice( self.last_command.indexOf(data), 1 );
      return; //data =  "\n\r"; // add return
    }

    if (data == "\03") {
      return;
    }

    if (data == "\r\n") {
      return;
    }

    if (data.substr(0,2) == "\r\n") {
      data = data.substr(2,data.length-2)
    }

    if (data.toString().trim() == "") {
      //return;
    }

    if (data.toString().trim() == "do you want to kill the current op(s) on the server? (y/n):") {
      pty_proc.write("y\r");
    }

    if (data == "... ") {
      self.set_state('ready','... ');
      clearTimeout(self.timeout_command);
    } else if (encodeURIComponent(data) == "%3E%20") {
      self.set_state('ready');
      //data = "\r"
      //self.emit('output',data);
      clearTimeout(self.timeout_command);
    } else {
      if (self.silent) {} else {
        self.emit('output',data);
      }
    }

  });

  this.refresh_timeout = function() {
    clearTimeout(self.timeout_console);
    self.timeout_console = setTimeout(function() {
      if (self.state != 'terminated') {
        self.set_state('terminated',"\nTERMINATED - due 10 min inactivity");
        self.terminate();
      }
    },1000 * 60 * 10);
  }

  this.set_state = function(state,data) {
    this.emit('state', state, data);
    this.state = state;
  }

  this.multi_command = function(data) {
    var data2 = ""
    
    self.silent = true;

    data.split('\n').forEach(function(line) {
      pty_proc.write(line+"\r");
    });

    pty_proc.write("\r\n");
    
    self.silent = false;
        

    self.set_state('busy');

    self.refresh_timeout();

  }

  this.command = function(data) {

    self.last_command.push(data); 

    pty_proc.write(data + "\r");
    self.set_state('busy');

    self.timeout_command = setTimeout(function() {
      if (self.state != 'terminated') {
        self.set_state('terminated',"\nTERMINATED - due 5 sec command timeout");
        self.terminate();
      }
    },1000 * 5);

    self.refresh_timeout();

  }



  
  this.terminate = function() {
    pty_proc.write("\03");
    pty_proc.write("\03");
    pty_proc.write("\03");

    self.aborted = true;

    setTimeout(function() {
      pty_proc.destroy();
    },1000 * 10);
  }



  this.refresh_timeout();

};
util.inherits(MongoConsole, events.EventEmitter);

//a = new MongoConsole({ exec: 'mongo', args: [] });
//a.on('output',function(data) { console.log('1>',data) })
//
//
//b = new MongoConsole({ exec: 'mongo', args: ['test2'] });
//b.on('output',function(data) { console.log('2>',data) })
//
//
//c = new MongoConsole({ exec: 'mongo', args: ['test3'] });
//c.on('output',function(data) { console.log('x>',data) })
//
//setTimeout(function() {
//  b.command('ls')
//},1000);
//
//
//setTimeout(function() {
//  a.command('ls')
//},2000);
//
//setTimeout(function() {
//  c.command("while(true) {}");
//},2000);
//
//setTimeout(function() {
//  a.command("db.eval('while(true) {};')");
//},2000);
//
//


module.exports = MongoConsole;
