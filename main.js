var http = require('http');

var render = require('./render.form.js');
var FDL = require('./sample.fdl.js');


http.createServer(function (request, response) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.end(render.simpleform(FDL.form.sample));
}).listen(8124);

console.log(render.simpleform(FDL.form.sample));
