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
    $('#submit').click(function () {
        if ($('img').size() > 12) {
            return false;
        }
        search_list = $('.search').val().split(/\s*,\s*/);
        $.each(search_list, function (i, v) {
            if (v) {
                paper.coverSet(v, 128, 128);
            }
        });
    });

    $('#main-panel').prepend('<footer>MANGAMAP &copy; 2014 Masanori HONDA</footer>');
    $('#save').click(function () {
        var param = '';
        var axis = '';
        var jump = '/?';
        $('input.axis').each(function () {
            axis += escape($(this).val()) + '.';
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
        if (param) {
            jump += '_=' + param;
        }
        if (axis != '...') {
            jump += '&l=' + axis;
        }
        history.pushState('', '', jump);
    });
    $('#reset').click(function () {
        history.pushState('', '', '/');
        paper.remove();
        draw();
    });
    $('input.axis').change(function () {
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

    Raphael.fn.coverSet = function (isbn, tx, ty) {
        var me = this;
        var cover = me.set();
        if ($.isNumeric(isbn) && isbn.length == 13) {
            var par = {
                'applicationId': '1072038232996204187',
                'isbnjan': isbn
            }
            $.ajax({
                type: 'GET',
                url: 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522',
                timeout: 12000,
                dataType: 'json',
                data: par,
                beforeSend: function () {
                    if ($('#' + isbn).size() > 0) {
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
                        console.log('Not Found');
                    }
                    if (!json) {
                        return false;
                    }
                    var img = new Image();
                    img.src = json['mediumImageUrl'];
                    img.onload = function () {
                        var w = img.width;
                        var h = img.height;
                        var coord = inv(tx, ty);
                        cover.push(
                        me.rect(coord[0] - w / 2 - 4, coord[1] - h / 2 - 4, w + 8, h + 8).attr({
                            'stroke': 'black',
                            'fill': 'white',
                            'stroke-width': 1
                        }), me.image(json['mediumImageUrl'], coord[0] - w / 2, coord[1] - h / 2), me.text(coord[0], coord[1] + h / 2 + 20, json['title']).attr({
                            'font-size': 14
                        }));
                        cover[1].node.id = isbn;
                        cover.attr({
                            'cursor': 'pointer',
                        }).draggable();
                        setMouseHandlers(cover);
                        return cover;
                    }
                },
                error: function () {
                    return false;
                }
            });
        }
        else {
            var w = 80;
            var h = 120;
            var coord = inv(tx, ty);
            cover.push(
            me.rect(coord[0] - w / 2 - 4, coord[1] - h / 2 - 4, w + 8, h + 8).attr({
                'stroke': 'black',
                'fill': 'white',
                'stroke-width': 1
            }), me.image('images/dummy.png', coord[0] - w / 2, coord[1] - h / 2, w, h), me.text(coord[0], coord[1] + h / 2 + 20, isbn).attr({
                'font-size': 14
            }));
            cover[1].node.id = '0000000000000';
            cover.attr({
                'cursor': 'pointer',
            }).draggable();
            setMouseHandlers(cover);
            return cover;
        }
    }
    var get_vars = getUrlVars();
    var get_item = get_vars['_'];
    var get_axis = get_vars['l'];
    if (get_item) {
        if (get_axis) {
            var axis_list = get_axis.split('.');
            $.each(axis_list, function (i, v) {
                if (v) {
                    $('input.axis').eq(i).val(unescape(v)).css('border', 'none');
                }
            });
        }
        if (get_item.length % 15 == 0) {
            var num = get_item.length / 15;
            for (var i = num; i > 0; i--) {
                var digits = get_item.slice(15 * (i - 1), 15 * i);
                var item = itemDecode(digits);
                paper.coverSet(String(item['isbn']), item['x'], item['y']);
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
});
