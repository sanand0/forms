// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');

// Third-party node modules
var _ = require('underscore')._;        // Functional programming & templates
var mime = require('mime');             // Mime types
var cradle = require('cradle');         // CouchDB connection
var connect = require('connect');       // URL routing and middleware

// Local libraries
var render = require('./render.js');

// Connect to the database.
// var couch = new(cradle.Connection)('http://sanand.couchone.com', 80);
var couch = new(cradle.Connection)();

// Load the App
// ------------
function loadApp(folder) {
  // The application is just the index.js JSON file from the
  var app = JSON.parse(fs.readFileSync(path.join(folder, 'index.js'), 'utf-8'));

  // We then add a few variables and functions to it
  app._name = folder;
  app._render = (function() {
    var templateCache = {};
    var defaults = {
      static_url: function(path) { return '/' + app._name + '/static/' + path; }
    };
    return function(response, code, params, templatename) {
      templatename = templatename || app.template || 'index.html';
      var template = templateCache[templatename];
      if (!template) {
        template = templateCache[templatename] = fs.readFileSync(path.join(folder, templatename), 'utf-8');
      }
      response.writeHead(code, {'Content-Type': mime.lookup(templatename, 'text/html')});
      response.end(_.template(template, _.extend({}, defaults, params)));
    };
  })();

  app.db = couch.database(app.database || 'sample');
  app.db.exists(function(err, exists) {
    if (!exists) { app.db.create(); }
  });

  // Post process forms
  var lookups = {};
  _(app.form).each(function(form, name) {
    // Process each field
    _(form.fields).each(function(field) {
      // Identify all fields looked up by this field
      if (field.values && field.values.form && field.values.field) {
        lookups[field.values.form + '/' + field.values.field] = 1;
      }

      // Change all strings in validations to compiled RegExps. So
      // "validations": [ ["/^A/i", "Text must start with A"] ] becomes
      // "validations": [ [/^A/i, "Text must start with A"] ]
      _(field.validations).each(function(validation) {
        if (_.isString(validation[0]) && validation[0][0] == '/') {
          validation[0] = eval(validation[0]);
        }
      });
    });
  });

  // Create the design documents for the views
  var map_field = 'function(doc) { if (doc[":form"] == "<%= form %>") { emit(doc["<%= field %>"], doc._id); } }';
  _.each(app.view, function(view, name) {
    app.db.save('_design/' + view.form,
      _.reduce(view.fields, function(design, field) {
        design[field.name] = { "map": _.template(map_field, { form: view.form, field: field.name }) };
        return design;
        }, {})
    );
  });

  // Create a design document for looking up values.
  app.db.save('_design/lookup',
     _.reduce(lookups, function(design, val, formfield) {
       var pair = formfield.split('/');
       design[formfield] = { "map": _.template(map_field, { form: pair[0], field: pair[1] }) };
       return design;
     }, {})
  );

  // Helper function for lookups. app._lookup(form, field) -> list of values
  app._lookup = (function() {
    var cache = {};
    return function (form, field) {
      var key = form + '/' + field;
      app.db.view(key, function(err, data) {
        if (err) { console.log(err, data); }
        cache[key] = _(data).pluck('key');
      });
      return cache[key] || [];
    };
  })();

  // Initialise lookups
  _(lookups).each(function(val, key) { var pair = key.split('/'); app._lookup(pair[0], pair[1]); });

  return app;
}

var App = {
  'timesheet': loadApp('timesheet'),
  'sample': loadApp('sample')
};

// Main URL handler
// ----------------
function main_handler(router) {
  router.get('/', function(request, response, next) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end('<h1>Apps</h1><ul>' + _.map(App, function(app, name) { return '<li><a href="/' + name + '">' + name + '</a></li>'; }).join('<br>'));
  });

  router.get('/:app/static/*', function(request, response, next) {
    var app = App[request.params.app];
    if (!app) { return; }
    connect.static.send(request, response, next, { root: __dirname, path: request.url });
  });

  router.get('/:app/:cls?/:id?', function(request, response, next) {
    var app = App[request.params.app];
    if (!app) { return; }

    // Display home page
    if (!request.params.cls) {
      app._render(response, 200, {body: render.home(app)});
    }

    // Display form
    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
          app._render(response, 200, {body:render.form(app, request.params.cls, doc)});
        });
      } else {
          app._render(response, 200, {body:render.form(app, request.params.cls, {})});
      }
    }

    // Display view
    else if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];
      var field = request.params.id;
      if (!field || _.indexOf(_.pluck(view.fields, 'name'), field) < 0) { field = view.fields[0].name; }
      app.db.view(view.form + '/' + field, function(err, data) {
        app.db.get(_.pluck(data, 'value'), function(err, docs) {
          app._render(response, 200, {body:render.view(app, request.params.cls, _.pluck(docs, 'doc'))}, view.template);
        });
      });
    }

    // Handle administration functions under /:app/_admin
    else if (request.params.cls == '_admin') {
      if (request.params.id == 'delete') {
        app._render(response, 200, {body: 'TODO: Deleting data'});
      }

      else if (request.params.id == 'reload') {
        App[request.params.app] = loadApp(request.params.app);
        app._render(response, 200, {body: 'Application reloaded: <a href="/">Home</a>'});
      }

      else {
        app._render(response, 404, {body: 'No such admin command'});
      }
    }

    else {
      app._render(response, 404, {body:'No such URL.\nApp: ' + request.params.app + '\nClass: ' + request.params.cls + '\nID: ' + request.params.id});
    }
  });


  // Receive a submitted form
  // -----------------------------------------------------------------
  router.post('/:app/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    if (!app) { return; }

    if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];

      response.writeHead(200, {'Content-Type': 'text/html'});
      var data = request.body;
      // Add metadata. TODO: author, history
      data[':form'] = request.params.cls;
      data[':updated'] = new Date();

      errors = render.validate(app, request.params.cls, data);
      if (!errors) {
        app.db.save(data, function(err, res) {
          if (!err) {
            var url = (form.actions && form.actions.onSubmit) ? form.actions.onSubmit : '/' + request.params.cls;
            response.writeHead(302, { 'Location': '/' + app._name + url });
            response.end();
          } else {
            console.log(data);
            app._render(response, 400, {body: '<pre>' + JSON.stringify(err) + '</pre>'});
          }
        });
      } else {
        app._render(200, response, {body:render.form(app, request.params.cls, data, errors)});
      }
    }

    if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];

      response.writeHead(200, {'Content-Type': 'text/html'});
      parsebody(request, function(data) {
        if (typeof data['delete'] !== 'undefined') {
          // Todo: delete
        }
        response.end('Got the request: ' + JSON.stringify(data));
      });
    }
  });

}


var server = connect(
  connect.bodyParser(),
  connect.router(main_handler)
).listen(8401);

console.log('Server started');
