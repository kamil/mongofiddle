
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

  resizeElements = function() {
    $("#wrap").height($(window).height()-170);
    $("#manual").height($(window).height()-160);
  }

  resizeElements();

  // terminal size
  // 714px -> 102 ch-w
  // wide_ch = 102*wide_px /714
  // 
  // 336px -> 24 ch-w
  // high_ch = 24*high_px / 336


  function terminalSize(pwidth, pheight) {

    var width = 102*pwidth/714, height = 24*pheight/336;

    if (width<102) {
      width = 102;
    }
    if (height<24) {
      height = 24;
    }

    return { width: parseInt(width), height: parseInt(height) }
  }


  var initTermSize = terminalSize( $('#wrap').width(), $('#wrap').height() )

  console.log(initTermSize);


  term = new Terminal( initTermSize.width, initTermSize.height )
  socket = new io.connect(ConsoleConfig.socket);

  socket.on('connect', function() {
    console.log('connected');

    term.on('data', function(data) {
      socket.emit('data', data);
    });

    socket.on('data', function(data) {
      setTimeout(function() { term.write(data); },1);
    });
  });

  socket.on('disconnect', function () {
    console.log('disconnect');
    term.hideCursor();
  });

  term.open('terminal')

  socket.emit('request-console', ConsoleConfig.console_id );

  socket.on('request-console',function(c_id) {
    window.history.replaceState({console_id:c_id}, null, "/" + c_id + "/shell");
    console_id = c_id;
  });

  socket.on('status',function(status) {
    $('#server-status').html(JSON.stringify(status,undefined, 2));
  });

  socket.on('msg',function(msg) {
    term.write(msg);
  });

  
  $(window).resize(function() {
    var termSize = terminalSize( $("#wrap").width(), $("#wrap").height() );
    term.resize(termSize.width,termSize.height);
    resizeElements();
    console.log('resized', termSize);
  });

})
