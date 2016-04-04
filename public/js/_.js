$(document).ready(function () {
  
  var socket = io.connect(location.origin);
  var paper = Raphael('main-panel');
  paper.setViewBox(0, 0, $(window).width(), $(window).height(), true);
  paper.setSize('100%', '100%');
  var vert, horz, MG;
  var COORD = {x: 256, y: 256};
  var activeCovers = {};
  (function draw(viewbox) {
    var WIDTH = viewbox[2];
    var HEIGHT = viewbox[3];
    MG = Math.max(WIDTH / 48, HEIGHT / 48);
    vert = paper.path('M' + WIDTH / 2 + ' ' + MG + 'L' + WIDTH / 2 + ' ' + (HEIGHT - MG)).attr({
      'arrow-end': 'block-wide-wide',
      'arrow-start': 'block-wide-wide',
      'stroke-width': 2
    });
    horz = paper.path('M' + MG + ' ' + HEIGHT / 2 + 'L' + (WIDTH - MG) + ' ' + HEIGHT / 2).attr({
      'arrow-end': 'block-wide-wide',
      'arrow-start': 'block-wide-wide',
      'stroke-width': 2
    });
  })(paper._viewBox);
  (function drawText(viewbox) {
    var WIDTH = viewbox[2];
    var HEIGHT = viewbox[3];
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
  }); //(paper._viewBox);
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
      if (str.length > 16) {
        trimmed = str.slice(0, 15) + '…';
      }
      var mid = Math.round(trimmed.length / 2);
      trimmed = trimmed.slice(0, mid) + '\n' + trimmed.slice(mid, trimmed.length);
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
      var xy = inv(coord);
      var MG = u / 48;
      cover.push(
        me.rect(xy.x - w / 2 - MG / 2, xy.y - h / 2 - MG / 2, w + MG, h + MG).attr({
          'stroke': 'black',
          'fill': 'white',
          'stroke-width': 1
        }), me.image(src, xy.x - w / 2, xy.y - h / 2, w, h), me.text(xy.x, xy.y + h / 2 + MG * 2, trimTitle16(title)).attr({
          'font-size': MG
        })
      );
      cover.attr({
        'cursor': 'pointer'
      });
      setMouseHandlers(cover);
    }
    return cover;
  }

  $('#submit').click(function () {
    if ($('img').size() > 32) {
      message('Too much covers!', 'not-found');
    }
    else {
      var isbn = $('.search').val().replace(/-/g, '');
      if (!activeCovers.hasOwnProperty(isbn)) {
        socket.emit('getBook', isbn, {x: 0, y: 0});
      }
      $('.search').val('');
    }
  });

  $('#test').click(function () {
    var books = ['9784758101509', '9784758101493', '9784758101486', '9784758101479', '9784758101486', '9784758101479'];
    $.each(books, function(i, val){
      socket.emit('getBook', val, {x: 0, y: 0});
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

  (function(isbns){
    $.each(isbns, function(isbn){
      socket.emit('getBook', isbn, coord);
      setTimeout(this, 1000);
    });
  });

  socket.on('init', function (activeStates) {
    $.each(activeStates, function(isbn, book) {
      socket.emit('getBook', isbn, book.coord);
    });
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
    cover.transform('t' + (data.lx / COORD.x * paper._viewBox[2]) + ',' + (-data.ly / COORD.y * paper._viewBox[3]));
  });
  
  socket.on('placeCover', function (data) {
    activeCovers[data.isbn].coord = {x: data.x, y: data.y};
  });
  
  socket.on('update', function (activeStates) {
  });

  Raphael.st.draggable = function () {
    var me = this;
    var lx = 0;
    var ly = 0;
    var ox = 0;
    var oy = 0;
    moveFnc = function (dx, dy) {
      lx = ox + dx;
      ly = oy + dy;
      socket.emit('moveCover', {isbn: me.isbn, lx: lx / paper._viewBox[2] * COORD.x, ly:  -ly / paper._viewBox[3] * COORD.y});
    };
    startFnc = function () {
    };
    endFnc = function () {
      ox = lx;
      oy = ly;
      socket.emit('placeCover', {isbn: me.isbn, x: me.coord.x + lx / paper._viewBox[2] * COORD.x, y:  me.coord.y - ly / paper._viewBox[3] * COORD.y});
    };
    this.drag(moveFnc, startFnc, endFnc);
  };
  
  function setMouseHandlers(set) {
    set.draggable();
    set.dblclick(function () {
      socket.emit('removeCover', set.isbn);
      set.remove();
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
