var qs = require('querystring');
var _ = require('underscore')._;

// An accumulative template
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// Usage:
// var t = new _.Template({'b': '<b><%= text %></b> ', 'i': '<i><%= text %></i>'},
//                        global_data).t;     // <-- don't forget the last 't'
// t('b', {text:'bold'});
// t('i', {text:'italics'});
// t('b', {text:'bold again'}).join('') // --> <b>bold</b><i>italics</i>
//
// Every time t(templatename, data) is called, it does the following:
//
// 1. Extends the global data object with the new data
// 2. Generates the templatename using the global data
// 3. Returns the results array
_.Template = function(templates, global) {
  var that = this;
  that.templates = templates;
  that.global = global || {};
  that.result = [];
  that.t = function(name, data) {
    if (data) { _.extend(global, data); }
    if (name && that.templates[name]) { that.result.push(_.template(that.templates[name], global)); }
    return that.result;
  };
};

// Render a home page of an app
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.home = function(app) {
  var t = new _.Template({
    'form_start':   '<h2>Forms</h2><ul>',
     'form':        '<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>',
    'form_end':     '</ul>',
    'view_start':   '<h2>Views</h2><ul>',
     'view':        '<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>',
    'view_end':     '</ul>'
  }, { app: app }).t;

  t('form_start');
  _(app.form).each(function(form, name) { t('form', {form:form, name:name}); });
  t('form_end');
  t('view_start');
  _(app.view).each(function(view, name) { t('view', {view:view, name:name}); });
  t('view_end');

  return t().join('');
};

// Render a form
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.form = function(app, formname, data, errors) {
  data = data || {};
  errors = errors || {};
  var global = { app: app, form: app.form[formname] };
  var templates = {
    form_start:     '<form method="post">',
     doc_ref:       '<input type="hidden" name="_id" value="<%= doc._id %>"/><input type="hidden" name="doc._rev" value="<%= doc._rev %>"/>',
     section_start: '<div class="section" id="<%= field.id %>"><h2><%= field.section %></h2><p><%= field.help %></p><fieldset><dl>',
      label:        '<dt class="<%= error ? "error" : "" %>"><label for="<%= field.id %>"><%= field.label %></label><% if (field.help) { print("<p>", field.help, "</p>") } %></dt>',
      input:        '<dd><input name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>" value="<%= val %>"/></dd>',
      radio:        '<dd><% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", values[i], "\'", values[i] === val ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %></dd>',
      checkbox:     '<dd><% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", values[i], "\'", val.indexOf(values[i]) >= 0 ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %></dd>',
      textarea:     '<dd><textarea name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>"><%= val %></textarea></dd>',
      select:       '<dd><select name="<%= field.id %>" id="<%= field.id %>"><% for (var i=0,l=values.length; i<l; i++) { print("<option", values[i]==val ? " selected=\'selected\'" : "", ">", values[i], "</option>"); } %></select></dd>',

      error:        '<span class="error"> <%= msg %></span>',
     section_end:    '</dl></fieldset></div>',
    form_end:       '<button type="submit"><%= (form.actions || {}).submit || "Submit" %></button></form>'
  };
  var t = new _.Template(templates, global).t;

  t('form_start');
  if (data && data._id) { t('doc_ref', {doc:data}); }
  _(global.form.fields).each(function(field, index) {
    if (field.section || index === 0) {
      if (index > 0) { t('section_end'); }
      t('section_start', {field: field.section ? field : {} });
    }
    if (field.label) {
      var err = errors[field.id];
      t('label', {
        field: field,
        error: err,
        val: data[field.id] || field.default || '',
        values: (field.values && field.values.form && field.values.field) ? app._lookup(field.values.form, field.values.field) : field.values
      });
      t(templates[field.type] ? field.type : 'input');
      _(err).each(function(e) { t('error', {msg:e}); });
    }
  });
  t('section_end');
  t('form_end');

  return t().join('');
}

// Render a list of docs for a form into XHTML
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.view = function(app, viewname, docs) {
  var global = {
    app: app,
    view: app.view[viewname],
    form: app.form[app.view[viewname].form]
  };

  // Basic templates
  var t = new _.Template({
    view_start:         '<table>',

     view_head_start:   '<thead><tr>',
      view_head:        '<th><%= field.label %></th>',
     view_head_end:     '</tr></thead><tbody>',

     view_row_start:    '<tr>',
      view_row:         '<td><a href="/<%= app._name %>/<%= view.form %>/<%= doc._id %>"><%= doc[field.id] %></a></td>',
     view_row_end:      '</tr>',

    view_end:           '</tbody></table>',

    action_start:   '<ul>',
     action_row:      '<li><a href="/<%= app._name %><%= action.url %>"><%= action.text %></li>',
    action_end:   '</ul>'
  }, global).t;

  // Pick the fields that have labels
  var fieldlist = _(global.form.fields).select(function(field) { return field.label });

  t('view_start');
  t('view_head_start');
  _(fieldlist).each(function(field) { t('view_head', {field:field}); });
  t('view_head_end');

  _(docs).each(function(doc) {
    t('view_row_start', {doc:doc});
    _(fieldlist).each(function(field) { t('view_row', {field:field}); });
    t('view_row_end', global);
  });
  t('view_end');

  t('action_start');
  _.each(global.view.actions, function(action) { t('action_row', {action:action}); })
  t('action_end');

  return t().join('');
};


// Converts form POST data into a data object and returns it
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.parseform = function(app, form, request, callback) {
  var data = '';
  request.setEncoding('utf8');
  request.addListener('data', function(chunk) { data += chunk; });
  request.addListener('end', function() {
    var json = data ? qs.parse(data) : {};

    // Add metadata. TODO: author, history
    json[':form'] = form;
    json[':updated'] = new Date();

    callback(json);
  });
};

// Validates form data
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.validate = function(app, formname, data) {
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
      var key = field.id,
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

