var express = require('express'),
  routes = require('./routes'),
  user = require('./routes/user'),
  http = require('http'),
  path = require('path'),
  fs = require('fs'),
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
app.get('/users', user.list);

io.sockets.on('connection', function (socket) {
  console.log('connected');
  socket.on('getCover', function (data) {
    var coverURL = getCover(data.mediumImageUrl, data.isbn);
    fs.readFile(coverURL, function (err, buf) {
      socket.emit('image', { image: true, buffer: buf.toString('base64'), title: data.title, isbn: data.isbn });
      socket.broadcast.emit('image', { image: true, buffer: buf.toString('base64'), title: data.title, isbn: data.isbn });
    });
  });
  socket.on('removeCover', function (data) {
    socket.broadcast.emit('removeCover', data);
  });
  socket.on('moveCover', function (data) {
    socket.broadcast.emit('moveCover', data);
  });

});

function getCover(url, isbn) {
  var outPath = path.join(__dirname, 'tmp', isbn + '.jpg');
//  var outPath = path.join(__dirname, '..', 'tmp', isbn + '.jpg');
  if (!fs.existsSync(outPath)) {
    var outFile = fs.createWriteStream(outPath);
    var req = http.get(url, function (res) {
      res.pipe(outFile);
      res.on('end', function () {
        outFile.close();
      });
    });
    req.on('error', function (err) {
      console.log('Error: ', err);
      return;
    });
    var res = http.get(url, function (res) {
      res.pipe(outFile);
      res.on('end', function () {
        outFile.close();
      });
    });
  }
  return outPath;
}

