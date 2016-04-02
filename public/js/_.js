$(document).ready(function () {
  var socket = io.connect(location.origin);
  var paper = Raphael('main-panel');
  paper.setViewBox(0, 0, $(window).width(), $(window).height(), true);
  paper.setSize('100%', '100%');
  var vert, horz, MG;
  var COORD = {x: 256, y: 256};
  var activeCover = new Array();
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
      var w, h;
      if (me._viewBox[2] < me._viewBox[3]) {
        w = me._viewBox[2] / 7;
        h = w * img.height / img.width;
      }
      else {
        h = me._viewBox[3] / 7;
        w = h * img.width / img.height;
      }
      var xy = inv(coord);
      var MG = w / 16;
      cover.push(
      me.rect(xy.x - w / 2 - MG / 2, xy.y - h / 2 - MG / 2, w + MG, h + MG).attr({
        'stroke': 'black',
        'fill': 'white',
        'stroke-width': 1
      }), me.image(src, xy.x - w / 2, xy.y - h / 2, w, h), me.text(xy.x, xy.y + h / 2 + MG * 4, trimTitle16(title)).attr({
        'font-size': MG
      }));
      cover.attr({
        'cursor': 'pointer'
      });
      setMouseHandlers(cover);
    }
    return cover;
  }

  var get_vars = getUrlVars();
  var get_item = get_vars['_'];
  var get_preset = get_vars['preset'];
  var get_axis = get_vars['l'];
  if (get_vars) {
    if (get_preset) {
      positionPreset(get_preset);
    }
    if (get_axis) {
      var axis_list = get_axis.split('.');
      $.each(axis_list, function (i, v) {
        if (v) {
          $('.axis').eq(i).val(decodeURI(v)).css('border', 'none');
        }
      });
    }
    if (get_item) {
      if (get_item.length % 15 == 0) {
        var num = get_item.length / 15;
        var digits_list = [];
        for (var i = 0; i < num; i++) {
          digits_list.push(get_item.substr(i * 15, 15));
        }
        orderedAjax(digits_list, 0);
      }
    }
  }

  function getUrlVars() {
    var vars = [],
      hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for (var i = 0; i < hashes.length; i++) {
      hash = hashes[i].split('=');
      vars.push(hash[0]);
      vars[hash[0]] = hash[1];
    }
    return vars;
  }

  $('#submit').click(function () {
    if ($('img').size() > 32) {
      message('Too much covers!', 'not-found');
    }
    else {
      var isbn = $('.search').val().replace(/-/g, '');
      socket.emit('getBook', isbn);
      $('.search').val('');
    }
  });

  function queryFormat(query) {
    var query_list = query.split(/\s*,\s*/);
    var digits_list = [];
    var temp = {
      'x': 128,
      'y': 128
    };
    $.each(query_list, function (i, val) {
      console.log(val);
      temp.isbn = val;
      digits_list.push(itemStringfy(temp));
    });
    return digits_list;
  }

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

  function itemStringfy(item) {
    var isbn16 = Number(item['isbn']).toString(16);
    var x16 = ('0' + item['x'].toString(16)).slice(-2);
    var y16 = ('0' + item['y'].toString(16)).slice(-2);
    return isbn16 + x16 + y16; // 15digits
  }

  function itemDecode(digits) {
    var isbn = parseInt(digits.slice(0, 11), 16);
    var x = parseInt(digits.slice(11, 13), 16);
    var y = parseInt(digits.slice(13, 15), 16);
    return {
      'isbn': isbn,
      'x': x,
      'y': y
    };
  }

  socket.on('sendBook', function (data) {
    var src = 'data:image/jpeg;base64,' + data.buffer;
    var new_cover = paper.setCover(src, data.title, data.isbn, {x: 0, y: 0});
    activeCover.push(new_cover);
  });

  socket.on('removeCover', function (isbn) {
    activeCover.forEach(function (cover) {
      if (cover.isbn == isbn) {
        cover.remove();
        //      activeCover.pop();
      }
    });
  });

  socket.on('moveCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.isbn == data.isbn) {
        var lx = inv(cover.coord).x + data.coord.dx / COORD.x * paper._viewBox[2];
        var ly = inv(cover.coord).y - data.coord.dy / COORD.y * paper._viewBox[3];
        cover.transform('t' + (lx - paper._viewBox[2]/2) + ',' + (ly - paper._viewBox[3]/2));
      }
    });
  });
  socket.on('placeCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.isbn == data.isbn) {
        cover.coord = data.coord;
        console.log(cover.coord);
      }
    });
  });
  socket.on('update', function (activeState) {
    activeState.forEach(function (cover) {});
  });
  
  Raphael.st.draggable = function () {
    var me = this, lx = ly = ox = oy = 0, move = {},
        moveFnc = function (dx, dy) {
          lx = dx + ox;
          ly = dy + oy;
          me.transform('t' + lx + ',' + ly);
          move = { dx: dx / paper._viewBox[2] * COORD.x,
                   dy: - dy / paper._viewBox[3] * COORD.y
                 };
          socket.emit('moveCover', {isbn: me.isbn, coord: move});
        },
        startFnc = function () {},
        endFnc = function () {
          ox = lx;
          oy = ly;
          me.coord = {x: me.coord.x + move.dx, y: me.coord.y + move.dy};
          socket.emit('placeCover', {isbn: me.isbn, coord: me.coord});
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
    var activeState = [];
    activeCover.forEach(function (cover) {
      var temp = {};
      temp.isbn = cover.isbn;
      temp.title = cover.title;
      temp.coord = cover.coord;
      activeState.push(temp);
    });
    socket.emit('update', activeState);
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
