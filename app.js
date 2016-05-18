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

var ROOM_MAX = 6;
//var COVERS_MAX = 4;
var RAKUTEN_URL = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';
var activeStates = {};
var loadedState;

function writeActiveState() {
  fs.writeFileSync('tmp/activeStates.json', JSON.stringify(activeStates));
}

if (fs.existsSync('tmp/activeStates.json')) {
  activeStates = JSON.parse(fs.readFileSync('tmp/activeStates.json', 'utf-8'));
}
else {
  writeActiveState();
}

function trimTitle16(str) {
  var trimmed = str;
  if (str.length > 16) {
    trimmed = str.slice(0, 16) + '…';
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
    console.log('sign in ' + roomId);
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

  client.on('signOut', function (roomId) {
    client.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.broadcast.emit('vacancy', (existingRooms.length < ROOM_MAX));
    client.leave(roomId);
  });

  client.on('removeRoom', function (roomId) {
    if (existingRooms.indexOf(roomId) >= 0) {
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

  client.on('getBook', function (roomId, isbn) {
    console.log('getBook', isbn);
    Promise.resolve(isbn).then(function (isbn) {
      return checkBook(isbn);
    }).then(function (item) {
      return item;
    }, function (isbn) {
      return fetchBook(isbn);
    }).then(function (image) {
      return checkImage(image);
    }, function (error) {
      return false;
    }).then(function (item) {
      return item;
    }, function (item) {
      return saveImage(item);
    }).then(function (cover) {
      return sendCover(roomId, getCoord(roomId, isbn), cover);
    }).then(function (state) {
      return saveState(roomId, getCoord(roomId, isbn), state);
    });
  });
  
  function checkBook(isbn) {
    console.log('checkBook', isbn);
    return new Promise(function (resolve, reject) {
      pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
        if (err) console.log(err);
        pg_client.query('SELECT * FROM book where isbn = $1', [isbn], function(err, result) {
          done();
          if (result.rows.length) {
            var item = result.rows[0];
            item.isbn = isbn;
            resolve(item);
          } else {
            reject(isbn);
          };
        });
      });
    });
  }
  
  function fetchBook(isbn) {
    console.log('fetchBook', isbn);
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
          if (response.hasOwnProperty('Items') && response.Items.length) {
            var item = response.Items[0].Item;
            pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
              pg_client.query('INSERT INTO book (isbn, title, url) VALUES ($1 ,$2, $3)', [isbn, trimTitle16(item.title), item.mediumImageUrl] ,function(err, result) {
                done();
                console.log('book saved.');
              });
            });
            resolve({
              title: trimTitle16(item.title),
              url: item.mediumImageUrl,
              isbn: isbn
            });
          }
          else {
            reject(response.error);
          }
        });
      });
    });
  }

  function checkImage(item) {
    console.log('checkImage', item.isbn);
    var imagePath = path.join('tmp', item.isbn + '.jpg');
    return new Promise(function (resolve, reject) {
      if (fs.existsSync(imagePath)) {
        resolve(item);
      } else {
        reject(item);
      }
    });
  };
 
  function saveImage(item) {
    console.log('saveImage', item.isbn);
    var imagePath = path.join('tmp', item.isbn + '.jpg');
    return new Promise(function (resolve, reject) {
      http.get(item.url, function (res) {
        var imageData = ''
        res.setEncoding('binary');
        res.on('data', function (chunk) {
          imageData += chunk;
        });
        res.on('end', function () {
          fs.writeFileSync(imagePath, imageData, 'binary');
          var cover = {
            title: item.title,
            isbn: item.isbn
          };
          resolve(cover);
        });
      });
    });
  }

  function getCoord(roomId, isbn) {
    console.log('getCoord', isbn);
    var coord = {x: 0, y: 0};
    if (roomId) {
      coord = activeStates[roomId].covers[isbn].coord;
    } else {
      coord = loadedState.covers[isbn].coord;
    }
    return coord;
  }
  
  function sendCover(roomId, coord, image) {
    console.log('sendCover', image.isbn);
    var imagePath = path.join('tmp', image.isbn + '.jpg');
    return new Promise(function (resolve, reject) {
      fs.readFile(imagePath, function (err, buffer) {
        var cover = {
          buffer: buffer.toString('base64'),
          title: image.title,
          isbn: image.isbn,
          coord: coord
        };
        if (roomId) {
          socket.to(roomId).emit('sendCover', cover);
        }
        else {
          socket.emit('sendCover', cover);
        }
        var state = {
          isbn: cover.isbn,
          title: cover.title
        };
        resolve(state);
      });
    });
  }

  function saveState(roomId, coord, state) {
    console.log('saveState', state.isbn);
    return new Promise(function (resolve, reject) {
      if (!activeStates[roomId].covers.hasOwnProperty(state.isbn)) {
        activeStates[roomId].covers[state.isbn] = {};
      }
      activeStates[roomId].covers[state.isbn].title = state.title;
      activeStates[roomId].covers[state.isbn].coord = coord;
      writeActiveState();
      resolve(true);
    });
  }

  client.on('removeCover', function (roomId, isbn) {
    if (activeStates[roomId].covers.hasOwnProperty(isbn)) {
      delete activeStates[roomId].covers[isbn];
    }
    socket.to(roomId).emit('removeCover', isbn);
    writeActiveState();
  });

  client.on('moveCover', function (roomId, data) {
    socket.to(roomId).emit('moveCover', data);
  });

  client.on('placeCover', function (roomId, data) {
    if (activeStates[roomId].covers.hasOwnProperty(data.isbn)) {
      activeStates[roomId].covers[data.isbn].coord = trimCoord({
        x: data.x,
        y: data.y
      });
      writeActiveState();
      socket.to(roomId).emit('placeCover', data);
    }
  });

  client.on('save', function (roomId) {
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
      var id = genRandId(8);
      pg_client.query('SELECT id FROM state', function (err, result) {
        done();
        var existingIds = result.rows.map(function (row) {
          return row.id
        });
        while (existingIds.indexOf(id) >= 0) {
          id = genRandId(8);
        }
        pg_client.query('INSERT INTO state (id, state) VALUES ($1 ,$2)', [id, JSON.stringify(activeStates[roomId])]);
        done();
        client.emit('save', id);
      });
    });
  });

  client.on('load', function (id) {
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
      pg_client.query('SELECT id FROM state', function (err, result) {
        done();
        var existingIds = result.rows.map(function (row) {
          return row.id
        });
        if (existingIds.indexOf(id) >= 0) {
          pg_client.query("SELECT state FROM state WHERE id=($1)", [id], function (err, result) {
            done();
            loadedState = result.rows[0].state;
            socket.emit('load', id, loadedState);
          });
        }
      });
    });
  });

  function genRandId(len) {
    var c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var cl = c.length;
    var r = '';
    for (var i = 0; i < len; i++) {
      r += c[Math.floor(Math.random() * cl)];
    }
    return r;
  }
});
