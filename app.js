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
var COVER_MAX = 32;
var RAKUTEN_URL = 'https://app.rakuten.co.jp/services/api/BooksTotal/Search/20130522?';
var activeStates = {};
var loadedState;

function writeActiveState() {
  console.log('writeActiveState');
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
    trimmed = str.slice(0, 15) + '…';
  }
  return trimmed;
}

function trimCoord(coord) {
  for (k in coord) {
    coord[k] = Math.round(Math.min(Math.max(coord[k], -128), 128));
  }
  return coord;
}

io.on('connection', function (socket) {
  console.log('connected');
  for (var roomId in activeStates) {
    socket.emit('appendRoom', roomId);
  }
  socket.emit('vacancy', (Object.keys(activeStates).length < ROOM_MAX));
  socket.on('signIn', function (roomId) {
    console.log('sign in ' + roomId);
    socket.room = roomId;
    socket.join(roomId);
    if (activeStates.hasOwnProperty(roomId)) {
      socket.emit('signIn', activeStates[roomId]);
    }
    else {
      activeStates[roomId] = {
        covers: {},
        axis: {}
      };
      socket.emit('appendRoom', roomId);
      socket.emit('vacancy', (Object.keys(activeStates).length < ROOM_MAX));
      writeActiveState();
    }
  });

  socket.on('signOut', function (roomId) {
    socket.emit('vacancy', (Object.keys(activeStates).length < ROOM_MAX));
    socket.leave(roomId);
  });

  socket.on('removeRoom', function (roomId) {
    if (activeStates.hasOwnProperty(roomId)) {
      delete activeStates[roomId];
      writeActiveState();
      socket.emit('removeRoom', roomId);
      socket.to(roomId).emit('removeRoom', roomId);
    }
  });

  socket.on('disconnect', function () {
    console.log('disconnected');
    socket.leave(roomId);
  });

  socket.on('wait', function (roomId) {
    socket.to(roomId).emit('wait');
  })

  socket.on('go', function (roomId) {
    socket.to(roomId).emit('go');
  })

  socket.on('axis', function (roomId, dir, val) {
    activeStates[roomId].axis[dir] = val;
    writeActiveState();
    socket.emit('axis', roomId, dir, val);
    socket.to(roomId).emit('axis', roomId, dir, val);
  });

  socket.on('getBook', function (roomId, val) {
    console.log('getBook', val);
    Promise.resolve().then(function () {
      return checkDB(val);
    }).then(function (checked) {
      if (checked.exists) {
        return Promise.resolve(checked);
      }
      else if (checked.type == 'isbn') {
        return Promise.resolve().then(function () {
          return fetchBook(val);
        }).then(function (item) {
          return insertDB(item);
        });
      }
      else if (checked.type = 'title') {
        return setDummy(val);
      }
    }).then(function (item) {
      if (fs.existsSync(path.join('tmp', val + '.jpg'))) {
        return Promise.resolve(item);
      }
      else {
        return Promise.resolve().then(function () {
          return saveTmpImage(item.isbn);
        }).then(function () {
          return Promise.resolve(item);
        });
      }
    }).then(function (item) {
      return sendCover(roomId, getCoord(roomId, val), item);
    }).then(function (state) {
      saveState(roomId, state);
    });
  });

  function checkQuantity(roomId) {
    console.log('checkQuantity', roomId);
    if (Object.keys(activeStates[roomId].covers).length < COVER_MAX) {
      return true;
    } else {
      return false;
    }
  }
  
  function checkDB(val) {
    console.log('checkDB', val);
    return new Promise(function (resolve) {
      var type, exists;
      pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
        if (val.match(/\d{13}/)) {
          type = 'isbn';
          pg_client.query('SELECT * FROM book WHERE isbn = $1', [val], function (err, result) {
            done();
            exists = result.rows.length ? true : false;
            if (exists) {
              var item = result.rows[0];
              resolve({
                type: type,
                exists: exists,
                isbn: val,
                title: item.title,
                url: item.url,
                link: item.link
              });
            }
            else {
              resolve({
                type: type,
                exists: exists,
                isbn: val
              });
            }
          });
        }
        else {
          type = 'title';
          pg_client.query('SELECT * FROM book WHERE title = $1', [val], function (err, result) {
            done();
            exists = result.rows.length ? true : false;
            if (exists) {
              var item = result.rows[0];
              resolve({
                type: type,
                exists: exists,
                isbn: item.isbn,
                title: item.title,
                url: item.url,
                link: item.link
              });
            }
            else {
              resolve({
                type: type,
                exists: exists,
                isbn: val
              });
            }
          });
        }
      });
    });
  }

  function fetchBook(isbn) {
    console.log('fetchBook', isbn);
    return new Promise(function (resolve, reject) {
      var par = {
        'applicationId': process.env.RAKUTEN_APP_ID,
        'isbnjan': isbn,
        'outOfStockFlag': 1
      }
      https.get(RAKUTEN_URL + querystring.stringify(par), function (res) {
        var body = '';
        res.on('data', function (chunk) {
          body += chunk;
        });
        res.on('end', function () {
          var response = JSON.parse(body);
          console.log(response);
          if (response.hasOwnProperty('Items') && response.Items.length) {
            var item = response.Items[0].Item;
            resolve({
              isbn: item.isbn,
              title: trimTitle16(item.title),
              url: item.mediumImageUrl,
              link: item.itemUrl
            });
          }
          else {
            reject();
          }
        });
      });
    });
  }

  function insertDB(item) {
    console.log('insertDB', item);
    return new Promise(function (resolve) {
      pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
        pg_client.query('INSERT INTO book (isbn, title, url, link) VALUES ($1, $2, $3, $4)', [item.isbn, item.title, item.url, item.link], function (err, result) {
          if (err) console.log(err);
          done();
          console.log('book saved in DB.');
          resolve(item);
        });
      });
    });
  }

  function setDummy(val) {
    console.log('setDummy', val);

    function fillZero(number, digits) {
      var zeros = new Array(digits + 1).join('0');
      return (zeros + number).slice(-digits);
    }
    return new Promise(function (resolve, reject) {
      pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
        var i = 0;
        var isbn = fillZero(i, 13);
        pg_client.query('SELECT isbn FROM book', function (err, result) {
          done();
          var existingIsbns = result.rows.map(function (row) {
            return row.isbn;
          });
          while (existingIsbns.indexOf(isbn) >= 0) {
            i = i + 1;
            isbn = fillZero(i, 13);
          }
          pg_client.query('INSERT INTO book (isbn, title, url, link) VALUES ($1 ,$2, $3)', [isbn, val, undefined, undefined], function (err, result) {
            done();
            resolve({
              isbn: isbn,
              title: val,
              url: undefined,
              link: undefined
            });
          });
        });
      });
    });
  }

  function saveTmpImage(isbn) {
    console.log('saveTmpImage', isbn);
    return new Promise(function (resolve, reject) {
      pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
        pg_client.query('SELECT * FROM book WHERE isbn = $1', [isbn], function (err, result) {
          done();
          var item = result.rows[0];
          var url = item.url ? item.url : 'http://localhost:' + port + '/images/dummy.jpg';
          console.log(url);
          http.get(url, function (res) {
            var imageData = ''
            res.setEncoding('binary');
            res.on('data', function (chunk) {
              imageData += chunk;
            });
            res.on('end', function () {
              fs.writeFileSync(path.join('tmp', item.isbn + '.jpg'), imageData, 'binary');
              resolve(isbn);
            });
          });
        });
      });
    });
  }

  function getCoord(roomId, isbn) {
    console.log('getCoord', isbn);
    var coord = {
      x: 0,
      y: 0
    };
    if (roomId) {
      if (activeStates[roomId].covers.hasOwnProperty(isbn)) {
        coord = activeStates[roomId].covers[isbn].coord;
      } else if (loadedState && loadedState.covers.hasOwnProperty(isbn)) {
        coord = loadedState.covers[isbn].coord;
      }
    }
    else if (loadedState && loadedState.covers.hasOwnProperty(isbn)) {
      coord = loadedState.covers[isbn].coord;
    }
    return coord;
  }

  function sendCover(roomId, coord, item) {
    console.log('sendCover', item.isbn);
    var imagePath = path.join('tmp', item.isbn + '.jpg');
    return new Promise(function (resolve, reject) {
      fs.readFile(imagePath, function (err, buffer) {
        var cover = {
          buffer: buffer.toString('base64'),
          title: item.title,
          isbn: item.isbn,
          coord: coord,
          link: item.link
        };
        if (roomId) {
          socket.emit('sendCover', cover);
          socket.to(roomId).emit('sendCover', cover);
        }
        else {
          socket.emit('sendCover', cover);
        }
        var state = {
          isbn: cover.isbn,
          title: cover.title,
          coord: coord
        };
        resolve(state);
      });
    });
  }

  function saveState(roomId, state) {
    console.log('saveState', state.isbn);
    return new Promise(function (resolve, reject) {
      if (!activeStates[roomId].covers.hasOwnProperty(state.isbn)) {
        activeStates[roomId].covers[state.isbn] = {};
      }
      activeStates[roomId].covers[state.isbn].title = state.title;
      activeStates[roomId].covers[state.isbn].coord = state.coord;
      writeActiveState();
      resolve(true);
    });
  }

  function sendMessage(mes) {
    socket.emit('message', mes);
  }

  socket.on('removeCover', function (roomId, isbn) {
    if (activeStates[roomId].covers.hasOwnProperty(isbn)) {
      delete activeStates[roomId].covers[isbn];
    }
    socket.emit('removeCover', isbn);
    socket.to(roomId).emit('removeCover', isbn);
    writeActiveState();
  });

  socket.on('moveCover', function (roomId, data) {
    socket.emit('moveCover', data);
    socket.to(roomId).emit('moveCover', data);
  });

  socket.on('placeCover', function (roomId, data) {
    console.log('placeCover', data.isbn);
    if (activeStates[roomId].covers.hasOwnProperty(data.isbn)) {
      activeStates[roomId].covers[data.isbn].coord = trimCoord({
        x: data.x,
        y: data.y
      });
      writeActiveState();
      socket.emit('placeCover', data);
      socket.to(roomId).emit('placeCover', data);
    }
  });

  socket.on('save', function (roomId) {
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
      var id = genRandId(8);
      pg_client.query('SELECT id FROM state', function (err, result) {
        done();
        var existingIds = result.rows.map(function (row) {
          return row.id;
        });
        while (existingIds.indexOf(id) >= 0) {
          id = genRandId(8);
        }
        pg_client.query('INSERT INTO state (id, state) VALUES ($1 ,$2)', [id, JSON.stringify(activeStates[roomId])]);
        socket.emit('save', id);
        done();
      });
    });
  });

  socket.on('load', function (id) {
    console.log('load', id);
    pg.connect(process.env.DATABASE_URL + '?ssl=true', function (err, pg_client, done) {
      pg_client.query('SELECT id FROM state', function (err, result) {
        done();
        var existingIds = result.rows.map(function (row) {
          return row.id
        });
        if (existingIds.indexOf(id) >= 0) {
          pg_client.query("SELECT state FROM state WHERE id = $1", [id], function (err, result) {
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
