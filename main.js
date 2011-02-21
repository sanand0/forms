// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');

// Third-party node modules
var _ = require('underscore')._;        // Functional programming & templates
var cradle = require('cradle');         // CouchDB connection
var connect = require('connect');       // URL routing and middleware

// Local libraries
var render = require('./render.form.js');


// Connect to the database. TODO: On failure...
var couch = new(cradle.Connection)('http://sanand.couchone.com', 80);
// var couch = new(cradle.Connection)();
var db = couch.database('sample');
db.exists(function(err, exists) {
  if (!exists) { db.create(); }
});


// Load the App
// ------------
function loadApp(folder) {
  // The application is just the index.js JSON file from the
  var app = JSON.parse(fs.readFileSync(path.join(folder, 'index.js'), 'utf-8'));

  // We then add a few variables and functions to it
  app._name = folder;
  app._staticProvider = connect.staticProvider();
  app._render = (function() {
      var template = fs.readFileSync(path.join(folder, app.template), 'utf-8');
      var defaults = {
        static_url: function(path) { return '/' + app._name + '/static/' + path; }
      };
      return function(params) {
        return _.template(template, _.extend({}, defaults, params));
      };
  })();

  // Create the design documents for the views
  var map_field = 'function(doc) { if (doc[":form"] == "<%= form %>") { emit(doc["<%= field %>"], doc._id); } }';
  _.each(_.values(app.view), function(view) {
    db.save('_design/' + view.form,
      _.reduce(view.fields, function(design, field) {
        design[field.id] = { "map": _.template(map_field, { form: view.form, field: field.id }) };
        return design;
        }, {})
    );
  });

  // TODO: Change all strings in validations to compiled RegExps
  return app;
}

var App = {
  'timesheet': loadApp('timesheet'),
  'sample': loadApp('sample')
};

// Main URL handler
// ----------------
function main_handler(router) {
  var write = function(code, app, response, data) {
    response.writeHead(code, {'Content-Type': 'text/html'});
    if (app) {
        response.end(app._render(data));
    } else {
      response.end('No such application found');
    }
  };

  router.get('/:app/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    if (!app) { return write(404, app, response, {body:'No such app'}); }

    // Display form
    if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        db.get(request.params.id, function(err, doc) {
          write(200, app, response, {body:render.form(app, request.params.cls, doc)});
        });
      } else {
          write(200, app, response, {body:render.form(app, request.params.cls, {})});
      }
    }

    // Display view
    else if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];
      var field = request.params.id;
      if (!field || _.indexOf(_.pluck(view.fields, 'id'), field) < 0) { field = view.fields[0].id; }
      db.view(view.form + '/' + field, function(err, data) {
        db.get(_.pluck(data, 'value'), function(err, docs) {
          write(200, app, response, {body:render.view(app, request.params.cls, _.pluck(docs, 'doc'))});
        });
      });
    }

    // Display static content
    else if (request.params.cls == 'static') {
      app._staticProvider(request, response,
        // If there's no such file, report an error to avoid following through
        function() {
          write(404, app, response, {body:'No such static file: ' + request.url});
        }
      );
    }

    else {
      write(404, app, response, {body:'No such URL.\nApp: ' + request.params.app + '\nType: ' + request.params.cls + '\nID: ' + request.params.id});
    }
  });


  // Receive a submitted form
  // -----------------------------------------------------------------
  router.post('/:app/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    if (!app) { return write(404, app, response, {body:'No such app'}); }

    if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];

      response.writeHead(200, {'Content-Type': 'text/html'});
      render.parseform(app, request.params.cls, request, function(data) {
        errors = render.validate(form, data);
        if (!errors) {
          db.save(data, function(err, res) {
            if (!err) {
              var url = (form.actions && form.actions.onSubmit) ? form.actions.onSubmit : '/' + request.params.cls;
              response.writeHead(302, { 'Location': '/' + app._name + url });
              response.end();
            } else {
              // TODO: error handling
              console.log(err);
            }
          });
        } else {
          response.end(app._render({body:render.form(app, request.params.cls, data, errors)}));
        }
      });
    }
  });

}


var server = connect.createServer(
  connect.router(main_handler)
);

server.listen(8401);
console.log('Server started');


/*
TODO:
- make app a module. app.load, app.router, etc
    - pre-process validations on load
- rename render.form.js to render.js. Allow for generic "parser event"-based renderings
*/