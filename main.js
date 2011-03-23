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
var config = require('./config.js');

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

// An accumulative template
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Usage:
// var t = _.Template({b:'<b><%= b %></b>', i:'<i><%= b %>,<%= i %></i>'}, data);
// t('b', {b:'bold'});
// t('i', {i:'italics'});   // ==> ['<b>bold</b>', '<i>bold,italics</i>']
//
// Every time t(templatename, data) is called, it does the following:
//
// 1. Extends a copy of the global data object with the new data
// 2. Generates the templatename using the global data
// 3. Returns the results array
_.Template = function(templates, global) {
  var that = {};
  // Pre-compile the templates
  that.templatecache = _(templates).reduce(function(memo, val, key) { memo[key] = _.safetemplate(val); return memo; }, {});
  that.global = _.extend({}, global);
  that.result = [];
  return function(name, data) {
    if (data) { _.extend(that.global, data); }
    if (name && that.templatecache[name]) { that.result.push(that.templatecache[name](that.global)); }
    return that.result;
  };
};

Renderer = { home: {}, form: {}, view: {}, actions: {} };

Renderer.home.html = {
  'form_start':   '<h2>Forms</h2><ul id="forms">',
   'form':        '<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>',
  'form_end':     '</ul>',
  'view_start':   '<h2>Views</h2><ul id="views">',
   'view':        '<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>',
  'view_end':     '</ul>'
};

Renderer.form.html = {
    form_start:     '<form method="post">',
     _doc_ref:      '<input type="hidden" name="_id" value="<%= doc._id %>"/><input type="hidden" name="_rev" value="<%= doc._rev %>"/>',
     section_start: '<div class="section" id="<%= field.name %>"><h2><%= field.section %></h2><p><%= field.description %></p><fieldset><dl>',
      label:        '<dt class="<%= error ? "error" : "" %>"><label for="<%= field.name %>"><%= field.label %></label><% if (field.description) { print("<p>", field.description, "</p>") } %></dt>',
      input:        '<dd><input name="<%= field.name %>" type="<%= field.type || "text" %>" value="<%= val %>"/></dd>',
      radio:        '<dd><% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.name, "\' value=\'", values[i], "\'", values[i] === val ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %></dd>',
      checkbox:     '<dd><% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.name, "\' value=\'", values[i], "\'", val.indexOf(values[i]) >= 0 ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %></dd>',
      textarea:     '<dd><textarea name="<%= field.name %>" id="<%= field.name %>" type="<%= field.type || "text" %>"><%= val %></textarea></dd>',
      select:       '<dd><select name="<%= field.name %>"><% for (var i=0,l=values.length; i<l; i++) { print("<option", values[i]==val ? " selected=\'selected\'" : "", ">", values[i], "</option>"); } %></select></dd>',
      computed:     '<dd><input name="<%= field.name %>" type="<%= field.type || "text" %>" disabled="true" value="<%= val %>"/></dd>',

      error:        '<span class="error"> <%= msg %></span>',
     section_end:    '</dl></fieldset></div>',
    form_end:       '<button type="submit"><%= (form.actions || {}).submit || "Submit" %></button></form>',

    hist_start:         '<h2>Changes</h2><ol>',
     hist_change_start: '<li>On <%= change[":updated"] %>:<ul>',
      hist_change:      '<li><%= field[0] %>: <del><%= field[1] %></del> <ins><%= field[2] %></ins>',
     hist_change_end:   '</ul></li>',
    history_end:        '</ol>',

    change_start:   '<script>$("form input,form select,form textarea").change(function(){for (var data={},a=$("form").serializeArray(),i=0,f;f=a[i];i++){data[f.name]=f.value};',
     formula:        'data["<%= field.name %>"]=_.template("<%= field.formula %>",data);$("input[name=<%= field.name %>]").val(data["<%= field.name %>"]);',
    change_end:     '})</script>'
};

Renderer.view.html = {
  view_start:         '<form method="post"><table>',

   view_head_start:   '<thead><tr><th></th>',
    view_head:        '<th><a href="/<%= app._name %>/<%= name %>/<%= field.name %>"><%= field.label %></a></th>',
   view_head_end:     '</tr></thead><tbody>',

   view_row_start:    '<tr>',
    _doc_ref:         '<td><input name="doc:<%= doc._id %>:<%= doc._rev %>" type="checkbox"></td>',
    view_row:         '<td><a href="/<%= app._name %>/<%= view.form %>/<%= doc._id %>"><%= doc[field.name] %></a></td>',
   view_row_end:      '</tr>',

  view_end:           '</tbody></table>',
};

Renderer.actions.html = {
  delete_action:      '<button name="delete" type="submit">Delete</button>',
  action_start:       '<ul>',
   action_row:        '<li><a href="/<%= app._name %><%= action.url %>"><%= action.text %></li>',
  action_end:         '</ul></form>'
};

Renderer.view.csv = {
   view_head:         '<%= field.label %>,',
   view_head_end:     '\n',
   view_row:          '<%= doc[field.name] %>,',
   view_row_end:      '\n'
};


// Connect to the database.
var couch = new(cradle.Connection)(config.couchdb || {});

// Load the App
// ------------
var Application = function (folder) {
  var app = this;

  // The application is just the index.js JSON file from the folder
  _.extend(app, JSON.parse(fs.readFileSync(path.join(folder, 'index.js'), 'utf-8')));

  // We then add a few variables and functions to it
  app._name = folder;

  // Sample usage:
  //    app.render(response, 200, {'a':'abc', 'b':[1,2,3]}, templatename)
  // Renders templatename (defaults to index.html) using the object provided
  // The value in the object must be strings. Arrays are concatenated.
  app.render = (function() {
    var templateCache = {};
    var defaults = {
      static_url: function(path) { return '/' + app._name + '/static/' + path; }
    };
    return function(response, code, params, templatename) {
      templatename = app.template ? app.template[templatename || 'default'] : 'index.html';
      var template = templateCache[templatename];
      if (!template) {
        template = templateCache[templatename] = fs.readFileSync(path.join(folder, templatename), 'utf-8');
      }
      _(params).each(function(val, key) { if (_.isArray(val)) { params[key] = val.join(''); } });
      response.writeHead(code, {'Content-Type': mime.lookup(templatename, 'text/html')});
      response.end(_.safetemplate(template, _.extend({}, defaults, params)));
    };
  })();

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

// Render a home page of an app
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns two blocks:
// 1. forms: a list of forms
// 2. views: a list of views
Application.prototype.showhome = function() {
  var app = this;
  var t = _.Template(Renderer.home.html, { app: app });
  var response = {};

  t('form_start');
  _(app.form).each(function(form, name) { t('form', {form:form, name:name}); });
  response.forms = t('form_end');

  var t = _.Template(Renderer.home.html, { app: app });
  t('view_start');
  _(app.view).each(function(view, name) { t('view', {view:view, name:name}); });
  response.views = t('view_end');

  return response;
};

// Render a form
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns these blocks:
// 1. form: the rendered form
// 2. hist: the history of changes to the form
// 3. script: the javascript required on the form
Application.prototype.showform = function(formname, data, errors) {
  var app = this;
  errors = errors || {};
  var global = { app: app, name: formname, form: app.form[formname] };
  var response = {};
  var defaults = {};
  _(global.form.fields).each(function(field, index) { defaults[field.name] = data[field.name] || field.default || ''; });
  data = _.extend(defaults, data);

  var templates = Renderer.form.html;
  var t = _.Template(templates, global);
  t('form_start');
  if (data && data._id) { t('_doc_ref', {doc:data}); }
  _(global.form.fields).each(function(field, index) {
    if (field.section || index === 0) {
      if (index > 0) { t('section_end'); }
      t('section_start', {field: field.section ? field : {} });
    }
    if (field.label) {
      var err = errors[field.name];
      t('label', {
        field: field,
        error: err,
        // Default value: Use the formula. Else the data supplied. Else the default. Else blank.
        val: field.formula ? _.safetemplate(field.formula, data) : (data[field.name] || field.default || ''),
        // List of values: If a form and field are specified, look it up. Else, assume it's an array and use it directly.
        values: (field.values && field.values.form && field.values.field) ? app._lookup(field.values.form, field.values.field) : field.values
      });
      t(templates[field.type] ? field.type : 'input');
      _(err).each(function(e) { t('error', {msg:e}); });
    }
  });
  t('section_end');
  response.form = t('form_end');

  var t = _.Template(templates, global);
  t('hist_start', {history: data[':history']});
  _(data[':history']).each(function(change) {
    t('hist_change_start', {change:change});
    _(change[':fields']).each(function(field) { t('hist_change', {field: field}); });
    t('hist_change_end');
  });
  response.hist = t('hist_end');

  var t = _.Template(templates, global);
  t('change_start');
  _(global.form.fields).each(function(field, index) {
    if (field.formula) { t('formula', {field: field}); }
  });
  response.script = t('change_end');

  return response;
}

// Render a list of docs for a form into XHTML
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns these blocks:
// 1. view: the rendered view
// 2. actions: a list of actions that can be performed from the view
Application.prototype.showview = function(name, view, docs, response) {
  var app = this;
  var global = {
    app: app,
    name: name,
    view: view,
    form: app.form[view.form]
  };
  response = _.defaults(response, {view:[]});

  var t = _.Template(Renderer.view[global.view.renderer || 'html'], global);
  t('view_start');
  t('view_head_start');
  _(global.view.fields).each(function(field) { t('view_head', {field:field}); });
  t('view_head_end');

  _(docs).each(function(doc) {
    t('view_row_start', {doc:doc});
    t('_doc_ref', {doc:doc});
    _(global.view.fields).each(function(field) { t('view_row', {field:field}); });
    t('view_row_end', global);
  });
  Array.prototype.push.apply(response.view, t('view_end'));

  var t = _.Template(Renderer.actions.html, global);
  t('delete_action');
  t('action_start');
  _.each(global.view.actions, function(action) { t('action_row', {action:action}); })
  Array.prototype.push.apply(response.view, t('action_end'));

  return response;
};


// Validates form data
// ------------------------------------------------------------------------------------------------------------------------------------------------------
Application.prototype.validate = function(formname, data) {
  var app = this;
  var errors = {};
  var form = app.form[formname];

  // Report an error on a field, stating a message
  var report_error = function(field, msg) {
    if (!errors[field]) { errors[field] = []; }
    errors[field].push(msg);
  };

  // Check for validations on each field
  for (var i=0, field; field=form.fields[i]; i++) {
    if (field.validations) {
      var key = field.name,
          val = data[key];
      // Perform each validation
      for (var j=0, check; check=field.validations[j]; j++) {
        if ((_.isBoolean    (check[0]) && !val) ||
            (_.isRegExp     (check[0]) && !check[0].test(val)) ||
            (_.isArray      (check[0]) && !_.contains(check[0], val)) ||
            (_.isFunction   (check[0]) && !check[0](val, data))
        ) {
          report_error(key, check[1]);
        }
      }
    }
  }

  return _.isEmpty(errors) ? false : errors;
};


var App = {};
fs.readdir(config.apps_folder || '.', function(err, folders) {
  for (var i=0, folder; folder=folders[i]; i++) {
    try { App[folder] = new Application(folder); } catch(e) { }
  }
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
      app.render(response, 200, app.showhome());
    }

    // Display form
    else if (app.form && app.form[request.params.cls]) {
      var form = app.form[request.params.cls];
      if (request.params.id !== undefined) {
        app.db.get(request.params.id, function(err, doc) {
          app.render(response, 200, app.showform(request.params.cls, doc), form.template);
        });
      } else {
          app.render(response, 200, app.showform(request.params.cls, {}), form.template);
      }
    }

    // Display view
    else if (app.view && app.view[request.params.cls]) {
      var sortby = request.params.id;

      var viewlist = app.view[request.params.cls];
      if (!_.isArray(viewlist)) { viewlist = [viewlist]; }

      var responses = {}, count = 0;
      _(viewlist).each(function(view) {
        if (!sortby || _.indexOf(_.pluck(view.fields, 'name'), sortby) < 0) { sortby = view.fields[0].name; }
        app.db.view(view.form + '/' + sortby, function(err, data) {
          app.db.get(_.pluck(data, 'value'), function(err, docs) {
            app.showview(request.params.cls, view, _.pluck(docs, 'doc'), responses);
            if (++count >= viewlist.length) {
              app.render(response, 200, responses, view.template);
            }
          });
        });
      });
    }

    // Handle administration functions under /:app/_admin
    else if (request.params.cls == '_admin') {
      if (request.params.id == 'reload') {
        App[request.params.app] = new Application(request.params.app);
        app.render(response, 200, {body: 'Application reloaded: <a href="/">Home</a>'});
      }

      else {
        app.render(response, 404, {body: 'No such admin command'});
      }
    }

    else {
      app.render(response, 404, {body:'No such URL.\nApp: ' + request.params.app + '\nClass: ' + request.params.cls + '\nID: ' + request.params.id});
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
      errors = app.validate(request.params.cls, data);
      if (!errors) {
        app.db.get(data._id, function(err, original) {
          // Add metadata. TODO: author
          data[':form'] = request.params.cls;
          data[':updated'] = new Date();
          data[':history'] = original[':history'] || [];
          data[':history'].unshift({
            // 'who': TODO
            ':updated': data[':updated'],
            ':fields': _.reduce(data, function(memo, val, key) {
              if (key[0] !== '_' && key[0] !== ':' && original[key] !== val) { memo.push([key, original[key], val]); }
              return memo;
            }, [])
          });

          app.db.save(data, function(err, res) {
            if (!err) {
              var url = form.onsubmit ? '/' + app._name + form.onsubmit : request.url;
              response.writeHead(302, { 'Location': url });
              response.end();
            } else {
              console.log(err, data);
              app.render(response, 400, {body: '<pre>' + JSON.stringify(err) + '</pre>'});
            }
          });
        });
      } else {
        app.render(response, 200, app.showform(app, request.params.cls, data, errors));
      }
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
                app.render(response, 400, {body: '<pre>' + JSON.stringify(err) + '</pre>'});
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
