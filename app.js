var express = require('express'),
  http = require('http'),
  https = require('https'),
  path = require('path'),
  fs = require('fs'),
  querystring = require('querystring'),
  app = express(),
  server = http.createServer(app),
  routes = require('./routes'),
  io = require('socket.io').listen(server),
  pg = require('pg');

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

var DB = 'bkmpr';
var ROOM_MAX = 6;
var COVERS_MAX = 4;
var RAKUTEN_URL = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';
var activeStates = {};

function writeActiveState() {
  fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
}

if (fs.existsSync('tmp/activeStates.json')) {
  activeStates = JSON.parse(fs.readFileSync('tmp/activeStates.json', 'utf-8'));
}
else {
  writeActiveState();
}

function trimTitle32(str) {
  var trimmed = str;
  if (str.length > 32) {
    trimmed = str.slice(0, 32) + '…';
  }
  return trimmed;
}

function trimCoord(coord) {
  for (k in coord) {
    coord[k] = Math.round(Math.min(Math.max(coord[k], -128), 128));
  }
  return coord;
}

var socket = io.on('connection', function (client) {
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
    client.room = roomId;
    client.join(roomId);
    if (activeStates.hasOwnProperty(roomId)) {
      client.emit('signIn', activeStates[roomId]);
    }
    else {
      activeStates[roomId] = {
        covers: {},
        axis: {}
      };
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

  Client.on('signOut', function (roomId) {
    client.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.leave(roomId);
  });

  client.on('removeRoom', function (roomId) {
    if (existingRooms.indexOf(roomId) > 0) {
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
    socket.to(roomId).emit('wait');
  })

  client.on('go', function (roomId) {
    socket.to(roomId).emit('go');
  })

  client.on('axis', function (roomId, dir, val) {
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
      if (Object.keys(activeStates[roomId].covers).length < COVERS_MAX) {
        return isbn;
      }
      else {
        return false;
      }
    }).then(function (resolve, reject) {
      if (!book) {
        book = fetchUrl(resolve)
      }
      return book;
    }).then(function (resolve, reject) {
      if (fs.existsSync(imagePath)) {
        return book;
      }
      else {
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
          'applicationId': process.env.RAKUTEN_APP_ID,
          'isbnjan': isbn
        }
        https.get(RAKUTEN_URL + querystring.stringify(par), function (res) {
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

    function saveImage(item) {
      return new Promise(function (resolve, reject) {
        http.get(item.url, function (res) {
          var imageData = ''
          res.setEncoding('binary');
          res.on('data', function (chunk) {
            imageData += chunk;
          });
          res.on('end', function () {
            fs.writeFileSync(imagePath, imageData, 'binary');
            resolve({
              title: item.title,
              url: item.url
            });
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
          socket.to(roomId).emit('sendCover', cover);
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
        resolve(true);
      });
    }
  });

  client.on('removeCover', function (roomId, isbn) {
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].covers.hasOwnProperty(isbn)) {
      delete activeStates[roomId].covers[isbn];
    }
    socket.to(roomId).emit('removeCover', isbn);
    writeActiveState();
  });

  client.on('moveCover', function (roomId, data) {
    socket.to(roomId).emit('moveCover', data);
  });

  client.on('placeCover', function (roomId, data) {
    if (activeStates.hasOwnProperty(roomId) && activeStates[roomId].covers.hasOwnProperty(data.isbn)) {
      activeStates[roomId].covers[data.isbn].coord = trimCoord({
        x: data.x,
        y: data.y
      });
      writeActiveState();
      socket.to(roomId).emit('placeCover', data);
    }
  });

  client.on('save', function (roomId) {
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client) {
      var id = genId(8);
      var existingIds = [];
      var query = pg_client.query('select id from ' + DB + ';');
      query.on('row', function (row) {
        existingIds.push(row.id);
      });
      query.on('end', function (row, err) {
        while (existingIds.indexOf(id) >= 0) {
          id = genId(8);
        }
        pg_client.query("insert into " + DB + " (id, covers) values ('" + id + "','" + JSON.stringify(activeStates[roomId]) + "');");
        client.emit('save', id);
      });
    });
  });

  client.on('load', function (id) {
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client) {
      var existingIds = [];
      var query = pg_client.query('select id from ' + DB + ';');
      query.on('row', function (row) {
        existingIds.push(row.id);
      });
      query.on('end', function (row, err) {
        if (existingIds.indexOf(id) >= 0) {
          var _ = pg_client.query("select covers from " + DB + " where id='" + id + "';");
          _.on('row', function (row) {
            console.log(row.covers);
          });
        }
      });
    });
  });

  function genId(len) {
    var c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var cl = c.length;
    var r = '';
    for (var i = 0; i < len; i++) {
      r += c[Math.floor(Math.random() * cl)];
    }
    return r;
  }
});
