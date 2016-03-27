$(document).ready(function () {
  var socket = io.connect(location.origin);
  var paper, vert, horz, MG;
  var COORD = {x: 256, y: 256};
  (function () {
    var WIDTH = $(window).width();
    var HEIGHT = $(window).height();
    paper = Raphael('main-panel', WIDTH, HEIGHT);
    MG = 24;
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
    $('footer').css({
      position: 'absolute',
      top: HEIGHT,
      left: WIDTH,
      'font-size': '11px'
    });
    $('#n').css({
      'top': 0,
      'left': WIDTH / 2 - 80
    });
    $('#s').css({
      'top': HEIGHT - MG - 2,
      'left': WIDTH / 2 - 80
    });
    $('#e').css({
      'top': HEIGHT / 2,
      'left': WIDTH - 160
    });
    $('#w').css({
      'top': HEIGHT / 2,
      'left': 0
    });
  })();
  $('#main-panel').prepend($('<footer>MANGAMAP2 &copy; 2016 msnrhnd</footer>'));
  var activeCover = new Array();
  Raphael.fn.setCover = function (src, title, isbn, coord) {
    var me = this;
    var cover = me.set();
    var img = new Image();
    img.src = src;
    img.onload = function () {
      var w = img.width;
      var h = img.height;
      var xy = inv(coord);
      cover.push(
      me.rect(xy.x - w / 2 - 4, xy.y - h / 2 - 4, w + 8, h + 8).attr({
        'stroke': 'black',
        'fill': 'white',
        'stroke-width': 1
      }), me.image(src, xy.x - w / 2, xy.y - h / 2), me.text(xy.x, xy.y + h / 2 + 20, title).attr({
        'font-size': 14
      }));
      cover.attr({
        'cursor': 'pointer'
      });
      setMouseHandlers(cover);
      cover.id = isbn;
      activeCover.push(cover);
      return cover;
    }
  }
  function getCover(isbn) {
    $.ajax({
      type: 'GET',
      url: 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522',
      timeout: 12000,
      dataType: 'json',
      data: {
        'applicationId': '1072038232996204187',
        'isbnjan': isbn
      },
      success: function (data) {
        try {
          var json = data['Items'][0]['Item'];
          socket.emit('getCover', json);
        }
        catch (e) {
          message('Not found', 'not-found');
        }
        if (!json) {
          return false;
        }
      },
      error: function () {
        message('Error!', 'not-found');
      },
      coplete: function () {
      }
    });
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
    if ($('img').size() > 48) {
      message('Too much covers!', 'not-found');
      return false;
    }
    getCover($('.search').val());
//    var digits_list = queryFormat($('.search').val());
    $('.search').val('');
//    orderedAjax(digits_list, 0);
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
      temp['isbn'] = val;
      digits_list.push(itemStringfy(temp));
    });
    return digits_list;
  }

  function message(mes, type) {
    var $mes = $('<message/>').addClass(type).css({
      top: HEIGHT / 2 - 20,
      left: WIDTH / 2 - 60
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
  socket.on('image', function (data) {
    if (data.image) {
      var src = 'data:image/jpeg;base64,' + data.buffer;
      paper.setCover(src, data.title, data.isbn, {x: 0, y: 0});
    }
  });
  socket.on('removeCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.id == data) cover.remove();
    });
  });
  socket.on('moveCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.id == data.id) {
        cover.translate(data.dx*$(window).width(), data.dy*$(window).height());
      }
    });
  });
  Raphael.st.draggable = function () {
    var me = this,
      lx = 0,
      ly = 0,
      ox = 0,
      oy = 0,
      moveFnc = function (dx, dy) {
        lx = dx + ox;
        ly = dy + oy;
        me.transform('t' + lx + ',' + ly);
      },
      startFnc = function () {},
      endFnc = function () {
        ox = lx;
        oy = ly;
      };
    this.drag(moveFnc, startFnc, endFnc);
  };

  function setMouseHandlers(set) {
    set.draggable();
    var _x = _y = 0;
    set.drag( function(x, y) {
      var dx = x - _x;
      var dy = y - _y;
      _x = x;
      _y = y;
      socket.emit('moveCover', {dx: dx/$(window).width(), dy: dy/$(window).height(), id: set.id});
    });
    set.dblclick( function () {
      set.remove();
      socket.emit('removeCover', set.id);
    });
  }

  function map(origin) {
    var tx, ty;
    tx = Math.round(COORD.x * (origin.x / $(window).width() - 1 / 2));
    ty = Math.round(-COORD.y * (origin.y / $(window).height() - 1 / 2));
    return {x: tx, y: ty};
  }

  function inv(coord) {
    var ox, oy;
    ox = $(window).width() / COORD.x * (coord.x + COORD.x / 2);
    oy = - $(window).height() / COORD.y * (coord.y - COORD.y / 2);
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
