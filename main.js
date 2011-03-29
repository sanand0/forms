// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');

// Third-party node modules
var _ = require('underscore');          // Functional programming & templates
var mime = require('mime');             // Mime types
var cradle = require('cradle');         // CouchDB connection
var connect = require('connect');       // URL routing and middleware

// Local libraries
var config = require('./config');
var utils = require('./utils');

// Patch _.template to ignore any errors in the interpolation / evaluation code
// The only change is that we've added some try-catch blocks.
_.safetemplate = function(str, data) {
  var c  = _.templateSettings;
  var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
    'with(obj||{}){__p.push(\'' +
    str.replace(/\\/g, '\\\\')
       .replace(/'/g, "\\'")
       .replace(c.interpolate, function(match, code) {
         return "',(function(){try{return " + code.replace(/\\'/g, "'") + "}catch(e){return ''}})(),'";
       })
       .replace(c.evaluate || null, function(match, code) {
         return "');try{" + code.replace(/\\'/g, "'")
                            .replace(/[\r\n\t]/g, ' ') + "}catch(e){};__p.push('";
       })
       .replace(/\r/g, '\\r')
       .replace(/\n/g, '\\n')
       .replace(/\t/g, '\\t')
       + "');}return __p.join('');";
  var func = new Function('obj', tmpl);
  return data ? func(data) : func;
};

// Connect to the database.
var couch = new(cradle.Connection)(config.couchdb || {});

// Define Apps
// ------------
var Application = function (folder) {
  var app = this;

  // The application is just the index.js JSON file from the folder
  _.extend(app, JSON.parse(utils.readFile(path.join(folder, 'index.js'))));

  // We then add a few variables and functions to it
  app._name = folder;

  // Load the database
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
  var map_field = 'function(doc) { if (doc[":form"] == "<%= form %>") { <% if (filter) { %>with(doc) { if (!(<%= filter %>)) return; }<% } %> emit(doc["<%= field.name %>"], doc._id); } }';
  _.each(app.view, function(views, name) {
    _.each(_.isArray(views) ? views : [views], function(view, index) {
      for (var design={views:{}}, i=0, field; field=view.fields[i]; i++) {
        design.views[field.name] = { "map": _.template(map_field, { form: view.form, field: field, filter:view.filter }) };
      }
      var key = '_design/' + name + ':' + index;
      app.db.get(key, function(err, doc) {
        if (!err && _.isEqual(doc.views, design.views)) { return; }
        app.db.save(key, design, function(err, res) {
          if (err) { console.log('Error saving design: ', key, res); }
        });
      });
    });
  });

  // Create a design document for looking up values.
  app.db.save('_design/lookup',
     _.reduce(lookups, function(design, val, formfield) {
       var pair = formfield.split('/');
       design[formfield] = { "map": _.template(map_field, { form: pair[0], field: pair[1], filter:'' }) };
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

_.extend(Application.prototype, {
  draw_home: function(response) {
    return _.template(utils.readFile('./plugins/home.html'), {app:this, _:_});
  },

  draw_form: function(name, form, data, errors, response) {
    return _.template(utils.readFile('./plugins/form.html'), {name:name, form:form, doc:data, errors:errors || {}, app:this, _:_});
  },

  draw_view: function(name, view, docs, response) {
    return _.template(utils.readFile('./plugins/view.html'), {name:name, view:view, docs:docs, app:this, _:_});
  },

  // Renders templatename (defaults to index.html) using the string/array provided
  //    app.render(response, 200, 'abc', templatename)
  //    app.render(response, 200, ['abc', 'def'], templatename)
  render: function(response, code, params, templatename) {
    var app = this;
    templatename = app.template ? app.template[templatename || 'default'] : 'index.html';
    template = utils.readFile(path.join(app._name, templatename));
    mimetype = mime.lookup(templatename, 'text/html')
    response.statusCode = code;
    response.setHeader('Content-Type', mimetype);
    if (mimetype.match(/csv|xls/)) { response.setHeader('Content-Disposition', 'attachment; filename=' + templatename); }
    response.end(_.template(template, _.extend({}, {
      static_url: function(path) { return '/' + app._name + '/static/' + path; },
      body: _.isArray(params) ? params.join('') : params
    })));
  },

  validate: function(formname, data) {
    var errors = {};
    // Check for validations on each field
    _.each(this.form[formname].fields, function(field) {
      var fieldname = field.name,
          val = data[fieldname];
      _.each(field.validations, function(check) {
        if ((_.isBoolean    (check[0]) && !val) ||
            (_.isRegExp     (check[0]) && !check[0].test(val)) ||
            (_.isArray      (check[0]) && !_.contains(check[0], val))
        ) {
            if (!errors[fieldname]) { errors[fieldname] = []; }
            errors[fieldname].push(check[1]);
        }
      });
    });
    return _.isEmpty(errors) ? false : errors;
  }
});


var App = {};
fs.readdir(config.apps_folder || '.', function(err, folders) {
  _.each(folders, (function(folder) {
    path.exists(path.join(folder, 'index.js'), function(exists) {
      if (!exists) { return; }
      try { App[folder] = new Application(folder); }
      catch(e) { console.log("Error loading application:", folder, e); }
    });
  }));
});

// Main URL handler
// ----------------
function main_handler(router) {
  router.get('/', function(request, response, next) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end('<h1>Apps</h1><ul>' + _.map(App, function(app, name) { return '<li><a href="/' + name + '">' + name + '</a></li>'; }).join('<br>'));
  });

  router.get('/:app/static/*', function(request, response, next) {
    var app = App[request.params.app];
    if (!app) { response.writeHead(404, {'Content-Type': 'text/plain'}); return response.end('No such app'); }
    connect.static.send(request, response, next, { root: __dirname, path: request.url });
  });

  router.get('/:app/:cls?/:id?/:alt?', function(request, response, next) {
    var app = App[request.params.app];
    if (!app) { response.writeHead(404, {'Content-Type': 'text/plain'}); return response.end('No such app'); }

    // Display home page
    if (!request.params.cls) {
      app.render(response, 200, app.draw_home());
    }

    // Display form
    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
          app.render(response, 200, app.draw_form(request.params.cls, form, doc), form.template);
        });
      } else {
          app.render(response, 200, app.draw_form(request.params.cls, form, {}), form.template);
      }
    }

    // Display view
    else if (app.view && app.view[request.params.cls]) {
      var sortby = request.params.id;
      var viewname = request.params.cls;
      var viewlist = app.view[viewname];
      if (!_.isArray(viewlist)) { viewlist = [viewlist]; }

      var responses = [], count = 0;
      _(viewlist).each(function(view, index) {
        if (!sortby || _.indexOf(_.pluck(view.fields, 'name'), sortby) < 0) { sortby = view.fields[0].name; }
        app.db.view(viewname + ':' + index + '/' + sortby, function(err, data) {
          app.db.get(_.pluck(data, 'value'), function(err, docs) {
            responses[index] = app.draw_view(request.params.cls, view, _.pluck(docs, 'doc'));
            if (++count < viewlist.length) { return; }
            app.render(response, 200, responses, view.template);
          });
        });
      });
    }

    // Handle administration functions under /:app/_admin
    else if (request.params.cls == '_admin') {
      if (request.params.id == 'reload') {
        App[request.params.app] = new Application(request.params.app);
        app.render(response, 200, 'Application reloaded: <a href="/">Home</a>');
      }

      else {
        app.render(response, 404, 'No such admin command');
      }
    }

    else {
      app.render(response, 404, 'No such URL.\nApp: ' + request.params.app + '\nClass: ' + request.params.cls + '\nID: ' + request.params.id);
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
      var data = request.body;
      var redirectOnSuccess = function() {
        var url = form.onsubmit ? '/' + app._name + form.onsubmit : request.url;
        response.writeHead(302, { 'Location': url });
        response.end();
      };
      var errors = app.validate(request.params.cls, data);
      if (errors) {
        return app.render(response, 200, app.draw_form(request.params.cls, form, data, errors));
      }
      app.db.get(data._id, function(err, original) {
        var changes = _.reduce(data, function(memo, val, key) {
          if (key[0] !== '_' && key[0] !== ':' && original[key] !== val) { memo.push([key, original[key], val]); }
          return memo;
        }, []);

        if (_(changes).keys().length === 0) { return redirectOnSuccess(); }

        // Add metadata. TODO: author
        data[':form'] = request.params.cls;
        data[':updated'] = new Date();
        data[':history'] = original[':history'] || [];
        data[':history'].unshift({
          // 'who': TODO
          ':updated': data[':updated'],
          ':fields': changes
        });

        app.db.save(data, function(err, res) {
          if (err) {
            console.log(err, data);
            return app.render(response, 400, '<pre>' + JSON.stringify(err) + '</pre>');
          }
          redirectOnSuccess();
        });
      });
    }

    if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];

      var data = request.body;
      if (typeof data['delete'] !== 'undefined') {
        _(data).each(function(val, key) {
          var parts = key.split(':');
          if (parts[0] == 'doc') {
            app.db.remove(parts[1], parts[2], function(err, data) {
              if (!err) {
                var url = (view.actions && view.actions.onDelete) ? '/' + app._name + view.actions.onDelete : request.url;
                response.writeHead(302, { 'Location': url });
                response.end();
              } else {
                console.log(err, data);
                app.render(response, 400, '<pre>' + JSON.stringify(err) + '</pre>');
              }
            });
          }
        });
      } else {
        response.end('TODO: What do I do with: ' + JSON.stringify(data));
      }
    }
  });

}


var server = connect(
  connect.bodyParser(),
  connect.router(main_handler)
).listen(8401);

console.log('Server started');
