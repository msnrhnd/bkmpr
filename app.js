var express = require('express'),
    http = require('http'),
    https = require('https'),
    path = require('path'),
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

var ROOM_MAX = 4;
function writeActiveState () {
  fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
}

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
var activeStates;
if (fs.existsSync('tmp/activeStates.json')) {
  activeStates = JSON.parse(fs.readFileSync('tmp/activeStates.json', 'utf-8'));
} else {
  activeStates = {};
  writeActiveState();
}

var chat = io.sockets.on('connection', function (client) {
  console.log('connected');
  var existingRooms = [];
  for (var roomId in activeStates) {
    client.emit('appendRoom', roomId);
    client.broadcast.emit('appendRoom', roomId);
    existingRooms.push(roomId);
  }
  client.emit('vacancy', (existingRooms.length < ROOM_MAX));
  client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
  client.on('signIn', function (roomId) {
    client.set('room', roomId);
    client.join(roomId);
    if (activeStates.hasOwnProperty(roomId)) {
      client.emit('signIn', activeStates[roomId]);
    } else {
      activeStates[roomId] = {covers: {}, axis: {}};
      writeActiveState();
    }
    if (existingRooms.indexOf(roomId) < 0) {
      existingRooms.push(roomId);
      client.emit('appendRoom', roomId);
      client.broadcast.emit('appendRoom', roomId);
      client.emit('vacancy', (existingRooms.length < ROOM_MAX));
      client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
    }
  })

  client.on('signOut', function (roomId) {
    client.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.leave(roomId);
  });

  client.on('removeRoom', function (roomId) {
    if ( existingRooms.indexOf(roomId) > 0) {
      existingRooms.splice(existingRooms.indexOf(roomId), 1);
    }
    client.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.emit('removeRoom', roomId);
    client.broadcast.emit('removeRoom', roomId);
    if (activeStates.hasOwnProperty(roomId)) {
      delete activeStates[roomId];
      writeActiveState();
    }
  });

  client.on('disconnect', function () {
    console.log('disconnected');
    client.leave(roomId);
  });
  
  client.on('wait', function (roomId) {
    chat.to(roomId).emit('wait');
  })

  client.on('go', function (roomId) {
    chat.to(roomId).emit('go');
  })

  client.on('axis', function(roomId, dir, val) {
    activeStates[roomId].axis[dir] = val;
    writeActiveState();
    client.emit('axis', dir, val);
    client.broadcast.emit('axis', dir, val);
  });
    
  client.on('getBook', function (roomId, isbn, coord) {
    var book;
    var imagePath = path.join('tmp', isbn + '.jpg');
    if (activeStates[roomId].covers.hasOwnProperty(isbn)) {
      book = activeStates[roomId].covers[isbn];
    }
    Promise.resolve(isbn).then(function (resolve, reject) {
      if (!book) {
        book = fetchUrl(resolve)
      }
      return book;
    }).then(function (resolve, reject) {
      if (fs.existsSync(imagePath)) {
        return book;
      } else {
        return saveImage(resolve);
      }
    }).then(function (resolve, reject) {
      return sendCover(resolve);
    }).then(function (resolve, reject) {
      return saveBook(resolve);
    });
    
    function fetchUrl() {
      return new Promise(function (resolve, reject) {
        var par = {
          'applicationId': '1072038232996204187',
          'isbnjan': isbn
        }
        https.get(rakuten_url + querystring.stringify(par), function (res) {
          var body = '';
          res.on('data', function (chunk) {
            body += chunk;
          });
          res.on('end', function () {
            var response = JSON.parse(body);
            if (response.hasOwnProperty('Items')) {
              var item = response.Items[0].Item;
              resolve({
                title: trimTitle32(item.title),
                url: item.mediumImageUrl
              });
            }
            else if (response.hasOwnProperty('error')) {
              reject(response.error);
            }
          });
        });
      });
    }

    function saveImage (item) {
      return new Promise(function (resolve, reject) {
        http.get(item.url, function (res) {
          var imageData = ''
          res.setEncoding('binary');
          res.on('data', function (chunk) {
            imageData += chunk;
          });
          res.on('end', function () {
            fs.writeFileSync(imagePath, imageData, 'binary');
            resolve({title: item.title, url: item.url});
          });
        });
      });
    }

    function sendCover(image) {
      return new Promise(function (resolve, reject) {
        fs.readFile(imagePath, function (err, buffer) {
          var cover = {
            buffer: buffer.toString('base64'),
            title: image.title,
            isbn: isbn,
            url: image.url,
            coord: coord
          };
          chat.to(roomId).emit('sendCover', cover);
          resolve(cover);
        });
      });
    }

    function saveBook(cover) {
      return new Promise(function (resolve, reject) {
        if (!activeStates[roomId].covers.hasOwnProperty(isbn)) {
          activeStates[roomId].covers[isbn] = {};
        }
        activeStates[roomId].covers[isbn].title = cover.title;
        activeStates[roomId].covers[isbn].url = cover.url;
        activeStates[roomId].covers[isbn].coord = coord;
        writeActiveState();
      });
    }
  });
  
  client.on('removeCover', function (roomId, isbn) {
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].covers.hasOwnProperty(isbn)) {
      delete activeStates[roomId].covers[isbn];
    }
    chat.to(roomId).emit('removeCover', isbn);
    writeActiveState();
  });

  client.on('moveCover', function (roomId, data) {
    chat.to(roomId).emit('moveCover', data);
  });
  
  client.on('placeCover', function (roomId, data) {
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].covers.hasOwnProperty(data.isbn)) {
      activeStates[roomId].covers[data.isbn].coord = trimCoord({x: data.x, y: data.y});
      writeActiveState();
      chat.to(roomId).emit('placeCover', data);
    }
  });
});
