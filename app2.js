/* MongoFiddle */

var fs = require('fs');

packageInfo = JSON.parse(fs.readFileSync('./package.json','utf-8'));
console.log("MongoFiddle v",packageInfo.version,process.env.NODE_ENV || "development");

var express = require('express')
  , io = require('socket.io')
  , http = require('http')
  , util = require('util')
  , events = require('events')
  , _ = require('underscore')
  , colors = require('colors')
  , exec = require('child_process').exec
  , term = require('./lib/terminal')
  , TerminalManager = require('./lib/terminal_manager').TerminalManager
  , utils = require('./lib/utils');



var app = express();

config = {
  // default values
  version: packageInfo.version
}

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
  config.port = process.env.PORT || 5000;
});

app.configure('production', function(){
  config.port = process.env.PORT || 80;
});

serversInfo = [];

function reloadServersConfig() {
  serversInfo = JSON.parse(fs.readFileSync('./servers.json','utf-8'));
  return serversInfo;
}

reloadServersConfig();

fs.watchFile('./servers.json', function (curr, prev) {
  if (curr.mtime != prev.mtime) {
    console.log('Reloading server file');
    reloadServersConfig();
  }
});



var server = http.createServer(app);
server.listen(config.port)
var io = io.listen(server);
io.disable('log');



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

      createDb(db,function(err,db) {
        db.save(function(err, item) {
          callback(err,db);
        });
      });

    } // err
  });

};

// createDb({ mongo: { name: "db_XYZ" } })
function createDb(db,callback) {
  var server = serversInfo.servers[_.random(0,serversInfo.length)];

  db.mongo.host = server.host;
  db.mongo.port = server.port;

  if (server.pass) {

    db.mongo.user = 'user'
    db.mongo.pass = Math.random().toString(36).substring(7);

    var cmdMongo = [ "mongo","--port", server.port, "-u",server.user, "-p",server.pass,
      "admin --eval \"db = db.getSiblingDB('"+db.mongo.name+"'); db.addUser('"+db.mongo.user+"','"+db.mongo.pass+"');\""].join(' ');

    exec(cmdMongo, function (error, stdout, stderr) {
      //console.log('createdatabase - stdout: ' + stdout);
      //console.log('createdatabase - stderr: ' + stderr);
      //if (error !== null) {
      //  console.log('createdatabase - exec error: ' + error);
      //}
      
      if (stdout.indexOf('"user" : "user"') > 0) {
        callback(null,db);
      } else {
        console.log('createDB error',stdout)
        callback({msg:stdout},null);
      }

    });

  } else {
    callback(null,db);
  }

}





var tm = new TerminalManager({
  sockets: io.sockets,
  mongoCmd: serversInfo.cmd.exec,
  mongoArgs: serversInfo.cmd.args
});

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


      createNewDB({},function(err,entry) {
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
