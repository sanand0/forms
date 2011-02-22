var qs = require('querystring');
var _ = require('underscore')._;

// Render a home page of an app
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.home = function(app) {
  var html = [];

  // Display all forms
  html.push('<h2>Forms</h2><ul>');
  _(app.form).each(function(form, name) {
    html.push(_.template('<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>', {app: app, name:name}));
  });
  html.push('</ul>');

  // Display all views
  html.push('<h2>Views</h2><ul>');
  _(app.view).each(function(view, name) {
    html.push(_.template('<li><a href="/<%= app._name %>/<%= name %>"><%= name %></a></li>', {app: app, name:name}));
  });
  html.push('</ul>');

  return html.join('');
};

// Render a form in FDL
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.form = function(app, formname, data, errors) {
  data = data || {};
  errors = errors || {};
  var form = app.form[formname];

  // Basic templates
  var templates = {
    // Start and end of a form.
    form_start:     '<form method="post">',
    form_end:       '<button type="submit"><%= (form.actions || {}).submit || "Submit" %></button></form>',

    // Start and end of a section
    section_start:  '<div class="section" id="<%= field.id %>"><h2><%= field.section %></h2><% if (field.help) { print("<p>", field.help, "</p>") } %><fieldset><dl>',
    section_end:    '</dl></fieldset></div>',
    // This is used when the form starts directly with a field, not with a section
    section_start0: '<div class="section"><fieldset><dl>',

    // Start and end of a field
    field_start:    '<dt class="<%= error ? "error" : "" %>"><label for="<%= field.id %>"><%= field.label %></label><% if (field.help) { print("<p>", field.help, "</p>") } %></dt><dd>',
    field_end:      '</dd>',

    // Field definitions for various field types. `input` is the generic catch-all
    input:          '<input name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>" value="<%= val %>"/>',
    radio:          '<% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", values[i], "\'", values[i] === val ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %>',
    checkbox:       '<% for (var i=0,l=values.length; i<l; i++) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", values[i], "\'", val.indexOf(values[i]) >= 0 ? " checked=\'checked\'" : "", " />", values[i], "</label>"); } %>',
    textarea:       '<textarea name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>"><%= val %></textarea>',
    select:         '<select name="<%= field.id %>" id="<%= field.id %>"><% for (var i=0,l=values.length; i<l; i++) { print("<option", values[i]==val ? " selected=\'selected\'" : "", ">", values[i], "</option>"); } %></select>',

    // Error messages
    error:          '<span class="error"> <%= msg %></span>',

    // Hidden fields
    hidden:         '<input type="hidden" name="_id" value="<%= _id %>"/><input type="hidden" name="_rev" value="<%= _rev %>"/>'
  };

  // t('template-name', data) renders the template
  var t = function(template, data) { return _.template(templates[template], data || {}); };

  // html is an array that holds the output
  var html = [];

  html.push(t('form_start', {form:form}));
  if (data && data._id) { html.push(t('hidden', data)); }
  for (var i=0, field; field=form.fields[i]; i++) {
    // Fields can be either a input definition or a section definition.
    // If it's an input definition...
    if (field.label) {
      // If the first field isn't a section, start with a blank section
      if (i == 0) { html.push(t('section_start0')); }

      // Pick the right template and use it
      var tmpl = templates[field.type] ? field.type : 'input',
          param = {
            field:field,
            val: data[field.id] || field.default || '',
            values: (field.values && field.values.form && field.values.field) ? app._lookup(field.values.form, field.values.field) : field.values,
            error:errors[field.id]
          };
      html.push(t('field_start', param));
      html.push(t(tmpl, param));
      _.each(param.error, function(e) { html.push(t('error', {msg:e})); });
      html.push(t('field_end', param));
    }

    // If it's a section definition,
    else if (field.section) {
      // Close the previous section, except for the first field
      if (i > 0) { html.push(t('section_end')); }

      // Push the HTML for the section
      html.push(t('section_start', {field:field}));
    }
  }

  html.push(t('section_end'));
  html.push(t('form_end', {form:form}));

  return html.join('');
};

// Render a list of docs for a form into XHTML
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.view = function(app, viewname, docs) {
  var view = app.view[viewname];

  // Basic templates
  var templates = {
    view_header:     '<table><thead><tr><% for (var i=0, field; field=form.fields[i]; i++) { if (field.label) { print("<th>", field.label, "</th>"); } } %></tr></thead><tbody>',
     view_row_header: '<tr>',
      view_row_data:   '<td><a href="/<%= app._name %>/<%= view.form %>/<%= doc._id %>"><%= doc[field.id] %></a></td>',
     view_row_footer: '</tr>',
    view_footer:     '</tbody></table>',
    action_header:   '<ul>',
     action_row:      '<li><a href="/<%= app._name %><%= action.url %>"><%= action.text %></li>',
    action_footer:   '</ul>'
  };

  // t('template-name', data) renders the template
  var t = function(template, data) { return _.template(templates[template], data || {}); };

  var form = app.form[view.form];
  var fieldlist = _(form.fields).select(function(field) { return field.label });

  // html is an array that holds the output
  var html = [];
  html.push(t('view_header', {form:form}));
  _(docs).each(function(doc) {
    html.push(t('view_row_header'));
    _(fieldlist).each(function(field) {
      html.push(t('view_row_data', {app:app, view:view, doc:doc, field:field}));
    });
    html.push(t('view_row_footer'));
  });
  // _.each(docs, function(doc) { html.push(t('doc_row', {form:form, doc:doc})); });
  html.push(t('view_footer', {form:form}));

  html.push(t('action_header'));
  _.each(view.actions, function(action) { html.push(t('action_row', {app:app, action:action})); })
  html.push(t('action_footer'));

  return html.join('');
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

