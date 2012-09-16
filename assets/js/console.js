//= require lib/jquery-1.8.0.js
//= require lib/bootstrap.js
//= require lib/socket.io.js
//= require lib/jqconsole.coffee




function ltrim (str, charlist) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +      input by: Erkekjetter
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // *     example 1: ltrim('    Kevin van Zonneveld    ');
    // *     returns 1: 'Kevin van Zonneveld    '
    charlist = !charlist ? ' \\s\u00A0' : (charlist + '').replace(/([\[\]\(\)\.\?\/\*\{\}\+\$\^\:])/g, '$1');
    var re = new RegExp('^[' + charlist + ']+', 'g');
    return (str + '').replace(re, '');
}



  var MC = function(conf) {
    var conf = conf;
    var socket = new io.connect(conf.socket);
    var self = this;
    var state = '';
    
    var output_elem = false;
    var create_output = true;
    
    var command_elem = false;
    var create_command = true;

    var term = false;

    var active = true;

    jqconsole = false;


    var console_id = conf.id;

    
    socket.on('disconnect',function() {
      self.add_system("Server disconnected");
      self.terminate();
    });

    socket.emit('request-console',conf.id,'2.2.0');


    socket.on('request-console',function(c_id) {
      window.history.replaceState({console_id:c_id}, null, "/" + c_id + "/shell");
      console_id = c_id;
    });
    
    socket.on('message',function(data) {
      self.add_output(data);
    });
    
    socket.on('system',function(data) {
      self.add_system(data);
    });

    socket.on('manual',function(data) {
      loadContent(data);
      console.log(data);
    });
    
    socket.on('change',function(state,data) {
      console.info(state);
      state = state;

      if (state == 'ready') {
        jqconsole.Enable();
        //jqconsole.Focus();

        if (data) {

          jqconsole.prompt_label_main = '... '
          jqconsole.$prompt_label.html('... ')
          //term.prompt('...');

        } else {

          jqconsole.prompt_label_main = '> '
          jqconsole.$prompt_label.html('> ')
          self.focus();
          //jqconsole.prompt_label_main = '> '

          //term.prompt('> ');
        }
      }

      if (state == 'busy') {
        jqconsole.Disable()
        //term.prompt('');
      }

      if (state == 'terminated') {
        //term.prompt('');
        self.add_system(data);
        jqconsole.Disable();
      }

      if (state == 'requesting') {
        self.add_system(data);
      }



// sc(".output");

    });

    this.terminate = function() {
      active = false
      jqconsole.Disable();
      socket.disconnect();
    }

    this.get_term = function() { return jqconsole; }
    this.get_socket = function() { return socket; }


    this.add_system = function(str) {
      if (active) {
        jqconsole.Write(str+"\n", 'jqconsole-output-sys');
      }
    }

    this.add_output = function(str) {
      if (active) {
        jqconsole.Write(str, 'jqconsole-output');
      }
    }


    this.focus = function() {
      jqconsole.Focus();
    }




    var jqconsole = $(conf.el).jqconsole('', '> ',0,false);
    
    var startPrompt = function () {
          // Start the prompt with history enabled.
          jqconsole.Prompt(true, function (input) {

            if (input.trim() != "") {
              input.split("\n").forEach(function(line,index) {
                setTimeout(function() { socket.emit('message', line); },50*index)
              });
            }

            console.log('input', input);

            startPrompt();
            jqconsole.Focus();
          });
        };
        startPrompt();



    jqconsole.RegisterMatching('{', '}', 'brackets');
    jqconsole.RegisterMatching('(', ')', 'brackets');
    jqconsole.RegisterMatching('[', ']', 'brackets');


    jqconsole.RegisterShortcut('E', function() {
      jqconsole.MoveToEnd();
    });

    jqconsole.RegisterShortcut('A', function() {
      jqconsole.MoveToStart();
    });

    jqconsole.RegisterShortcut('K', function() {
      jqconsole.SetPromptText('');
    });


    this.pulse = function () {
      var s = 1;
      
      if (jqconsole.$prompt_cursor.css('opacity') == 1) {
        s = 0.1
      }

      jqconsole.$prompt_cursor.animate({opacity:s},400,function() {
        self.pulse();
      })
    }
    
    this.pulse();

    //$('.mongo-version').click(function() {
    //  var version = $(this).data('mongo');
    //  socket.emit('request-console',conf.id,version);
    //  $('.version-sel').hide();
    //  $('.version').removeClass('version-active');
    //});





  }

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


  $(function(){

    mc = new MC({
      el: '#console',
      socket: ConsoleConfig.socket,
      id: ConsoleConfig.console_id
    });
    
    $('#manual div').hide();
    $('#manual').show();

    loadContent('start');

    $("#console").height($(window).height()-170);
      $("#manual").height($(window).height()-250);

      $(window).resize(function() {
        $("#console").height($(window).height()-170);
        $("#manual").height($(window).height()-250);

        mc.get_term().Focus();
      });




 //   var mc2 = new MC({
 //     el: '#console2',
 //     socket: 'http://localhost:3000/',
 //     id: ConsoleConfig.console_id
 //   });

  });
