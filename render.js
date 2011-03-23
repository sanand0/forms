var _ = require('underscore');


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

var Template = function(app) {
  this.app = app;
};

// Render a home page of an app
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Returns two blocks:
// 1. forms: a list of forms
// 2. views: a list of views
Template.prototype.home = function() {
  var app = this.app;
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
Template.prototype.form = function(formname, data, errors) {
  var app = this.app;
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
Template.prototype.view = function(name, view, docs, response) {
  var app = this.app;
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
Template.prototype.validate = function(formname, data) {
  var app = this.app;
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

this.Template = Template;
