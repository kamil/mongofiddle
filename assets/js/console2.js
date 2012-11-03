//= require lib/jquery-1.8.0.js
//= require lib/bootstrap.js
//= require lib/socket.io.js


 function loadContent(name) {
    var old_tab = $('#manual').data('id');
    if (old_tab) {
      $("#manual div[data-id="+old_tab+"]").fadeOut(100, function() {
        $("#manual div[data-id="+name+"]").fadeIn(150);
      });
    } else {
      $("#manual div[data-id="+name+"]").show();
    }
    $('#manual').data('id',name);


  }

var term, socket;

$(function(){
  $('#manual div').hide();
  $('#manual').show();
  loadContent('start');

   term = new Terminal(80, 24)
   socket = new io.connect(ConsoleConfig.socket);

        socket.on('connect', function() {

          console.log('connected');

          term.on('data', function(data) {
            socket.emit('message', data);
          });

          term.on('title', function(title) {
            document.title = title;
          });

          socket.on('message', function(data) {
            console.log(' < data '+data);
            term.write(data);
          });
        });

        term.open('terminal')

  socket.emit('request-console', ConsoleConfig.console_id );


})
