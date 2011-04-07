// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

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
var couch = new cradle.Connection(config.couchdb || {});

// Define Apps
// ------------
var Application = function (folder) {
  var app = this;
  app._name = folder;

  // The application is just the index.js JSON file from the folder
  _.extend(app, JSON.parse(utils.readFile(path.join(folder, 'index.js'))));

  // Create the database and initialise it
  app.db = couch.database(app.database);
  app.db.exists(function(err, exists) {
    if (!exists) { app.db.create(function() { design_app(app); }); }
    else { design_app(app); }
  });
}

function design_app(app) {
  // Post process forms
  var lookups = {};
  _(app.form).each(function(form, name) {
    // Process each field
    _(form.fields).each(function(field) {
      // Identify all fields looked up by this field
      if (field.values && field.values.form && field.values.field) {
        lookups[field.values.form + ':' + field.values.field] = 1;
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
  var map_field = 'function(doc) { if (doc[":form"] == "<%= form %>") { <% if (filter) { %>with(doc) { if (!(<%= filter %>)) return; }<% } %> emit(doc["<%= fieldname %>"], doc._id); } }';
  _.each(app.view, function(views, name) {
    _.each(_.isArray(views) ? views : [views], function(view, index) {
      for (var design={views:{}}, i=0, field; field=view.fields[i]; i++) {
        design.views[field.name] = { "map": _.template(map_field, { form: view.form, fieldname: field.name, filter:view.filter }) };
      }
      var key = '_design/' + name + ':' + index;
      app.db.get(key, function(err, doc) {
        if (!err && _.isEqual(doc.views, design.views)) { return; }
        if (doc) { doc.views = design.views; } else { doc = design; }
        app.db.save(key, doc, function(err, res) {
          if (err) { app.error('Error saving design: ' + key, err); }
        });
      });
    });
  });

  // Helper function for lookups. app._lookup(form, field) -> list of values
  app._lookup = (function() {
    var cache = {};
    return function (form, field) {
      var key = 'lookup/' + form + ':' + field;
      app.db.view(key, function(err, data) {
        if (err) { app.error('Error in view lookup: ' + key, err); }
        cache[key] = _(data).pluck('key');
      });
      return cache[key] || [];
    };
  })();

  // Create a design document for looking up values.
  app.db.save('_design/lookup',
     _.reduce(lookups, function(design, val, formfield) {
       var pair = formfield.split(':');
       design[formfield] = { "map": _.template(map_field, { form: pair[0], fieldname: pair[1], filter:'' }) };
       return design;
     }, {}),
     function(err, res) {
      if (err) { app.error('Error saving lookup design: ' + lookups, err, res); }
      else {
        // ... then initialise lookups
        _(lookups).each(function(val, key) {
          var pair = key.split(':');
          app._lookup(pair[0], pair[1]);
        });
      }
    }
  );

  return app;
};

_.extend(Application.prototype, {
  error: function(msg, err, data) {
    console.log(this._name, msg, err, data || '');
  },

  draw_page: function(page, param) {
    return _.template(utils.readFile(page), {app:this, param:param || {}, _:_});
  },

  draw_form: function(name, form, data, errors) {
    return _.template(utils.readFile('default/form.html'), {name:name, form:form, doc:data, errors:errors || {}, app:this, _:_});
  },

  draw_view: function(name, view, docs, viewdata, sortby, options) {
    var ext = view.template ? path.extname(view.template) : '.html';
    return _.template(utils.readFile('default/view' + ext), {name:name, view:view, docs:docs, app:this, viewdata:viewdata, sortby:sortby, options:options, _:_});
  },

  // Renders templatename (defaults to index.html) using the string/array provided
  //    app.render(response, 200, 'abc', templatename)
  //    app.render(response, 200, ['abc', 'def'], templatename)
  render: function(response, code, params, object) {
    var app = this;
    templatename = (object && object.template) ? object.template : (app.template || '../default/index.html');
    template = utils.readFile(path.join(app._name, templatename));
    mimetype = mime.lookup(templatename, 'text/html')
    response.statusCode = code;
    response.setHeader('Content-Type', mimetype);
    if (mimetype.match(/csv|xls/)) {
      var filename = (object.label ? object.label.replace(/[^A-Za-z0-9_\-]+/, '-') : templatename) + path.extname(templatename);
      response.setHeader('Content-Disposition', 'attachment; filename=' + filename);
    }
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
  _.each(folders, function(folder) {
    path.exists(path.join(folder, 'index.js'), function(exists) {
      if (!exists) { return; }
      try { App[folder] = new Application(folder); }
      catch(e) { console.log('App loader', 'Error loading application:', folder, e); }
    });
  });
});

// Main URL handler
// ----------------
function main_handler(router) {
  router.get('/', function(request, response, next) {
    App['default'].render(response, 200, _.template(utils.readFile('default/applist.html'), { App: App }));
  });

  router.get('/:filename', function(request, response, next) {
    connect.static.send(request, response, next, { root: path.join(__dirname, 'default'), path: request.params.filename, maxAge: (config.cacheHrs || 0)*3600*1000 });
  });

  router.get('/:app/static/*', function(request, response, next) {
    connect.static.send(request, response, next, { root: __dirname, path: request.url, maxAge: (config.cacheHrs || 0)*3600*1000 });
  });

  router.get('/:app/:cls?/:id?', function(request, response, next) {
    var app = App[request.params.app];
    if (!app) { app = App['default']; return app.render(response, 200, app.draw_page('default/' + App['default'].page['/404'], params)); }
    var params = url.parse(request.url, true).query;

    // Display form
    if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
          if (err) {
            app.error('Error loading doc:', err, doc);
            return app.render(response, 404, '<pre>' + JSON.stringify(err) + '</pre>');
          }
          app.render(response, 200, app.draw_form(request.params.cls, form, doc), form);
        });
      } else {
          app.render(response, 200, app.draw_form(request.params.cls, form, params), form);
      }
    }

    // Display view
    else if (app.view && app.view[request.params.cls]) {
      var viewname = request.params.cls;
      var viewlist = app.view[viewname];
      if (!_.isArray(viewlist)) { viewlist = [viewlist]; }

      var responses = [], count = 0;
      _(viewlist).each(function(view, index) {
        var sortby = request.params.id || view.fields[0].name;
        if (sortby[0] == '-') { sortby = sortby.substr(1); params.descending = true; }
        params.limit = view.limit || 200;
        app.db.view(viewname + ':' + index + '/' + sortby, params, function(err, viewdata) {
          app.db.get(_.pluck(viewdata, 'value'), function(err, docs) {
            responses[index] = app.draw_view(request.params.cls, view, _.pluck(docs, 'doc'), viewdata, sortby, params);
            if (++count < viewlist.length) { return; }
            app.render(response, 200, responses, view);
          });
        });
      });
    }

    // Display page
    else if (app.page && app.page[request.params.cls]) {
      app.render(response, 200, app.draw_page(app._name + '/' + app.page[request.params.cls], params));
    }

    // If this is the home page, and no page was specified, use the default home page
    else if (!request.params.cls) {
      app.render(response, 200, app.draw_page('default/home.html', params));
    }

    // Handle administration functions under /:app/_admin
    else if (request.params.cls == '_admin') {
      if (request.params.id == 'reload') {
        App[request.params.app] = new Application(request.params.app);
        app.render(response, 200, _.template('Reloaded. <a href="/<%= app._name %>">Back</a>', { app:app }));
      }

      else {
        app.render(response, 404, 'No such admin command');
      }
    }

    else {
      var page404 = (app.page && app.page['/404']) ? app._name + '/' + app.page['/404']
                                                   : 'default/' + App['default'].page['/404'];
      app.render(response, 200, app.draw_page(page404, params));
    }
  });


  // Receive a submitted form
  // -----------------------------------------------------------------
  router.post('/:app/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    var data = request.body;
    if (!app) { return; }

    if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
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
            app.error('Error saving doc:', err, data);
            return app.render(response, 404, '<pre>' + JSON.stringify(err) + '</pre>');
          }
          redirectOnSuccess();
        });
      });
    }

    if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];
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
                app.error('Error saving multiview:', err, data);
                app.render(response, 404, '<pre>' + JSON.stringify(err) + '</pre>');
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
  connect.cookieParser(),
  connect.session({ secret: config.secret }),
  connect.router(main_handler)
).listen(8401);

console.log('Server started');
