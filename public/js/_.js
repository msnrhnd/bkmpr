$(document).ready(function () {
  var socket = io.connect(location.origin);
  var activeCovers = {};
  var thisRoomId;
  var par = getQueryString();
  var paper = Raphael('main-panel');
  paper.setViewBox(0, 0, $(window).width(), $(window).height(), true);
  paper.setSize('100%', '100%');
  var COORD = {x: 256, y: 256};
  var WIDTH = paper._viewBox[2];
  var HEIGHT = paper._viewBox[3];
  var UNIT = Math.sqrt(WIDTH * HEIGHT);
  var VERT = paper.path('M' + WIDTH / 2 + ' ' + UNIT / 32 + 'L' + WIDTH / 2 + ' ' + (HEIGHT - UNIT / 32)).attr({
    'arrow-end': 'block-wide-wide',
    'arrow-start': 'block-wide-wide',
    'stroke-width': 2,
    opacity: 0
  });
  var HORZ = paper.path('M' + UNIT / 32 + ' ' + HEIGHT / 2 + 'L' + (WIDTH - UNIT / 32) + ' ' + HEIGHT / 2).attr({
    'arrow-end': 'block-wide-wide',
    'arrow-start': 'block-wide-wide',
    'stroke-width': 2,
    opacity: 0
  });
  var DURATION = 200;
  var pw = 1;
  var MAX_COVERS = 48;

  function getQueryString() {
    if (location.search.length > 1) {
      var query = location.search.substring(1);
      var pars = query.split('&');
      var result = {};
      for (var i = 0; i < pars.length; i++) {
        var elem = pars[i].split('=');
        var parKey = decodeURIComponent(elem[0]);
        var parVal = decodeURIComponent(elem[1]);
        result[parKey] = parVal;
      }
      return result;
    }
    else {
      return false;
    }
  }

  function modalPanel() {
    var w = $('#modal-panel').outerWidth();
    var h = $('#modal-panel').outerHeight();
    $('#modal-panel').css({
      left: $(window).width() / 2 - w / 2,
      top: $(window).height() / 2 - h / 2
    });
  }
  modalPanel();

  function checkCovers() {
    var images = $('image').length;
    if (images >= MAX_COVERS) {
      $('#plus').attr('disabled', true);
    } else {
      $('#plus').attr('disabled', false);
    }
  }
  checkCovers();
  
  $('#control-panel').hide();
  $('#sign-in').prop('disabled', true);
  $('#load-send').prop('disabled', true);
  $('#plus').prop('disabled', true);

  $(document).on('click', '#load-send', function() {
    socket.emit('load', $('#load-id').val());
    $('#modal-panel').fadeOut(DURATION);
    $('#load-id').val('');
  });
  
  function signIn(roomId) {
    thisRoomId = roomId;
    $('#this-room').text(thisRoomId).fadeIn(DURATION);
    if (!$('#axis .' + roomId).length) {
      $('#axis').append($('<div/>').addClass(roomId));
      for (var dir of['e', 'w', 's', 'n']) {
        $('#axis .' + roomId).append($('<input/>').attr({
          type: 'text',
          maxlength: '16'
        }).addClass(dir));
      }
      cssTextBoxes(pw);
    }
    $('#control-panel').fadeIn(DURATION);
    $('#axis .' + thisRoomId + ' input').fadeIn(DURATION);
    VERT.animate({
      opacity: 1
    }, DURATION);
    HORZ.animate({
      opacity: 1
    }, DURATION);
    $('#modal-panel').fadeOut(DURATION);
    checkTextBoxes($('#axis .' + thisRoomId + ' input'));
    socket.emit('signIn', thisRoomId);
    history.pushState('', '', '?room=' + thisRoomId);
  }

  function signOut(thisRoomId) {
    socket.emit('signOut', thisRoomId);
    $('#control-panel').fadeOut(DURATION);
    $('#this-room').fadeOut(DURATION);
    $('#axis .' + thisRoomId + ' input').fadeOut(DURATION);
    $.each(activeCovers, function (k, v) {
      activeCovers[k].remove();
      delete activeCovers[k];
    });
    VERT.animate({
      opacity: 0
    }, DURATION);
    HORZ.animate({
      opacity: 0
    }, DURATION);
    $('#modal-panel').fadeIn(DURATION);
    $('#modal-panel #init-panel').fadeIn(DURATION, function() {
      $(this).siblings().hide();
    });
    $('.close').hide();
    thisRoomId = undefined;
    history.pushState('', '', '/');
  }

  if (par.hasOwnProperty('room')) {
    signIn(par.room);
    if (par.hasOwnProperty('load')) {
      socket.emit('load', par.load);
    }
  }
  else if (par.hasOwnProperty('load')) {
    socket.emit('load', par.load);
  }

  $(document).on('keyup', '#room, #load-id', function (e) {
    var escaped = $(e.currentTarget).val().replace(/[^a-zA-Z0-9_\-]/, '');
    $(e.currentTarget).val(escaped);
    $(e.currentTarget).next('button').prop('disabled', !Boolean(escaped));
  });

  $(document).on('keyup', '#search', function (e) {
    var escaped = $(e.currentTarget).val().replace(/[$="' (){}\.,\[\]]/, '');
    $(e.currentTarget).val(escaped);
    $(e.currentTarget).next('button').prop('disabled', !Boolean(escaped));
    checkCovers();
  });

  $('#sign-in').click(function () {
    if ($('#room').val()) {
      signIn($('#room').val());
    }
  });

  $(document).on('click', '.enter-room', function (e) {
    signIn($(e.currentTarget).text());
  });

  (function () {
    var start, end;
    $(document).on('mousedown', '.remove-room', function (e) {
      start = new Date();
    });
    $(document).on('mouseup', '.remove-room', function (e) {
      end = new Date();
      if (end - start > 1500) {
        socket.emit('removeRoom', $(e.currentTarget).siblings('.enter-room').text());
      }
    });
  })();

  $('#sign-out').click(function () {
    signOut(thisRoomId);
  });

  socket.on('vacancy', function (boolean) {
    $('#room').prop('disabled', !boolean);
  });

  socket.on('appendRoom', function (roomId) {
    console.log('appendRoom', roomId);
    var existingRoom = $.map($('.enter-room'), function (elem) {
      return $(elem).text();
    });
    if (existingRoom.indexOf(roomId) < 0) {
      var $btnGroup = $('<div/>').addClass('btn-group ' + roomId).append($('<label/>').addClass('btn btn-default btn-sm enter-room').html(roomId)).append($('<label/>').addClass('btn btn-default btn-sm remove-room').html('&times;')).after(' ');
    $('#existing-rooms').append($btnGroup);
    }
  });

  socket.on('removeRoom', function (roomId) {
    console.log('removeRoom', roomId);
    $('.btn-group.' + roomId).hide(DURATION, function () {
      this.remove();
    });
  });

  function cssTextBoxes(pw) {
    $('#axis input').css({
      width: UNIT * pw / 4,
      fontSize: UNIT * pw / 48
    });
    $('footer').css({
      position: 'absolute',
      top: (HEIGHT - UNIT / 32) * pw,
      fontSize: UNIT / 64 * pw
    });
    $('#this-room').css({
      fontSize: UNIT / 64 * pw
    });
    $('#axis .n').css({
      top: 0,
      left: (WIDTH / 2 - UNIT / 8) * pw
    });
    $('#axis .s').css({
      top: (HEIGHT - UNIT / 32) * pw,
      left: (WIDTH / 2 - UNIT / 8) * pw
    });
    $('#axis .e').css({
      top: HEIGHT * pw / 2,
      left: (WIDTH - UNIT / 4) * pw,
      textAlign: 'right'
    });
    $('#axis .w').css({
      top: HEIGHT * pw / 2,
      left: 0
    });
  }

  $(window).resize(function () {
    pw = $(window).width() / WIDTH;
    modalPanel();
    cssTextBoxes(pw);
  });

  function checkTextBoxes($input) {
    if ($input.val()) {
      $input.css('border', 'none');
    }
    else {
      $input.css('border-bottom', '1px solid black');
    }
  }

  $(document).on('keyup', '#axis input', function (e) {
    var escaped = $(e.currentTarget).val().replace(/[$="' (){}\.,\[\]]/, '');
    $(e.currentTarget).val(escaped);
    checkTextBoxes($(e.currentTarget));
  }).on('change', '#axis input', function (e) {
    socket.emit('axis', thisRoomId, e.currentTarget.className.split(' ')[0], $(e.currentTarget).val());
    checkTextBoxes($(e.currentTarget));
  });

  Raphael.fn.setCover = function (src, title, isbn, coord, link, handle) {
    function trimTitle16(str) {
      var trimmed = str;
      if (trimmed.length > 16) {
        trimmed = str.slice(0, 15) + '…';
      }
      if (trimmed.length > 8) {
        var mid = Math.round(trimmed.length / 2);
        trimmed = trimmed.slice(0, mid) + '\n' + trimmed.slice(mid, trimmed.length);
      }
      return trimmed;
    }
    var me = this;
    var cover = me.set();
    cover.isbn = isbn;
    cover.coord = coord;
    cover.link = link;
    var img = new Image();
    img.src = src;
    img.onload = function () {
      var w = UNIT / 8;
      var h = w * img.height / img.width;
      var margin = UNIT / 96;
      cover.push(
      me.rect(-w / 2 - margin / 2, -h / 2 - margin / 2, w + margin, h + margin).attr({
        'stroke': 'black',
        'fill': 'white',
        'stroke-width': 1
      }), me.image(src, -w / 2, -h / 2, w, h), me.text(0, h / 2 + margin * 4, trimTitle16(title)).attr({
        'font-size': margin * 2
      }));
      cover.attr({
        'cursor': 'pointer'
      });
      if (handle) {
        cover.setMouseHandlers();
      } else {
        cover.setLink();
      }
      cover.transform('t' + inv(coord).x + ',' + inv(coord).y);
    }
    return cover;
  }

  $('#save').click(function () {
    socket.emit('save', thisRoomId);
  });

  $('#load').click(function () {
    $('#modal-panel').fadeIn(DURATION);
    $('#init-panel, #save-panel').hide();
    $('#load-panel').fadeIn(DURATION);
    $('.close').show();
  });
  
  socket.on('save', function (id) {
    $('#modal-panel').fadeIn(DURATION);
    $('#init-panel, #load-panel').hide();
    $('#save-panel').fadeIn(DURATION, function() {
      $('.close').show();
      $('#saved-url').text(location.host + '/?load=' + id);
    });
  });

  $(document).on('click', '.close', function(e) {
    $('#modal-panel').fadeOut(DURATION);
  });
  
  socket.on('load', function (id, state) {
    var covers = state.covers;
    var axis = state.axis;
    if (!thisRoomId) {
      $('#this-room').text(id).fadeIn(DURATION);
      $('').fadeIn(DURATION);
      if (!$('#axis .' + id).length) {
        $('#axis').append($('<div/>').addClass(id));
        for (var dir of ['e', 'w', 's', 'n']) {
          $('#axis .' + id).append($('<input/>').attr({
            type: 'text',
            maxlength: '16'
          }).addClass(dir).prop('disabled', true));
          if (axis.hasOwnProperty(dir)) {
            $('#axis .' + id + ' .' + dir).val(axis[dir]);
          }
          checkTextBoxes($('#axis .' + id + ' .' + dir));
        }
      }
      cssTextBoxes(pw);
      $('#axis .' + id + ' input').fadeIn(DURATION);
      VERT.animate({
        opacity: 1
      }, DURATION);
      HORZ.animate({
        opacity: 1
      }, DURATION);
      $('#modal-panel').fadeOut(DURATION);
    }
    $.each(covers, function (isbn) {
      socket.emit('getBook', thisRoomId, isbn);
    });
  });

  $('#plus').click(function () {
    var val = $('#search').val().replace(/-/, '');
    if (activeCovers.hasOwnProperty(val)) {
      console.log('duplicated');
      message('Duplicated');
    }
    else {
      socket.emit('getBook', thisRoomId, val);
    }
    $(this).prop('disabled', true);
    $('#search').val('');
  });

  function message(viewbox, mes, type) {
    var $mes = $('<message/>').addClass(type).css({
      top: viewbox[2] / 2 - 20,
      left: viewbox[3] / 2 - 60
    }).text(mes);
    $('#main-panel').prepend($mes);
    $mes.fadeOut('slow', function () {
      $(this).remove();
    });
    return false;
  }

  socket.on('signIn', function (activeStates_roomId) {
    var isbns = Object.keys(activeStates_roomId.covers);
    for (var isbn of isbns) {
      socket.emit('getBook', thisRoomId, isbn);
    }
    for (var dir of['e', 'w', 's', 'n']) {
      if (activeStates_roomId.axis.hasOwnProperty(dir)) {
        $('#axis .' + thisRoomId + ' .' + dir).val(activeStates_roomId.axis[dir]);
      }
      checkTextBoxes($('#axis .' + thisRoomId + ' .' + dir));
    }
  });

  socket.on('axis', function (roomId, dir, val) {
    if (roomId == thisRoomId) {
      $('#axis .' + thisRoomId + ' .' + dir).val(val);
      checkTextBoxes($('#axis .' + thisRoomId + ' .' + dir));
    }
  });

  socket.on('wait', function () {
    $('button').prop('disabled', true);
    $('input').prop('disabled', true);
  });

  socket.on('go', function () {
    $('button').prop('disabled', false);
    $('input').prop('disabled', false);
    if (!$('#search').val()) {
      $('#plus').prop('disabled', true);
    }
  });

  socket.on('sendCover', function (data) {
    var handle = thisRoomId ? true : false;
    if (!activeCovers.hasOwnProperty(data.isbn)) {
      var src = 'data:image/jpeg;base64,' + data.buffer;
      var new_cover = paper.setCover(src, data.title, data.isbn, data.coord, data.link, handle);
      activeCovers[data.isbn] = new_cover;
    }
  });

  socket.on('removeCover', function (isbn) {
    if (activeCovers.hasOwnProperty(isbn)) {
      activeCovers[isbn].remove();
      delete activeCovers[isbn];
      if ($('#search').val()) {
        checkCovers();
      }
    }
  });

  socket.on('moveCover', function (data) {
    var cover = activeCovers[data.isbn];
    cover.transform('t' + (inv(cover.coord).x + data.dx / COORD.x * paper._viewBox[2]) + ',' + (inv(cover.coord).y - data.dy / COORD.y * paper._viewBox[3]));
  });

  socket.on('placeCover', function (data) {
    activeCovers[data.isbn].coord = {
      x: data.x,
      y: data.y
    };
  });

  socket.on('message', function (mes) {
    message(mes);
  });

  Raphael.st.setMouseHandlers = function () {
    var me = this;
    var _dx = 0;
    var _dy = 0;
    var d = 0;
    var start, end;
    moveFnc = function (dx, dy) {
      socket.emit('moveCover', thisRoomId, {
        isbn: me.isbn,
        dx: Math.round(dx / paper._viewBox[2] * COORD.x),
        dy: Math.round(-dy / paper._viewBox[3] * COORD.y)
      });
      _dx = dx;
      _dy = dy;
      d += Math.abs(_dx) + Math.abs(_dy);
    };
    startFnc = function () {
      socket.emit('wait', thisRoomId);
    };
    endFnc = function () {
      var new_coord = {
        isbn: me.isbn,
        x: Math.round(me.coord.x + _dx / paper._viewBox[2] * COORD.x),
        y: Math.round(me.coord.y - _dy / paper._viewBox[3] * COORD.y)
      }
      _dx = 0;
      _dy = 0;
      d = 0;
      if (new_coord.x > 128 || new_coord.y > 128) {
        socket.emit('removeCover', thisRoomId, me.isbn);
      }
      else {
        socket.emit('placeCover', thisRoomId, new_coord);
      }
      socket.emit('go', thisRoomId);
    };
    this.drag(moveFnc, startFnc, endFnc);
    this.mousedown(function () {
      me.start = new Date();
    });
    this.mouseup(function () {
      me.end = new Date();
      if (me.start && (me.end - me.start) > 1500 && d < 40) {
        socket.emit('removeCover', thisRoomId, me.isbn);
      }
      me.start = me.end = undefined;
    });
  }

  Raphael.st.setLink = function () {
    var me = this
    this.mouseup(function () {
      window.open(me.link);
    });
  }
  
  function map(origin) {
    var tx, ty;
    tx = COORD.x * (origin.x / paper._viewBox[2] - 1 / 2);
    ty = -COORD.y * (origin.y / paper._viewBox[3] - 1 / 2);
    return {
      x: tx,
      y: ty
    };
  }

  function inv(coord) {
    var ox, oy;
    ox = paper._viewBox[2] / COORD.x * (coord.x + COORD.x / 2);
    oy = -paper._viewBox[3] / COORD.y * (coord.y - COORD.y / 2);
    return {
      x: ox,
      y: oy
    };
  }

  var originalRaphaelImageFn = Raphael.fn.image;
  Raphael.fn.image = function (url, x, y, w, h) {
    if (!w || !h) {
      var img = new Image();
      img.src = url;
      if (!w) w = img.width;
      if (!h) h = img.height;
    }
    return originalRaphaelImageFn.call(this, url, x, y, w, h);
  }
});
