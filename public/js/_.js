$(document).ready(function () {
    var WIDTH = $('#main-panel').width(),
        HEIGHT = $('#main-panel').height(),
        paper = Raphael("main-panel", WIDTH, HEIGHT),
        MG = 24;
    var vert = paper.path('M' + WIDTH / 2 + ' ' + MG + 'L' + WIDTH / 2 + ' ' + (HEIGHT - MG)).attr({
        'arrow-end': 'block-wide-wide',
        'arrow-start': 'block-wide-wide',
        'stroke-width': 2
    });
    var horz = paper.path('M' + MG + ' ' + HEIGHT / 2 + 'L' + (WIDTH - MG) + ' ' + HEIGHT / 2).attr({
        'arrow-end': 'block-wide-wide',
        'arrow-start': 'block-wide-wide',
        'stroke-width': 2
    });
    var items = [];
    $('#submit').click(function () {
        var search, isbnjan, keyword;
        search = $('.search').val();
        if (search) {
            if ($.isNumeric(search) && search.length == 13) {
                isbnjan = search;
            }
            else {
                keyword = search;
            }
        }
        var par = {
            'applicationId': '1072038232996204187',
            'keyword': keyword,
            'isbnjan': isbnjan
        }
        $.ajax({
            type: 'GET',
            url: 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522',
            timeout: 12000,
            dataType: 'json',
            data: par,
            beforeSend: function () {
                $('button').attr('disabled', true);
            },
            success: function (data) {
                var item = [];
                var json = data['Items'][0]['Item'];
                item['isbn'] = isbnjan;
                item['title'] = json['title'];
                item['url'] = json['mediumImageUrl'];
                item['x'] = 0;
                item['y'] = 0;
                items.push(item);
                var coverSet = paper.coverSet(item);
                console.log(item);
                $('button').attr('disabled', false);
            },
            error: function () {
                alert('error');
            }
        });
    });
    $('#main-panel').append('<h1>Manga Map</h1>');
    $('#main-panel').append('<footer>&copy; 2014 Masanori HONDA</footer>');
    $('#main-panel').append(
    $('<input/>').attr({
        'type': 'text',
    }).css({
        'position': 'absolute',
        'text-align': 'center',
        'border': 'none',
        'top': 0,
        'left': WIDTH / 2
    }).addClass('axis north'));
    $('#main-panel').append(
    $('<input/>').attr({
        'type': 'text',
    }).css({
        'position': 'absolute',
        'text-align': 'center',
        'border': 'none',
        'top': HEIGHT - 22,
        'left': WIDTH / 2 - 88
    }).addClass('south'));
    $('#save').click(function(){
        $('image').each(function(){
            console.log($(this).attr('transform'));
        });
    });
    function getParameters() {
        var settingsObject = {},
            hash, hashes = location.search.substring(1).split('&'),
            i;
        var max = hashes.length;
        if (max > 1) {
            for (i = 0; i < max; i++) {
                hash = hashes[i].split('=');
                settingsObject[hash[0]] = hash[1];
            }
        }
        else {
            settingsObject = undefined;
        }
        return settingsObject;
    };

    function setParameters(par) {
        var enc = encodeURIComponent;
        var str = '',
            amp = '';
        if (!par) return '';
        for (var i in par) {
            str = str + amp + i + "=" + enc(par[i]);
            amp = '&'
        }
        return str;
    }
    Raphael.fn.coverSet = function (i) {
        var me = this;
        var cover = me.set();
        var img = new Image();
        img.src = i['url'];
        img.onload = function () {
            var img_w = img.width;
            var img_h = img.height;
            var coord = inv(i['x'], i['y'], img.width, img.height);
            cover.push(
            me.rect(coord[0], coord[1], img_w + 8, img_h + 8).attr({
                'stroke': 'black',
                'fill': 'white',
                'stroke-width': .3
            }), me.image(img.src, coord[0] + 4, coord[1] + 4), me.text(coord[0] + img_w / 2, coord[1] + img_h + 20, i['title']).attr({
                'font-size': 14
            }));
            cover.attr({
                'cursor': 'pointer'
            }).draggable();
            setMouseHandlers(cover);
        }
        return cover;
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
            set.remove()
        };
        set.dblclick(dblclick);
    }

    function map(ox, oy) {
        var tx, ty;
        tx = (ox - WIDTH / 2) / (WIDTH / 2);
        ty = -(oy - HEIGHT / 2) / (HEIGHT / 2);
        return [tx, ty];
    }

    function inv(tx, ty, w, h) {
        var ox, oy;
        ox = (1 + tx) * WIDTH / 2 - w/2;
        oy = (1 - ty) * HEIGHT / 2 - h/2;
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
    };
});
