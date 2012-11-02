var express = require('express')
  , mongoose = require('mongoose')
  , io = require('socket.io')
  , spawn = require('child_process').spawn
  , exec = require('child_process').exec
  , http = require('http')
  , config = require('./config')
  , models = require('./models')
  , MongoConsole = require('./lib/mc');


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

app.configure('production', function() {

  config.port = 80;
  config.socket = 'http://mongofiddle.com/';
  config.db_url = 'mongodb://localhost/fiddle';
  config.max_mongos = 20;

  config.mongo_cmd = process.env.MCONSOLE || 'mongo'
  config.mongo_args = process.env.MARGS || ""

});

app.configure('development', function(){
  app.use(express.errorHandler());
  
  config.port = 5000;
  config.socket = 'http://localhost:'+config.port+'/';
  config.db_url = 'mongodb://localhost/fiddle';
  config.max_mongos = 5;

  config.mongo_cmd = 'mongo'
  config.mongo_args = ''

});

var server = http.createServer(app);
server.listen(config.port)
var io = io.listen(server);


mongoose.connect(config.db_url);

function makeid(size)
{
    var text = [];
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split('');

    for( var i=0; i < size; i++ ) 
      text.push(possible[Math.floor(Math.random() * 62)]);

    return text.join('');
}




var clientsProcs = {};
var clients_ids = {};


clients_con = {};
clients_ids = {};
clients_tutorial = {};

clients_count = 0;


function generate_db(values, callback, max_tries) {
  
  if (max_tries == undefined) {
    max_tries = 10;
  }

  if (max_tries <= 0) {
    console.log("FAILED TO GENERATE DB ID");
    return 0;
  }

  var db = new models.Db(values);
  db._id = makeid(5);

  db.save(function(error, item){
    if (error && error.code === 11000) {
      generate(values, callback,max_tries-1);
    } else {
      callback(db);
    }
  });

};

io.configure('development', function(){
  //io.set('log level', 1);
});




  function gc(socket) {
    return clients_con[socket.id];
  }


  function loginInConsole(entry,socket) {

    if (entry.db_host != "localhost") {
      params = [
          '--host', entry.db_host,
          '-u', entry.db_user,
          '-p', entry.db_pass,
          '--port', entry.db_port,
         entry.db_name
      ]
      mongo_args = config.mongo_args.split(' ').concat(params)
    } else {
      mongo_args = [entry.db_name]
    }

    var console = new MongoConsole({
      exec : config.mongo_cmd,
      args : mongo_args
    });

    console.on('output',function(data) {
      if (!gc(socket).aborted) {
         socket.emit('message',data);
      }
    });

    console.on('state',function(state,data) {
     socket.emit('change',state,data); 
    });

    return console;
  }



  io.on('connection', function(socket) {
    

    clients_con[socket.id] = false;
    
    clients_count++;


    socket.on('disconnect',function() {
      clients_count--;

      if (clients_con[socket.id]) {
        clients_con[socket.id].terminate();
      }

    });
    
    
    socket.on('request-console',function(console_id,version) {

      if (clients_count>=config.max_mongos+1) {
        socket.emit('change','terminated','Sorry too many clients connected');
        socket.disconnect();
        return;
      }



     if (console_id) {

       models.Db.findById(console_id,function(err,entry) {



        if (!entry) {

          socket.emit('change','terminated','DB do not exists');
          socket.emit('change','dbgone');

        } else {

          socket.emit('change','requesting','Requesting MongoDB '+version);
          clients_con[socket.id] = loginInConsole(entry,socket);

          clients_ids[socket.id] = entry._id

        }




       });
     
     
     
     
     } else {
      

        socket.emit('change','requesting','Creating MongoDB '+version);


     generate_db({},function(entry) {


        console.log('saveing');
    
        entry.db_name = "db_" + entry._id
        entry.db_host = "localhost"
        entry.db_port = 27017

        if (app.get('env') == 'production') {

          entry.db_host = "mdbhost1"
          entry.db_port = 9000 + Math.floor(Math.random()*2)
          entry.db_user = 'user'
          entry.db_pass = Math.random().toString(36).substring(7);

          exec("mongo --port "+entry.db_port+" -u "+process.env.ADMIN_USER+" -p "+process.env.ADMIN_PASS+" admin --eval \"db = db.getSiblingDB('"+entry.db_name+"'); db.addUser('"+entry.db_user+"','"+entry.db_pass+"');\"",
            function (error, stdout, stderr) {
              console.log('createdatabase - stdout: ' + stdout);
              console.log('createdatabase - stderr: ' + stderr);
              if (error !== null) {
                console.log('createdatabase - exec error: ' + error);
              }
              entry.save(function() {
                socket.emit('request-console',entry._id);
                clients_con[socket.id] = loginInConsole(entry,socket);
                clients_ids[socket.id] = entry._id;
              });
            }
          );

        } else {
          entry.save(function() {
            socket.emit('request-console',entry._id);
            clients_con[socket.id] = loginInConsole(entry,socket);
            clients_ids[socket.id] = entry._id;
          });
        }

      });


    }

    
   });

   socket.on('message', function(data) {

    


     if (clients_con[socket.id]) {

       if (clients_ids[socket.id]) {
        models.Db.findById(clients_ids[socket.id],function(err,entry) {
         if (entry) {
          entry.last_command = Date.now();
          entry.commands.push({
            d: Date.now(),
            i: socket.handshake.address.address,
            c: data
          });
          entry.save();
         }
       });
       }

      if ( (data == 'tutorial') || (data == 'next') ) {
        
        if (!clients_tutorial[socket.id]) {
          clients_tutorial[socket.id] = 0;
        }

        clients_tutorial[socket.id] += 1;

        if (clients_tutorial[socket.id] > config.manual.length) {
          clients_tutorial[socket.id] = 0;
        }

        socket.emit('manual',config.manual[ clients_tutorial[socket.id] ]);
      
      } else {

       if (data.indexOf("\n") != -1) {
         clients_con[socket.id].multi_command(data);
       } else {
         clients_con[socket.id].command(data);
       };

      }
      
      //socket.emit('message',"> "+data);
     }
   });

 });





app.get('/', function(req, res){
  res.render('console', { id: null, config: config });
});

app.get('/:id/shell', function(req,res) {
  res.render('console', { id: req.params.id, config: config });
});




http.createServer(app).listen(app.get('port'), function(){});
