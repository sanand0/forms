var http = require('http');
var _ = require('./node_modules/underscore')._;

var render = require('./render.form.js');
var FDL = require('./sample.fdl.js');

http.createServer(function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  if (request.method == 'GET') {
    response.end(render.simpleform(FDL.form.sample, { 'text': 'asn' }));
  } else {
    render.parseform(FDL.form.sample, request, function(data) {
      errors = render.validate(FDL.form.sample, data);
      if (_.isEmpty(errors)) {
        response.end('Storing in DB: ' + JSON.stringify(data));
      } else {
        response.end(render.simpleform(FDL.form.sample, data, errors));
      }
    });
  }
}).listen(8401);

console.log('Server started');
