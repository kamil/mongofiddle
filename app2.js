var express = require('express')
  , io = require('socket.io')
  , http = require('http')
  , util = require('util')
  , events = require('events')
  , exec = require('child_process').exec
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
    console.log('TERM '+data);
    self.emit('data',data);
    self.update();
  });

  this.write = function(data) {
    proc.write(data);
    self.update();
  }

  this.update = function() {
    time_last = new Date().getTime();
  }

  this.status = function(stats) {
    exec('ps -o pcpu,rss,pid -p '+proc.pid,function(a,out,c) {
      out = out.match(/[0-9]*\.?[0-9]/g);
      stats({
        cpu: parseFloat(out[0]),
        ram: parseInt(out[1]),
        pid: parseInt(out[2]),
        ina: parseInt((new Date().getTime()-time_last) / 1000)
      });
    });
  }

  this.monitor = function() {
    setInterval(function() {
      self.status(function(o) {
        console.log(o);
      });
    },1000);
  }

  this.monitor();

}
util.inherits(Terminal, events.EventEmitter);

var TerminalManager = function() {
  events.EventEmitter.call(this);
  var self = this, connections = {};

  this.get = function(socket) {
    return connections[socket.id]
  }

  this.request = function(socket) {
    var terminal = new Terminal({
      exec : 'mongo',
      args : []
    });

    terminal.on('data',function(data) {
      socket.emit('message',data);
    });

    connections[socket.id] = terminal;
  }

  this.write = function(socket,data) {
    self.get(socket).write(data);
  }

}
util.inherits(Terminal, events.EventEmitter);


var tm = new TerminalManager();

io.on('connection', function(socket) {

  socket.on('request-console',function() {
    tm.request(socket);
  });

  socket.on('message', function(data) {
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
