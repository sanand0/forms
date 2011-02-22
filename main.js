// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');

// Third-party node modules
var _ = require('underscore')._;        // Functional programming & templates
var cradle = require('cradle');         // CouchDB connection
var connect = require('connect');       // URL routing and middleware

// Local libraries
var render = require('./render.js');

// Connect to the database. TODO: On failure...
// var couch = new(cradle.Connection)('http://sanand.couchone.com', 80);
var couch = new(cradle.Connection)();


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
        design[field.id] = { "map": _.template(map_field, { form: view.form, field: field.id }) };
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
  // TODO: make this synchronous
  app._lookup = (function() {
    var cache = {};

    return function (form, field) {
      var key = form + '/' + field;
      app.db.view(key, function(err, data) {
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
  var write = function(code, app, response, data) {
    response.writeHead(code, {'Content-Type': 'text/html'});
    if (app) {
        response.end(app._render(data));
    } else {
      response.end(data || "");
    }
  };

  router.get('/:app?/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    if (!app) {
      if (request.params.app) { write(404, null, response, 'No such app'); }
      else {
        // TODO: Need a global app of apps
        write(200, null, response, '<h1>Apps</h1><ul>' + _.map(App, function(app, name) { return '<li><a href="/' + name + '">' + name + '</a></li>'; }).join('<br>'));
      }
    }

    // Display home page
    else if (!request.params.cls) {
      write(200, app, response, {body: render.home(app)});
    }

    // Display form
    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
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
      app.db.view(view.form + '/' + field, function(err, data) {
        app.db.get(_.pluck(data, 'value'), function(err, docs) {
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
      write(404, app, response, {body:'No such URL.\nApp: ' + request.params.app + '\nClass: ' + request.params.cls + '\nID: ' + request.params.id});
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
        errors = render.validate(app, request.params.cls, data);
        if (!errors) {
          app.db.save(data, function(err, res) {
            if (!err) {
              var url = (form.actions && form.actions.onSubmit) ? form.actions.onSubmit : '/' + request.params.cls;
              response.writeHead(302, { 'Location': '/' + app._name + url });
              response.end();
            } else {
              write(400, app, response, {body: '<pre>' + JSON.stringify(err) + '</pre>'});
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
/ view lookups
- bind render to app

1. Handle dates properly [target: Tue]
/ Allow list of projects to be editable [target: Wed]
3. Add authentication [target: Thu]
4. Add export functionality [target: Fri]

*/
