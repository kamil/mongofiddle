var express = require('express')
  , io = require('socket.io')
  , http = require('http')
  , util = require('util')
  , events = require('events')
  , exec = require('child_process').exec
  , _ = require('underscore')
  , pty = require('pty.js');


var app = express();

config = {}

app.configure(function(){
  //app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use(require('connect-assets')());
});

app.configure('development', function(){
  app.use(express.errorHandler());
  
  config.port = 5000;
});

var server = http.createServer(app);
server.listen(config.port)
var io = io.listen(server);



var Terminal = function(conf) {
  events.EventEmitter.call(this);
  var self = this;
  var time_start = new Date().getTime(),
      time_last = time_start;

  var last_status = {},
      dout = 0,
      din = 0,
      alive = false,
      monitor_cycle;

  var proc = pty.spawn(conf.exec, conf.args, {
    name: 'xterm',
    cols: 80,
    cwd: process.env.HOME,
    env: process.env
  });

  proc.on('exit',  function() { console.log('TERM -> EXIT');  });
  proc.on('error', function() { console.log('TERM -> ERROR'); });
  proc.on('close', function() { console.log('TERM -> CLOSE'); });

  proc.on('data', function(data) {
    if (!alive) {
      alive = true;
      self.monitor();
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

  this.get_last_status = function() {
    return self.last_status;
  }

  this.update = function() {
    time_last = new Date().getTime();
  }

  this.status = function(stats) {
    exec('ps -o pcpu,rss,pid -p '+proc.pid,function(a,out,c) {
      try {
        out = out.match(/[0-9]*\.?[0-9]/g);
        self.last_status = {
          cpu: parseFloat(out[0]),
          ram: parseInt(out[1]),
          pid: parseInt(out[2]),
          dout: dout,
          din: din,
          ina: parseInt((new Date().getTime()-time_last) / 1000)
        };
        stats(self.last_status);
      } catch(err) {
        alive = false
      }
    });
  }

  this.kill = function() {
    exec('kill -p');
  }

  this.monitor = function() {
    monitor_cycle = setInterval(function() {
      if (!alive) {
        clearInterval(monitor_cycle)
      } else {
        self.status(function(o) {});
      }
    },1000);
  }

}
util.inherits(Terminal, events.EventEmitter);

var TerminalManager = function(conf) {
  events.EventEmitter.call(this);
  var self = this, connections = {};

  var last_status;


  this.get = function(socket) {
    return connections[socket.id]
  }

  this.request = function(socket) {
    var terminal = new Terminal({
      exec : 'mongo',
      args : []
    });

    terminal.on('data',function(data) {
      setTimeout(function() {
        socket.emit('data',data);
      },100);
    });

    connections[socket.id] = terminal;
  }

  this.write = function(socket,data) {
    self.get(socket).write(data);
  }

  this.send_update = function() {

    list = []
    _.each(connections, function(terminal,socket) {
      list.push(terminal.get_last_status());
    });

    new_status = {
      connections: Object.keys(connections).length,
      list: list
    }

    if (!_.isEqual(new_status,self.last_status)) {
      self.last_status = new_status
      conf.sockets.emit('status', self.last_status);
    }
  }

  setInterval(self.send_update,1000)

}
util.inherits(Terminal, events.EventEmitter);


var tm = new TerminalManager({ sockets: io.sockets });

io.on('connection', function(socket) {

  socket.on('request-console',function() {
    tm.request(socket);
  });

  socket.on('data', function(data) {
    tm.write(socket,data);
  });

  socket.on('disconnect', function() {
  });

});




app.get('/', function(req, res){
  res.render('console', { id: null, config: config });
});

app.get('/:id/shell', function(req,res) {
  res.render('console', { id: req.params.id, config: config });
});


http.createServer(app).listen(app.get('port'), function(){});
