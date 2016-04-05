var express = require('express'),
    http = require('http'),
    https = require('https'),
    path = require('path'),
    async = require('async'),
    fs = require('fs'),
    querystring = require('querystring'),
    app = express(),
    server = http.createServer(app),
    routes = require('./routes'),
    io = require('socket.io').listen(server);

var port = Number(process.env.PORT || 8080);
server.listen(port);

app.configure(function () {
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(express.methodOverride());
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
  app.use(express.errorHandler());
});

app.get('/', routes.index);

function trimTitle32 (str) {
  var trimmed = str;
  if (str.length > 32) {
    trimmed = str.slice(0, 32) + '…';
  }
  return trimmed;
}

function trimCoord (coord) {
  for (k in coord) {
    coord[k] = Math.min( Math.max(coord[k], -128), 128);
  }
  return coord;
}

var rakuten_url = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';
var infoPath = 'tmp/activeStates.json';
try {
  var activeStates = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
} catch (err) {
  var activeStates = {};
}

io.sockets.on('connection', function (socket) {
  console.log('connected');
  socket.on('disconnect', function (socket) {
    console.log('disconnected');
  });
  socket.emit('init', activeStates);
  socket.on('getBook', function (isbn, coord) {
    async.waterfall([
      function (callback) {
        var title = imageURL = '';
        var par = {
          'applicationId': '1072038232996204187',
          'isbnjan': isbn
        }
        if (activeStates.hasOwnProperty(isbn)) {
          title = activeStates[isbn].title;
          imageURL = activeStates[isbn].imageURL;
          callback(null, isbn, imageURL, title);
        } else {
          https.get(rakuten_url + querystring.stringify(par), function (res) {
            var body = '';
            res.on('data', function (chunk) {
              body += chunk;
            });
            res.on('end', function () {
              var response = JSON.parse(body);
              try {
                var item = response.Items[0].Item;
                title = trimTitle32(item.title);
                imageURL = item.mediumImageUrl;
                activeStates[isbn] = {};
                activeStates[isbn].title = title;
                activeStates[isbn].imageURL = imageURL;
                activeStates[isbn].coord = coord;
                fs.writeFileSync(infoPath, JSON.stringify(activeStates));
                setTimeout(callback(null, isbn, imageURL, title), 1000);
              }
              catch (err) {
                console.log(err.message);
              }
            });
          });
        };
      },
      function (isbn, imageURL, title, callback) {
        var imagePath = path.join('tmp', isbn + '.jpg');
        if (!fs.existsSync(imagePath)) {
          var outFile = fs.createWriteStream(imagePath);
          http.get(imageURL, function (res) {
            var imagedata = ''
            res.setEncoding('binary');
            res.on('data', function (chunk) {
              imagedata += chunk;
            });
            res.on('end', function () {
              fs.writeFile(imagePath, imagedata, 'binary', function (err) {
                if (err) throw err;
                console.log('File saved.');
                setTimeout(callback(null, isbn, imagePath, title), 1000);
              });
            })
          }).on('error', function (err) {
            console.log(err.message);
          });
        }
        else {
          callback(null, isbn, imagePath, title);
        };
      },
      function (isbn, imagePath, title, callback) {
        fs.readFile(imagePath, function (e, buffer) {
          var sendBook = {
            buffer: buffer.toString('base64'),
            title: title,
            isbn: isbn,
            coord: trimCoord(coord)
          };
          callback(null, sendBook);
        });
      }
    ], function (err, sendBook) {
      if (err) console.log(err.message);
      socket.emit('sendBook', sendBook);
      socket.broadcast.emit('sendBook', sendBook);
    });
  });
  
  socket.on('removeCover', function (isbn) {
    delete activeStates[isbn];
    socket.emit('removeCover', isbn);
    socket.broadcast.emit('removeCover', isbn);
    fs.writeFileSync(infoPath, JSON.stringify(activeStates));
  });
  
  socket.on('moveCover', function (data) {
    socket.emit('moveCover', data);
    socket.broadcast.emit('moveCover', data);
  });
  
  socket.on('placeCover', function (data) {
    activeStates[data.isbn].coord = trimCoord({x: data.x, y: data.y});
    fs.writeFileSync(infoPath, JSON.stringify(activeStates));
    socket.emit('placeCover', data);
    socket.broadcast.emit('placeCover', data);
  });
  
  socket.on('update', function (data) {
    socket.broadcast.emit('update', data);
  });
});
