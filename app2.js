var express = require('express')
  , io = require('socket.io')
  , http = require('http')
  , util = require('util')
  , events = require('events')
  , exec = require('child_process').exec
  , _ = require('underscore')
  , colors = require('colors')
  , utils = require('./lib/utils')
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


io.configure('development', function () {
  io.disable('log');
});


c = {
  '2.2.1' : {
    name: 'Production Release',
    mongo: 'mongo',
    mongod: [
      { host: 'localhost', port: 27017 },
      { host: 'localhost', port: 27018, user: 'admin', pass: '12312312' }
    ]
  },
  '2.3.0' : {
    name: 'Development Release'
  }
}


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
    console.log('TERM -> EXIT');
    alive = false;
  });
  proc.on('error', function() { console.log('TERM -> ERROR'); });
  proc.on('close', function() {
    console.log('TERM -> CLOSE');
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

  this.status = function() {
    _.each(history, function (value,key) {
      
    });
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

var TerminalManager = function(conf) {
  events.EventEmitter.call(this);
  var self = this, connections = {}, entries = {};

  var last_status;


  this.get = function(socket) {
    return connections[socket.id];
  }

  this.getEntry = function(socket) {
    return entries[socket.id];
  }

  this.request = function(socket,entry) {

    var terminal = new Terminal({
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
    self.get(socket).write(data);
  }

  this.send_update = function() {

    list = []
    _.each(connections, function(terminal,socket) {
      list.push(terminal.getLastStatus());
    });

    new_status = {
      connections: Object.keys(connections).length,
      list: list
    }

    if (!_.isEqual(new_status,self.last_status)) {
      self.last_status = new_status
      conf.sockets.volatile.emit('status', self.last_status);
    }
  }

  setInterval(self.send_update,1000)

}
util.inherits(Terminal, events.EventEmitter);




var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , Mixed = mongoose.Schema.Types.Mixed
  , ObjectId = Schema.ObjectId;

var dbSchema = new Schema({
  _id     : String,
  mongo   : Mixed,
  updated : Date,
  created : { type: Date, default: Date.now }
}, { _id: false, autoIndex: false });


db = mongoose.createConnection('localhost', 'mongofiddle')

var Db = db.model('dbs', dbSchema); 




function createNewDB(attrs, callback, max_tries) {
  
  if (max_tries == undefined) {
    max_tries = 10;
  }

  if (max_tries <= 0) {
    callback({ text: "FAILED TO GENERATE DB ID" }, null);
    return
  }

  var db = new Db();
  db._id = utils.makeRandomId(6);

  db.save(function(err, item){
    if (err && err.code === 11000) {
      createNewDB(attrs, callback, max_tries-1);
    } else {

      db.mongo = _.extend({
        name: "db_" + item._id
      },attrs);

      db.save(function(err, item) {
        callback(err,db);
      });

    } // err
  });

};

// createDb('2.2.0',{ name: user: pass: })
function createDb(version,db) {
}




var tm = new TerminalManager({ sockets: io.sockets });

io.on('connection', function(socket) {

  socket.on('request-console',function(id,version) {


    if (id) {
      console.log('searching for id');
      Db.findById(id, function(err,entry) {
        if (!entry) {
          // TODO: INFORM USER ABOUT NON EXISTING ID
          socket.emit('msg','DB not found');
        } else {
          socket.emit('msg','Requesting database...'.bold.grey+"\n\r");
          tm.request(socket,entry);
        }
      });
    } else {
      // CREATE NEW DB

      socket.emit('msg','Creating new MongoDB database for you...'.bold.grey+"\n\r");


      createNewDB({
          host: 'localhost',
          port: 27017
        },function(err,entry) {
          socket.emit('request-console',entry._id);
          tm.request(socket,entry);
      });


    }


  });

  socket.on('data', function(data) {
    tm.write(socket,data);
  });

  socket.on('disconnect', function() {
  });

});




app.get('/', function(req, res) {
  res.render('console', { id: null, config: config });
});

app.get('/:id/shell', function(req,res) {
  res.render('console', { id: req.params.id, config: config });
});


http.createServer(app).listen(app.get('port'), function(){});
