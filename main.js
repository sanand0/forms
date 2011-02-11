var http = require('http');
var _ = require('underscore')._;
var cradle = require('cradle');

var render = require('./render.form.js');
var FDL = require('./sample.fdl.js');

var couch = new(cradle.Connection)('http://sanand.couchone.com', 80);
var db = couch.database('sample');
db.exists(function(err, exists) {
  if (!exists) { db.create(); }
})

var css = '<link rel="stylesheet" type="text/css" href="http://yui.yahooapis.com/combo?3.3.0/build/cssreset/reset-min.css&3.3.0/build/cssfonts/fonts-min.css&3.3.0/build/cssbase/base-min.css">';

http.createServer(function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  if (request.method == 'GET') {
    response.end(css + render.simpleform(FDL.form.sample, { 'text': 'asn' }));
  } else {
    render.parseform(FDL.form.sample, request, function(data) {
      errors = render.validate(FDL.form.sample, data);
      if (!errors) {
        response.write('Saving...<br>');
        db.save(data, function(err, res) {
          response.end(_.template('Response saved <a href="<%= url %>">here</a>. <a href="">Add another</a>', {
            url: 'http://' + couch.host + ':' + couch.port + '/_utils/document.html?' + db.name + '/' + res.id
          }));
        });
      } else {
        response.end(css + render.simpleform(FDL.form.sample, data, errors));
      }
    });
  }
}).listen(8401);

console.log('Server started');
