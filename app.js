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
//  app.use(app.router);
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

var rakuten_url = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';
var infoPath = 'tmp/activeStates.json';

io.sockets.on('connection', function (socket) {
  console.log('connected');
  var activeStates = {};
  socket.on('getBook', function (isbn) {
    async.waterfall([
      function (callback) {
        var title = imageURL = '';
        var par = {
          'applicationId': '1072038232996204187',
          'isbnjan': isbn
        }
        title = activeStates[isbn].title;
        imageURL = activeStates[isbn].imageURL;
        callback(null, imageURL, title);
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
              activeStates.push({
                title: title,
                imageURL: imageURL,
                isbn: isbn,
                x: 0,
                y: 0
              });
              fs.writeFileSync(infoPath, JSON.stringify(activeStates));
              callback(null, imageURL, title);
            }
            catch (err) {
              console.log(err.message);
            }
          });
        });
      },
        function (imageURL, title, callback) {
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
                  callback(null, imagePath, title);
                });
              })
            }).on('error', function (err) {
              console.log(err.message);
            });
          }
          else {
            callback(null, imagePath, title);
          };
        },
        function (imagePath, title, callback) {
          fs.readFile(imagePath, function (e, buffer) {
            var sendBook = {
              buffer: buffer.toString('base64'),
              title: title,
              isbn: isbn
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
    socket.broadcast.emit('removeCover', isbn);
  });
  socket.on('moveCover', function (data) {
    socket.broadcast.emit('moveCover', data);
  });
  socket.on('placeCover', function (data) {
    socket.broadcast.emit('placeCover', data);
  });
  socket.on('update', function (data) {
    socket.broadcast.emit('update', data);
  });
});
