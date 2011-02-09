// Underscore.js template library
// ------------------------------------------------------------------------------------------------------------------------------------------------------
var _ = this._ = (function(_){

  // Copied from the template section of
  // [underscore.js](http://documentcloud.github.com/underscore/underscore.js)

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(str, data) {
    var c  = _.templateSettings;
    var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
      'with(obj||{}){__p.push(\'' +
      str.replace(/\\/g, '\\\\')
         .replace(/'/g, "\\'")
         .replace(c.interpolate, function(match, code) {
           return "'," + code.replace(/\\'/g, "'") + ",'";
         })
         .replace(c.evaluate || null, function(match, code) {
           return "');" + code.replace(/\\'/g, "'")
                              .replace(/[\r\n\t]/g, ' ') + "__p.push('";
         })
         .replace(/\r/g, '\\r')
         .replace(/\n/g, '\\n')
         .replace(/\t/g, '\\t')
         + "');}return __p.join('');";
    var func = new Function('obj', tmpl);
    return data ? func(data) : func;
  };

  // End of copied section
  return _;
})({});


// Render a form in FDL
// ------------------------------------------------------------------------------------------------------------------------------------------------------
/*
 Principles:
    - Markup is XHTML 4.0, not HTML5
    -

 <form id="" action="" method="post">
  <h2>Section heading</h2>
  <p>help</p>
  <fieldset>
   <dl>
    <dt><label for="">...</label><p>... help ...</p></dt>
    <dd><input type="..."></input>
   </dl>
  </fieldset>
 </form>
*/
this.simpleform = function(form) {
  // Basic templates
  var templates = {
    form_start:     '<form method="post">',
    form_end:       '<button type="submit"><%= (form.actions || {}).submit || "Submit" %></button></form>',
    field_start:    '<dt><label for="<%= field.id %>"><%= field.label %></label><% if (field.help) { print("<p>", field.help, "</p>") } %></dt><dd>',
    field_end:      '</dd>',
    section_start:  '<div class="section" id="<%= field.id %>"><h2><%= field.section %></h2><% if (field.help) { print("<p>", field.help, "</p>") } %><fieldset><dl>',
    section_end:    '</dl></fieldset></div>',

    input:          '<input name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>" value="<%= field.default || "" %>"/>',
    radio:          '<% for (var v in field.values) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", v, "\'", v === field.default ? " checked=\'checked\'" : "", " />", v, "</label>"); } %>',
    checkbox:       '<% for (var v in field.values) { print("<label><input type=\'", field.type, "\' name=\'", field.id, "\' value=\'", v, "\'", field.default.indexOf(v) >= 0 ? " checked=\'checked\'" : "", " />", v, "</label>"); } %>',
    textarea:       '<textarea name="<%= field.id %>" id="<%= field.id %>" type="<%= field.type || "text" %>"><%= field.default || "" %></textarea>',
    select:         '<select name="<%= field.id %>" id="<%= field.id %>"><% for (var v in field.values) { print("<option>", v, "</option>"); } %></select>'
  };

  // t('template-name', data) renders the template
  var t = function(template, data) { return _.template(templates[template], data || {}); };

  // html is an array that holds the output
  var html = [];
  // Sections delimit the form. section_open indicates that we've opened a section
  html.section_open = false;

  html.push(t('form_start', {form:form}));
  for (var i=0, field; field=form.fields[i]; i++) {
    // Fields can be either a input definition or a section definition.
    // If it's an input definition...
    if (field.label) {
      html.push(t('field_start', {field:field}));

      // Pick the right template and use it
      var tmpl = templates[field.type] ? field.type : 'input';
      html.push(t(tmpl, {field:field}));
      html.push(t('field_end', {field:field}));
    }

    // If it's a section definition,
    else if (field.section) {
      if (html.section_open) { html.push(t('section_end')); html.section_open = false; }
      html.push(t('section_start', {field:field}));
      html.section_open = true;
    }
  }

  html.push(t('section_end'));
  html.push(t('form_end', {form:form}));

  return html.join('');
};

// Converts form POST data into a data object
// ------------------------------------------------------------------------------------------------------------------------------------------------------

// Validates form data
// ------------------------------------------------------------------------------------------------------------------------------------------------------
this.validate = function(form, data) {

};
