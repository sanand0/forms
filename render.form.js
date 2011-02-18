var qs = require('querystring');
var _ = require('underscore')._;

// Render a form in FDL into XHTML
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.simpleform = function(form, data, errors) {
  data = data || {};
  errors = errors || {};

  // Basic templates
  var templates = {
    // Start and end of a form. TODO: Form action
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
    radio:          '<% for (var v in field.values) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", v, "\'", v === val ? " checked=\'checked\'" : "", " />", v, "</label>"); } %>',
    checkbox:       '<% for (var v in field.values) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", v, "\'", val.indexOf(v) >= 0 ? " checked=\'checked\'" : "", " />", v, "</label>"); } %>',
    textarea:       '<textarea name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>"><%= val %></textarea>',
    select:         '<select name="<%= field.id %>" id="<%= field.id %>"><% for (var v in field.values) { print("<option", v==val ? " selected=\'selected\'" : "", ">", v, "</option>"); } %></select>',

    // Error messages
    error:          '<span class="error"> <%= msg %></span>'
  };

  // t('template-name', data) renders the template
  var t = function(template, data) { return _.template(templates[template], data || {}); };

  // html is an array that holds the output
  var html = [];

  html.push(t('form_start', {form:form}));
  for (var i=0, field; field=form.fields[i]; i++) {
    // Fields can be either a input definition or a section definition.
    // If it's an input definition...
    if (field.label) {
      // If the first field isn't a section, start with a blank section
      if (i == 0) { html.push(t('section_start0')); }

      // Pick the right template and use it
      var tmpl = templates[field.type] ? field.type : 'input',
          param = {field:field, val: data[field.id] || field.default || '', error:errors[field.id]};
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
this.simpleview = function(form, docs) {
  // Basic templates
  var templates = {
    // Start and end of a form. TODO: Form action
    view_header:     '<table><thead><tr><% for (var i=0, field; field=form.fields[i]; i++) { if (field.label) { print("<th>", field.label, "</th>"); } } %></tr></thead><tbody>',
    doc_row:         '<tr><% for (var i=0, field; field=form.fields[i]; i++) { if (field.label) { print("<td>", doc[field.id], "</td>"); } } %></tr>',
    view_footer:     '</tbody></table>'
  };

  // t('template-name', data) renders the template
  var t = function(template, data) { return _.template(templates[template], data || {}); };

  // html is an array that holds the output
  var html = [];
  html.push(t('view_header', {form:form}));
  for (var i=0, doc; doc=docs[i]; i++) {
    html.push(t('doc_row', {form:form, doc:doc}));
  }
  html.push(t('view_footer', {form:form}));

  return html.join('');
};


// Converts form POST data into a data object and returns it
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.parseform = function(form, request, callback) {
  var data = '';
  request.setEncoding('utf8');
  request.addListener('data', function(chunk) { data += chunk; });
  request.addListener('end', function() {
    callback(data ? qs.parse(data) : {});
  });
};

// Validates form data
// ------------------------------------------------------------------------------------------------------------------------------------------------------
// TODO: Move validations into CouchDB
var validate = this.validate = function(form, data) {
  var errors = {};

  var report = function(field, msg) {
    if (!errors[field]) { errors[field] = []; }
    errors[field].push(msg);
  };

  for (var i=0, field; field=form.fields[i]; i++) {
    if (field.validations) {
      var key = field.id,
          val = data[key];
      for (var j=0, check; check=field.validations[j]; j++) {
        if ((_.isBoolean    (check[0]) && !val) ||
            (_.isRegExp     (check[0]) && !check[0].test(val)) ||
            (_.isArray      (check[0]) && !_.contains(check[0], val)) ||
            (_.isFunction   (check[0]) && !check[0](val, data))
        ) {
          report(key, check[1]);
        }
      }
    }
  }

  return _.isEmpty(errors) ? false : errors;
};


