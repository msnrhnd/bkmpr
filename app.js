var express = require('express'),
  routes = require('./routes'),
  user = require('./routes/user'),
  http = require('http'),
  https = require('https'),
  path = require('path'),
  fs = require('fs'),
  querystring = require('querystring'),
  app = express(),
  server = http.createServer(app),
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
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function () {
  app.use(express.errorHandler());
});

app.get('/', routes.index);

io.sockets.on('connection', function (socket) {
  console.log('connected');
  socket.on('getBook', function (isbn) {
    getBook(isbn, function (bookInfo) {
      fs.readFile(bookInfo.coverPath, function(e, buffer){
        var sendBook = {buffer: buffer.toString('base64'), bookInfo: bookInfo};
        socket.emit('sendBook', sendBook);
        socket.broadcast.emit('sendBook', sendBook);
//        socket.send(data, { 'Content-Type': 'image/jpeg' }, 200);
      });
    });
  });
  socket.on('removeCover', function (data) {
    socket.broadcast.emit('removeCover', data);
  });
  socket.on('moveCover', function (data) {
    socket.broadcast.emit('moveCover', data);
  });
});

function getBook(isbn, callback) {
  var bookInfo;
  var coverPath = path.join('tmp', isbn + '.jpg');
  var query = {
    applicationId: '1072038232996204187',
    isbnjan: isbn
  }
  var url = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?' + querystring.stringify(query);
  https.get(url, function (res) {
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      bookInfo = JSON.parse(body)['Items'][0]['Item'];
      if (!fs.existsSync(coverPath)) {
        var outFile = fs.createWriteStream(coverPath);
        http.get(bookInfo['mediumImageUrl'], function (res) {
          var imagedata = ''
          res.setEncoding('binary');
          res.on('data', function (chunk) {
            imagedata += chunk;
          });
          res.on('end', function () {
            fs.writeFile(coverPath, imagedata, 'binary', function (e) {
              if (e) throw e;
              console.log('File saved.');
              bookInfo.coverPath = coverPath;
              callback(bookInfo);
            });
          })
        }).on('error', function (e) {
          console.log(e.message);
        });
      } else {
        bookInfo.coverPath = coverPath;
        callback(bookInfo);
      }
    });
  }).on('error', function (e) {
    console.log(e.message);
  });
}
