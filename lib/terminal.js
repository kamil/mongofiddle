var events = require('events'),
    pty = require('pty.js'),
    util = require('util'),
    _ = require('underscore'),
    utils = require('./utils'),
    exec = require('child_process').exec;


var Terminal = function(conf) {
  events.EventEmitter.call(this);
  var self = this;

  var max = {
    inactivity: 0.5,
    cpu: 90,
    ram: 10
  };

  var time_start = new Date().getTime(),
      time_last = time_start;

  var last_status = {},
      dout = 0,
      din = 0,
      alive = false,
      monitor_cycle,
      history_cycles = 5, // seconds
      history = { cpu: [], ram: [], };

  var proc = pty.spawn(conf.exec, conf.args, {
    name: 'xterm',
    cols: 80,
    cwd: process.env.HOME,
    env: process.env
  });

  proc.on('exit',  function() {
    alive = false;
  });
  proc.on('error', function() { console.log('TERM -> ERROR'); });
  proc.on('close', function() {
    alive = false;
  });

  proc.on('data', function(data) {
    if (!alive) {
      alive = true;
    }
    self.emit('data',data);
    dout += _.size(data);
    self.update();
  });

  this.write = function(data) {
    if (alive) {
      din += _.size(data);
      proc.write(data);
      self.update();
    }
  }

  this.getLastStatus = function() {
    return last_status;
  }

  this.update = function() {
    time_last = new Date().getTime();
  }

  this.updateStatus = function(stats) {
    exec('ps -o pcpu,rss,pid -p '+proc.pid,function(a,out,c) {
      try {
        out = out.match(/[0-9]*\.?[0-9]/g);
        last_status = {
          cpu: parseFloat(out[0]),
          ram: parseInt(out[1]),
          pid: parseInt(out[2]),
          dataOut: dout,
          dataIn: din,
          inactive: parseInt((new Date().getTime()-time_last) / 1000),
          live: parseInt((new Date().getTime()-time_start) / 1000)
        };

        _.each(["cpu","ram"], function(key){
          if ( history[key].push(last_status[key]) > history_cycles ) {
            history[key].shift();
          }
          last_status[key+"_avg"] = _.reduce(history[key], function(m, n){ return m+n; }) / history[key].length;
        });

        stats(last_status);
      } catch(err) {
        alive = false;
        stats(false)
      }
    });
  }

  this.kill = function(reason) {
    if (alive) {
      alive = false;
      self.emit('msg',"KILL: "+reason);
      exec('kill '+proc.pid);
      setTimeout(function() {
        self.updateStatus(function(status){
          if (status) {
            exec('kill -9 '+status["pid"]);
          } else {
            self.emit('killed');
            clearInterval(monitor_cycle);
          }
        });
      },5000); // try hard killing after 5 sec
    }
  }

  monitor_cycle = setInterval(function() {
    if (alive) {
      self.updateStatus(function(status) {
        if (status["cpu_avg"]   > max.cpu ) { self.kill('avg cpu over '+max.cpu+'%');      }
        if (status["ram_avg"]   > max.ram*1024 ) { self.kill('avg ram over '+max.ram+'MB');     }
        if (status["inactive"]  > max.inactivity*60 ) { self.kill('inactivity over '+max.inactivity+' min');  }
      });
    }
  },1000);

}
util.inherits(Terminal, events.EventEmitter);


exports.Terminal = Terminal; 
