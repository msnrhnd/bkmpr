var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    https = require('https'),
    path = require('path'),
    fs = require('fs'),
    querystring = require('querystring'),
    async = require('async'),
    apac = require('apac'),
    app = express(),
    server = http.createServer(app),
    util = require('util'),
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

var OperationHelper = apac.OperationHelper;
var opHelper = new OperationHelper({
  endPoint: 'ecs.amazonaws.jp',
  awsId: 'AKIAJAXY6SYZOMEV2XTQ',
  awsSecret: '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',
  assocId: 'msnrhnd04-22'
});
var itemInfoPath = 'tmp/itemInfo.json';
var itemJSON = {};

io.sockets.on('connection', function (socket) {
  console.log('connected');
  socket.on('getItem', function (asin) {
    getItem(asin, function (data) {
      fs.readFile(data.imagePath, function(e, buffer){
        var sendItem = {buffer: buffer.toString('base64'), itemInfo: data};
        socket.emit('sendItem', sendItem);
        socket.broadcast.emit('sendItem', sendItem);
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

function getItem(asin, callback) {
  async.waterfall([
    function (callback) {
      var title = imageURL = '';
      if (itemJSON.hasOwnProperty(asin)) {
        title = itemJSON[asin].title;
        imageURL = itemJSON[asin].imageURL;
        callback(null, imageURL, title);
      } else {
        opHelper.execute('ItemLookup', {
          'ItemId': asin,
          'MechantId': 'All',
          'Condition': 'All',
          'ResponseGroup': 'Medium'
        }, function (err, res) {
          if (err) {
            console.log(err.message);
          } else {
            title = res.ItemLookupResponse.Items[0].Item[0].ItemAttributes[0].Title[0];
            imageURL = res.ItemLookupResponse.Items[0].Item[0].MediumImage[0].URL[0];
            itemJSON[asin] = {
              title: title,
              imageURL: imageURL
            };
            fs.writeFileSync(itemInfoPath, JSON.stringify(itemJSON));
            callback(null, imageURL, title);
          }
        });
      }
    }, function (imageURL, title, callback) {
      var imagePath = path.join('tmp', asin + '.jpg');
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
              if (err) console.log(err);
              console.log('File saved.');
              callback(null, imagePath, title);
            });
          })
        }).on('error', function (err) {
          console.log(e.rrmessage);
        });
      } else {
        callback(null, imagePath, title);
      };
    }
  ], function (err, imagePath, title) {
    if (err) throw err;
    console.log(imagePath, title);
    callback({imagePath: imagePath, title: title});
  });
}
