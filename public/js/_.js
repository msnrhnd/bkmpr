$(document).ready(function () {
    var WIDTH, HEIGHT, paper, vert, horz, MG;

    function draw() {
        WIDTH = $(window).width();
        HEIGHT = $(window).height();
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
    }
    draw();
    var items = [];

    function queryFormat(query) {
        var query_list = query.split(/\s*,\s*/);
        var digits_list = [];
        var temp = {'x': 128, 'y': 128};
        $.each(query_list, function(i, val){
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

    $('.search').bind('keypress', function (e) {
        if (e.keyCode == 13) {
            if ($('img').size() > 48) {
                message('Too much!', 'not-found');
                return false;
            }
            var digits_list = queryFormat($('.search').val());
            $('.search').val('');
            orderedAjax(digits_list, 0);
        }
    });
    $('#submit').click(function () {
        if ($('img').size() > 48) {
            message('Too much!', 'not-found');
            return false;
        }
        var digits_list = queryFormat($('.search').val());
        $('.search').val('');
        orderedAjax(digits_list, 0);
    });

    $('#main-panel').prepend($('<footer>MANGAMAP &copy; 2014 Masanori HONDA</footer>'));
    $('#save').click(function () {
        var param = '';
        var axis = '';
        var jump;
        $('.axis').each(function () {
            axis += $(this).val() + '.';
        });
        axis = axis.slice(0, -1);
        $('image').not('#0000000000000').each(function () {
            var item = [];
            var mat = eval($(this).attr('transform')) || eval('matrix(1,0,0,1,0,0)');
            var ox = Number($(this).attr('x')) + mat[4] + $(this).attr('width') / 2;
            var oy = Number($(this).attr('y')) + mat[5] + $(this).attr('height') / 2;
            var coord = map(ox, oy);
            item['isbn'] = $(this).attr('id');
            item['x'] = coord[0];
            item['y'] = coord[1];
            param += itemStringfy(item);
        });
        if (param || axis != '...') {
            jump = '?' + $.param({
                _: param,
                l: axis
            });
        }
        history.pushState('', '', jump);
    });

    $('#reset').click(function () {
        history.pushState('', '', '/');
        paper.remove();
        $('input').val('');
        draw();
    });

    $('.axis').change(function () {
        $(this).css('border', 'none');
        if (!$(this).val()) {
            $(this).css('border-bottom', '1px solid black');
        }
    });

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

    Raphael.fn.setCover = function(img_url, title, isbn, tx, ty) {
        var me = this;
        var cover = me.set();
        var img = new Image();
        img.src = img_url;
        img.onload = function () {
            var w = img.width;
            var h = img.height;
            var coord = inv(tx, ty);
            cover.push(
                me.rect(coord[0] - w / 2 - 4, coord[1] - h / 2 - 4, w + 8, h + 8).attr({
                    'stroke': 'black',
                    'fill': 'white',
                    'stroke-width': 1
                }), me.image(img_url, coord[0] - w / 2, coord[1] - h / 2), me.text(coord[0], coord[1] + h / 2 + 20, title).attr({
                    'font-size': 14
                }));
            cover[1].node.id = isbn;
            cover.attr({
                'cursor': 'pointer',
            }).draggable();
            setMouseHandlers(cover);
            return cover;
        }
    }

    function orderedAjax(digits_list, i) {
        if (digits_list.length > i) {
            item = itemDecode(digits_list[i]);
            var par = {
                'applicationId': '1072038232996204187',
                'isbnjan': item['isbn']
            }
            $.ajax({
                type: 'GET',
                url: 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522',
                timeout: 12000,
                dataType: 'json',
                data: par,
                beforeSend: function () {
                    if ($('#' + item['isbn']).size() > 0) {
                        message('Duplicated', 'not-found');
                        return false;
                    }
                    else {
                        $('button').attr('disabled', true);
                    }
                },
                success: function (data) {
                    $('button').attr('disabled', false);
                    try {
                        var json = data['Items'][0]['Item'];
                    }
                    catch (e) {
                        message('Not found', 'not-found');
                    }
                    if (!json) {
                        return false;
                    }
                    paper.setCover(json['mediumImageUrl'], json['title'], item['isbn'], item['x'], item['y']);
                },
                error: function () {
                    $('button').attr('disabled', false);
                    message('Error!', 'not-found');
                    return false;
                },
                complete: function () {
                    console.log(i);
                    setTimeout(function(){
                        orderedAjax(digits_list, i + 1)
                    }, 200);
                }
            });
        } else {
            console.log('Finished.');
            return false;
        };
    };

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
        function dblclick() {
            set.remove();
        };
        set.dblclick(dblclick);
    }

    function map(ox, oy) {
        var tx, ty;
        tx = Math.round(255 * ox / WIDTH);
        ty = Math.round(255 * oy / HEIGHT);
        return [tx, ty];
    }

    function inv(tx, ty) {
        var ox, oy;
        ox = WIDTH * tx / 255;
        oy = HEIGHT * ty / 255;
        return [ox, oy];
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

    function itemStringfy(item) {
        var isbn16 = Number(item['isbn']).toString(16);
        var x16 = ('0' + item['x'].toString(16)).slice(-2);
        var y16 = ('0' + item['y'].toString(16)).slice(-2);
        return isbn16 + x16 + y16; // 15digits
    }

    function matrix(a, b, c, d, e, f) {
        return [a, b, c, d, e, f];
    }

    function positionPreset(id) {
        if (id == '1') {
            alert('group1');
        }
    }
});
