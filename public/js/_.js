$(document).ready(function () {
  var socket = io.connect(location.origin);
  var activeCovers = {};
  var roomID;
  var paper = Raphael('main-panel');
  paper.setViewBox(0, 0, $(window).width(), $(window).height(), true);
  paper.setSize('100%', '100%');
  var COORD = {x: 256, y: 256};
  var WIDTH = paper._viewBox[2];
  var HEIGHT = paper._viewBox[3];
  var MG = Math.max(WIDTH / 48, HEIGHT / 48);
  var VERT = paper.path('M' + WIDTH / 2 + ' ' + MG + 'L' + WIDTH / 2 + ' ' + (HEIGHT - MG)).attr({'arrow-end': 'block-wide-wide', 'arrow-start': 'block-wide-wide', 'stroke-width': 2, opacity: 0});
  var HORZ = paper.path('M' + MG + ' ' + HEIGHT / 2 + 'L' + (WIDTH - MG) + ' ' + HEIGHT / 2).attr({'arrow-end': 'block-wide-wide', 'arrow-start': 'block-wide-wide', 'stroke-width': 2, opacity: 0});
  var DURATION = 200;
  $('#control-panel').hide();
  $('#sign-in').click(function () {
    roomId = $('.sign-in').val();
    $('#control-panel').fadeIn(DURATION);
    VERT.animate({opacity: 1}, DURATION);
    HORZ.animate({opacity: 1}, DURATION);
    $('#modal-panel').fadeOut(DURATION);
    socket.emit('init', roomId);
  });
  $('#sign-out').click(function () {
    socket.emit('sign-out', roomId);
    $('#control-panel').fadeOut(DURATION);
    $.each(activeCovers, function (k, v) {
      activeCovers[k].remove();
      delete activeCovers[k];
    });
    VERT.animate({opacity: 0}, DURATION);
    HORZ.animate({opacity: 0}, DURATION);
    $('#modal-panel').fadeIn(DURATION);
  });
  function drawTextBoxes (viewbox) {
    var dir = ['e', 'w', 's', 'n'];
    var WIDTH = viewbox[2];
    var HEIGHT = viewbox[3];
    $.each(dir, function (k, v) {
      $('#main-panel').append($('<input>').attr({id: v, type: 'text', value: ''}).addClass('axis'));
    });
    $('footer').css({
      position: 'absolute',
      top: HEIGHT,
      left: WIDTH,
      'font-size': '11px'
    });
    $('#n').css({
      'top': 0,
      'left': '50%' // - 80
    });
    $('#s').css({
      'top': '100%',
      //HEIGHT - MG - 2,
      'left': '50%' //WIDTH / 2 - 80
    });
    $('#e').css({
      'top': '50%',
      //HEIGHT / 2,
      'left': '100%',
      //WIDTH - 160
      'text-align': 'right'
    });
    $('#w').css({
      'top': '50%',
      //HEIGHT / 2,
      'left': 0
    });
    $('body').prepend($('<footer>MANGAMAP2 &copy; 2016 msnrhnd</footer>'));
  };
//  drawTextBoxes(paper._viewBox);
  $(window).resize(function () {
    //テキストボックスの再描画
  });
  
  $('.axis').change(function () {
    $(this).css('border', 'none');
    if (!$(this).val()) {
      $(this).css('border-bottom', '1px solid black');
    }
  });

  Raphael.fn.setCover = function (src, title, isbn, coord) {
    function trimTitle16 (str) {
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
    var img = new Image();
    img.src = src;
    img.onload = function () {
      var u = Math.sqrt(me._viewBox[2] * me._viewBox[3]);
      var w = u / 8;
      var h = w * img.height / img.width;
      var margin = u / 96;
      cover.push(
        me.rect(- w / 2 - margin / 2, - h / 2 - margin / 2, w + margin, h + margin).attr({
          'stroke': 'black',
          'fill': 'white',
          'stroke-width': 1
        }), me.image(src, - w / 2, - h / 2, w, h), me.text(0, h / 2 + margin * 4, trimTitle16(title)).attr({
          'font-size': margin * 2
        })
      );
      cover.attr({
        'cursor': 'pointer'
      });
      setMouseHandlers(cover);
      cover.transform('t' + inv(coord).x + ',' + inv(coord).y);
    }
    return cover;
  }

  $('#plus').click(function () {
    if ($('img').size() > 32) {
      message('Too much covers!', 'not-found');
    }
    else {
      var isbn = $('#search').val().replace(/-/g, '');
      if (!activeCovers.hasOwnProperty(isbn)) {
        socket.emit('getBook', isbn, {x: 0, y: 0});
      }
      $('.search').val('');
    }
  });

  $('#files-o').click(function () {
    var books = ['9784758101509', '9784758101493', '9784758101486', '9784758101479', '9784758101462', '9784758101455'];
    $.each(books, function(i, val){
      socket.emit('getBook', roomId, val, {x: 0, y: 0});
    })
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

  socket.on('init', function (activeStates_roomId) {
    console.log(activeStates_roomId);
    console.log(activeCovers);
    $.each(activeStates_roomId, function (isbn, book) {
      socket.emit('getBook', roomId, isbn, book.coord);
    });
  });

  socket.on('wait', function () {
    $('button').prop('disabled', true);
    $('input').prop('disabled', true);
  });

  socket.on('go', function() {
    $('button').prop('disabled', false);
    $('input').prop('disabled', false);
  });
  
  socket.on('sendBook', function (data) {
    if (!activeCovers.hasOwnProperty(data.isbn)){
      var src = 'data:image/jpeg;base64,' + data.buffer;
      var new_cover = paper.setCover(src, data.title, data.isbn, data.coord);
      activeCovers[data.isbn] = new_cover;
    }
  });

  socket.on('removeCover', function (isbn) {
    activeCovers[isbn].remove();
  });

  socket.on('moveCover', function (data) {
    var cover = activeCovers[data.isbn];
    cover.transform('t' + (inv(cover.coord).x + data.dx / COORD.x * paper._viewBox[2]) + ',' + ( inv(cover.coord).y - data.dy / COORD.y * paper._viewBox[3]));
  });
  
  socket.on('placeCover', function (data) {
    activeCovers[data.isbn].coord = {x: data.x, y: data.y};
  });
  
  socket.on('update', function (activeStates) {
  });

  Raphael.st.undraggable = function () {
  }
  
  Raphael.st.draggable = function () {
    var me = this;
    var _dx = 0;
    var _dy = 0;
    moveFnc = function (dx, dy) {
      socket.emit('moveCover', roomId, {isbn: me.isbn, dx: Math.round(dx / paper._viewBox[2] * COORD.x), dy: Math.round(-dy / paper._viewBox[3] * COORD.y)});
      _dx = dx;
      _dy = dy;
    };
    startFnc = function () {
      socket.emit('wait', roomId);
    };
    endFnc = function () {
      var new_coord = {isbn: me.isbn, x: Math.round(me.coord.x + _dx / paper._viewBox[2] * COORD.x), y: Math.round(me.coord.y - _dy / paper._viewBox[3] * COORD.y)}
      _dx = 0;
      _dy = 0;
      socket.emit('placeCover', roomId, new_coord);
      socket.emit('go', roomId);
    };
    this.drag(moveFnc, startFnc, endFnc);
  };
  
  function setMouseHandlers(set) {
    set.draggable();
    set.dblclick(function () {
      socket.emit('removeCover', set.isbn);
    });
  }
  
  function update() {
    socket.emit('update', activeStates);
  }
  
  function map(origin) {
    var tx, ty;
    tx = COORD.x * (origin.x / paper._viewBox[2] - 1 / 2);
    ty = -COORD.y * (origin.y / paper._viewBox[3] - 1 / 2);
    return {x: tx, y: ty};
  }
  
  function inv(coord) {
    var ox, oy;
    ox = paper._viewBox[2] / COORD.x * (coord.x + COORD.x / 2);
    oy = -paper._viewBox[3] / COORD.y * (coord.y - COORD.y / 2);
    return {x: ox, y: oy};
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
