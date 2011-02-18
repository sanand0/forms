var http = require('http');
var _ = require('underscore')._;
var cradle = require('cradle');
var connect = require('connect');

var render = require('./render.form.js');
var FDL = require('./sample.fdl.js');

var css = '<link rel="stylesheet" type="text/css" href="http://yui.yahooapis.com/combo?3.3.0/build/cssreset/reset-min.css&3.3.0/build/cssfonts/fonts-min.css&3.3.0/build/cssbase/base-min.css">';

// var couch = new(cradle.Connection)('http://sanand.couchone.com', 80);
var couch = new(cradle.Connection)();
var db = couch.database('sample');
db.exists(function(err, exists) {
  if (!exists) { db.create(); }
})

function view_page(app) {
  app.get('/view', function(request, response, next) {
    db.all(function(err, ids) {
      response.writeHead(200, {'Content-Type': 'text/html'});
      db.get(_.pluck(ids, 'id'), function(err, docs) {
        response.write(css + render.simpleview(FDL.form.sample, _.pluck(docs, 'doc')));
        response.end('<a href="/form/sample">Add new</a>');
      });
    });
  });
}


function form_page(app) {
  // Ensures that a form exists
  var validate_form = function(request, response, callback) {
    var form = FDL.form[request.params.form];
    if (form === undefined) {
          response.writeHead(404, {'Content-Type': 'text/html'});
          response.end('No such form');
    } else {
      callback(form);
    }
  };

  app.get('/form/:form/:id?', function(request, response, next) {
    validate_form(request, response, function(form) {
        response.writeHead(200, {'Content-Type': 'text/html'});
        if (request.params.id !== undefined) {
          db.get(request.params.id, function(err, doc) {
            response.end(css + render.simpleform(form, doc));
          });
        } else {
            response.end(css + render.simpleform(form, {}));
        }
    });
  });

  app.post('/form/:form', function(request, response, next) {
    validate_form(request, response, function(form) {
      response.writeHead(200, {'Content-Type': 'text/html'});
      render.parseform(form, request, function(data) {
        errors = render.validate(form, data);
        if (!errors) {
          response.write('Saving...<br>');
          db.save(data, function(err, res) {
            response.end(_.template('Response saved <a href="<%= url %>">here</a>. <a href="">Add another</a>', {
              url: 'http://' + couch.host + ':' + couch.port + '/_utils/document.html?' + db.name + '/' + res.id
            }));
          });
        } else {
          response.end(css + render.simpleform(form, data, errors));
        }
      });
    });
  });
}


var server = connect.createServer(
  connect.router(form_page),
  connect.router(view_page)
);

server.listen(8401);
console.log('Server started');
