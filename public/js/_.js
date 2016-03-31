$(document).ready(function () {
  var socket = io.connect(location.origin);
  var paper = Raphael('main-panel');
  paper.setViewBox(0, 0, $(window).width(), $(window).height(), true);
  paper.setSize('100%','100%');
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
      'top': '100%', //HEIGHT - MG - 2,
      'left': '50%' //WIDTH / 2 - 80
    });
    $('#e').css({
      'top': '50%', //HEIGHT / 2,
      'left': '100%', //WIDTH - 160
      'text-align': 'right'
    });
    $('#w').css({
      'top': '50%', //HEIGHT / 2,
      'left': 0
    });
    $('body').prepend($('<footer>MANGAMAP2 &copy; 2016 msnrhnd</footer>'));
  });//(paper._viewBox);
  $(window).resize(function (){
  });
  $('.axis').change(function () {
    $(this).css('border', 'none');
    if (!$(this).val()) {
      $(this).css('border-bottom', '1px solid black');
    }
  });

  Raphael.fn.setCover = function (src, title, asin, coord) {
    var me = this;
    var cover = me.set();
    cover.id = asin;
    cover.coord = coord;
    var img = new Image();
    img.src = src;
    img.onload = function () {
      var w, h;
      if (me._viewBox[2] < me._viewBox[3]) {
        w = me._viewBox[2] / 8;
        h = w * img.height / img.width;
      } else {
        h = me._viewBox[3] / 8;
        w = h * img.width / img.height;
      }
      var xy = inv(coord);
      var MG = w / 16;
      cover.push(
      me.rect(xy.x - w / 2 - MG/2, xy.y - h / 2 - MG/2, w + MG, h + MG).attr({
        'stroke': 'black',
        'fill': 'white',
        'stroke-width': 1
      }), me.image(src, xy.x - w / 2, xy.y - h / 2, w, h), me.text(xy.x, xy.y + h / 2 + MG*2, title).attr({
        'font-size': MG
      }));
      cover.attr({
        'cursor': 'pointer'
      });
      setMouseHandlers(cover);
      activeCover.push(cover);
      return cover;
    }
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
    var asin = $('.search').val();
    socket.emit('getItem', asin);
    $('.search').val('');
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
      temp['asin'] = val;
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
    var asin16 = Number(item['asin']).toString(16);
    var x16 = ('0' + item['x'].toString(16)).slice(-2);
    var y16 = ('0' + item['y'].toString(16)).slice(-2);
    return asin16 + x16 + y16; // 15digits
  }

  function itemDecode(digits) {
    var asin = parseInt(digits.slice(0, 11), 16);
    var x = parseInt(digits.slice(11, 13), 16);
    var y = parseInt(digits.slice(13, 15), 16);
    return {
      'asin': asin,
      'x': x,
      'y': y
    };
  }
  
  socket.on('sendItem', function (data) {
    var src = 'data:image/jpeg;base64,' + data.buffer;
    paper.setCover(src, data.itemInfo.title, data.itemInfo.asin, {x: 0, y: 0});
  });
  
  socket.on('removeCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.id == data) cover.remove();
    });
  });
  socket.on('moveCover', function (data) {
    activeCover.forEach( function (cover) {
      if (cover.id == data.id) {
        var dx = data.x - cover.coord.x;
        var dy = data.y - cover.coord.y;
        console.log(dx, dy);
        cover.translate(dx, dy);
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
    set.drag( function(x, y) {
      new_coord = map({
        x: inv(new_coord).x - inv(set.coord).x + x,
        y: inv(new_coord).y - inv(set.coord).y + y
      });
      console.log(set.coord);
      socket.emit('moveCover', {x: new_coord.x, y: new_coord.y, id: set.id});
    }, function() {
      var new_coord = set.coord;
    }, function() { });
    set.dblclick( function () {
      set.remove();
      socket.emit('removeCover', set.id);
    });
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
    oy = - paper._viewBox[3] / COORD.y * (coord.y - COORD.y / 2);
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
  function refresh(){
    console.log();
  }
});
