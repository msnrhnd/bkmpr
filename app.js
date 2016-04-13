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
    io = require('socket.io').listen(server),
    co = require('co');

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
    coord[k] = Math.round(Math.min( Math.max(coord[k], -128), 128));
  }
  return coord;
}

var rakuten_url = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';

try {
  var activeStates = JSON.parse(fs.readFileSync('tmp/activeStates.json', 'utf-8'));
} catch (err) {
  var activeStates = {};
}
var activeRooms = [];
for (var roomId in activeStates) {
  activeRooms.push(roomId);
}

var chat = io.sockets.on('connection', function (socket) {
  console.log('connected');
  socket.emit('activeRooms', activeRooms);
  socket.on('init', function (roomId) {
    socket.set('room', roomId);
    socket.join(roomId);
    if(activeStates.hasOwnProperty(roomId)){
      chat.to(roomId).emit('init', activeStates[roomId]);
    } else {
      activeStates[roomId] = {};
      activeRooms.push(roomId);
    }
  })
  
  socket.on('sign-out', function (roomId) {
    socket.leave(roomId);
  });
  
  socket.on('disconnect', function (socket) {
    console.log('disconnected');
  });
  
  socket.on('wait', function (roomId) {
    chat.to(roomId).emit('wait');
  })

  socket.on('go', function (roomId) {
    chat.to(roomId).emit('go');
  })

  socket.on('getBook', function (roomId, isbn, coord) {
    async.waterfall([
      function (callback) {
        var title = imageURL = '';
        var par = {
          'applicationId': '1072038232996204187',
          'isbnjan': isbn
        }
        if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].hasOwnProperty(isbn)) {
          title = activeStates[roomId][isbn].title;
          imageURL = activeStates[roomId][isbn].imageURL;
          socket.emit('emitLog', 'data from tmp');
          callback(null, isbn, imageURL, title);
        } else {
          socket.emit('emitLog', 'data from rakuten');
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
                activeStates[roomId][isbn] = {};
                activeStates[roomId][isbn].title = title;
                activeStates[roomId][isbn].imageURL = imageURL;
                activeStates[roomId][isbn].coord = trimCoord(coord);
                fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
                callback(null, isbn, imageURL, title);
              }
              catch (err) {
                socket.emit('emitLog', err.message);
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
          socket.emit('emitLog', 'image data from rakuten');
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
                callback(null, isbn, imagePath, title);
              });
            })
          }).on('error', function (err) {
            console.log(err.message);
          });
        }
        else {
          socket.emit('emitLog', 'image data from tmp');
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
      }], function (err, sendBook) {
        if (err) console.log(err.message);
        chat.to(roomId).emit('sendBook', sendBook);
      });
  });
  
  socket.on('removeCover', function (roomId, isbn) {
    console.log(roomId, isbn);
    console.log('now', activeStates);
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].hasOwnProperty(isbn)) {
      delete activeStates[roomId][isbn];
    }
    chat.to(roomId).emit('removeCover', isbn);
    fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
  });
  
  socket.on('moveCover', function (roomId, data) {
    chat.to(roomId).emit('moveCover', data);
  });
  
  socket.on('placeCover', function (roomId, data) {
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].hasOwnProperty(data.isbn)) {
    activeStates[roomId][data.isbn].coord = trimCoord({x: data.x, y: data.y});
    fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
      chat.to(roomId).emit('placeCover', data);
    }
  });
});

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

co(function*() {
  for (var i = 0; i<5; i++) {
    console.log(i);
    yield sleep(1000);
  }
});









