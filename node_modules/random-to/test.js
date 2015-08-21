var random = require('./index.js');

var w = random.from0upto(10);
var x = random.from0to(10);
var y = random.from1to(10);
var z = random.from0to(-10);

console.log(w, x, y, z);
