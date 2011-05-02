// Built-in node modules
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var spawn = require('child_process').spawn;

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
try {
  var couch = new cradle.Connection(config.couchdb || {});
} catch(e) {
  console.log("Unable to connect to CouchDB", JSON.stringify(e))
}

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

  // Set a default login method
  if (!app.login) { app.login = 'default'; }

  return app;
};

_.extend(Application.prototype, {
  error: function(msg, err, data) {
    console.log(this._name, msg, err, data || '');
  },

  user: function(request) {
    return (request && request.session && request.session.login && request.session.login[this.login]) || {};
  },

  draw_page: function(options) {
    var file = (this.page && options.name in this.page) ?
                  path.join(this._name, this.page[options.name].file) :
                  path.join(App['default']._name, App['default'].page[options.name].file || App['default'].page['404'].file);
    return _.template(utils.readFile(file), _({app:this, _:_, user:this.user(options.request)}).extend(options));
  },

  draw_form: function(options) {
    return _.template(utils.readFile('default/form.html'), _({app:this, _:_, user:this.user(options.request), errors:{}, doc:options.query, form:this.form[options.name]}).extend(options));
  },

  draw_view: function(options) {
    var ext = options.view.template ? path.extname(options.view.template) : '.html';
    return _.template(utils.readFile('default/view' + ext), _({app:this, _:_, user:this.user(options.request)}).extend(options));
  },

  // Renders templatename (defaults to index.html) using the string/array provided
  //    app.render(response, 200, 'abc', form_or_view_or_page)
  //    app.render(response, 200, ['abc', 'def'], form_or_view_or_page)
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

  // Ensures that the operation can be performed based on object.permissions
  can: function(operation, object, session, doc) {
    if (!object.permissions) { return true; }
    var perms = object.permissions[operation];
    if (!perms) { return true; }
    if (!session || !session.login || !session.login[this.login]) { return false; }
    var user = session.login[this.login];
    if (_.contains(perms, 'all')) { return true; }
    if (_.contains(perms, 'author') && doc && doc[':user'] && doc[':user'] == user.username) { return true; }
    if (_.contains(perms, user.username)) { return true; }
    if (_.intersect(user.role, perms).length > 0) { return true; }
    return false;
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
    var query = url.parse(request.url, true).query;
    var app = App[request.params.app];
    if (!app) { return App['default'].render(response, 200, App['default'].draw_page({request:request, query:query, name:'404'})); }

    // Display login
    if (request.params.cls == 'login') {
      // Log out if requested
      if (query.logout && request.session.login && request.session.login[app.login]) { delete request.session.login[app.login]; }
      // If already logged in, redirect to next
      if (request.session && request.session.login && request.session.login[app.login]) {
        response.writeHead(302, { 'Location': query.next || '/' + app._name });
        return response.end();
      }
      app.render(response, 200, _.template(utils.readFile('default/login-' + app.login + '.html'), { app:app, config:config, request:request, query:query, error:0 }));
    }

    // Display form
    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
          if (err) {
            app.error('Error loading doc:', err, doc);
            return app.render(response, 404, '<pre>' + JSON.stringify(err) + '</pre>');
          }
          if (!app.can('read', form, request.session, doc)) { return app.render(response, 403, app.draw_page({request:request, name:'403', query:{ 'operation': 'read' }})); }
          app.render(response, 200, app.draw_form({request:request, query:query, name:request.params.cls, doc:doc}), form);
        });
      } else {
        if (!app.can('create', form, request.session)) { return app.render(response, 403, app.draw_page({request:request, name:'403', query:{ 'operation': 'create' }})); }
        app.render(response, 200, app.draw_form({request:request, query:query, name:request.params.cls}), form);
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
        if (sortby[0] == '-') { sortby = sortby.substr(1); query.descending = true; }
        query.limit = query.limit || view.limit || 200;
        query.include_docs = true;
        app.db.view(viewname + ':' + index + '/' + sortby, query, function(err, viewdata) {
          if (err) { return app.error('Error loading view:', err, viewdata); }
          if (typeof(viewdata) == 'undefined') { viewdata = []; }
          responses[index] = app.draw_view({request:request, query:query, name:request.params.cls, view:view, docs:_.pluck(viewdata, 'doc'), viewdata:viewdata, sortby:sortby});
          if (++count < viewlist.length) { return; }
          app.render(response, 200, responses, view);
        });
      });
    }

    // Display page (or if none is specified, then draw the home page)
    else if (!request.params.cls || (app.page && app.page[request.params.cls])) {
      app.render(response, 200, app.draw_page({request:request, query:query, name:request.params.cls || ''}));
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
      app.render(response, 200, app.draw_page({request:request, name:'404', query:query}));
    }
  });


  // Receive a submitted form
  // -----------------------------------------------------------------
  router.post('/:app/:cls?/:id?', function(request, response, next) {
    // Ensure that app exists
    var app = App[request.params.app];
    var data = request.body;
    if (!app) { return; }

    // Display login
    if (request.params.cls == 'login') {
      var success = function(user) {
        request.session.login = request.session.login || {};
        request.session.login[app.login] = user;
        response.writeHead(302, { 'Location': request.body.next || '/' + app._name });
        return response.end();
      };
      var failure = function() {
        app.render(response, 200, _.template(utils.readFile('default/login-' + app.login + '.html'), {
          app:app, request:request, query:data, config:config, error:'Login failed'
        }));
      };
      if (app.login == 'default') {
        var userlist = (config.login && config.login['default']) || {};
        if (userlist[request.body.username] && userlist[request.body.username].password == request.body.password) {
          success(_.extend({ username: request.body.username }, userlist[request.body.username]));
        } else {
          failure();
        }
      } else if (app.login == 'windows') {
        var params = (config.login && config.login['windows']) || {};
        // auth via http://www.joeware.net/freetools/tools/auth/index.htm
        var cmd = spawn(path.join(__dirname, 'auth.exe'), ['/d:' + request.body.domain || params.domain, '/u:' + request.body.username, '/p:' + request.body.password]).on('exit', function(code) {
          if (code == 1) { success({ username: request.body.username.toLowerCase() }); }
          else { failure(); }
        });
        cmd.stdin.end();
      }
    }

    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (!data._id && !app.can('create', form, request.session)) { return app.render(response, 403, app.draw_page({request:request, name:'403', query:{ 'operation': 'create' }})); }
      var redirectOnSuccess = function() {
        var url = form.onsubmit ? '/' + app._name + form.onsubmit : request.url;
        response.writeHead(302, { 'Location': url });
        response.end();
      };
      var errors = app.validate(request.params.cls, data);
      if (errors) {
        return app.render(response, 200, app.draw_form({request:request, query:data, name:request.params.cls, doc:data, errors:errors}));
      }
      app.db.get(data._id, function(err, original) {
        if (data._id && !app.can('update', form, request.session, original)) { return app.render(response, 403, app.draw_page({request:request, name:'403', query:{ 'operation': 'update' }})); }
        var changes = _.reduce(data, function(memo, val, key) {
          if (key[0] !== '_' && key[0] !== ':' && original[key] !== val) { memo.push([key, original[key], val]); }
          return memo;
        }, []);

        if (_(changes).keys().length === 0) { return redirectOnSuccess(); }

        data[':form'] = request.params.cls;
        data[':user'] = app.user(request).username || '';
        data[':updated'] = new Date();
        data[':history'] = original[':history'] || [];
        data[':history'].unshift({
          ':user': data[':user'],
          ':updated': data[':updated'],
          ':fields': changes
        });

        app.db.save(data, function(err, res) {
          if (err) {
            app.error('Error saving doc:', err, data);
            return app.render(response, 404, '<pre>' + JSON.stringify(err) + '</pre>');
          }
          return redirectOnSuccess();
        });
      });
    }

    else if (app.view && app.view[request.params.cls]) {
      var view = app.view[request.params.cls];
      if (typeof data['delete'] == 'undefined') {
        return response.end('TODO: What do I do with: ' + JSON.stringify(data));
      }
      var errors = 0, done = 0, todo = 0, lasterr;
      _(data).each(function(val, key) {
        var parts = key.split(':');
        if (parts[0] == 'doc') {
          todo++;
          app.db.remove(parts[1], parts[2], function(err, result) {
            done++;
            if (err) { errors++; lasterr = err; }
            if (todo == done) {
              if (!err) {
                response.writeHead(302, {'Location': (view.actions && view.actions.onDelete) ? '/' + app._name + view.actions.onDelete : request.url });
                return response.end();
              } else {
                app.error('Error saving ' + errors + ' documents:', lasterr, result);
                return app.render(response, 404, '<pre>' + JSON.stringify(lasterr) + '</pre>');
              }
            }
          });
        }
      });
    }
  });

}


var server = connect(
  connect.bodyParser(),
  connect.cookieParser(),
  connect.session({ secret: config.secret || ''+Math.random() }),
  connect.router(main_handler)
).listen(config.port);

console.log('Server started on port ' + config.port);
