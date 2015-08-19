var UI = require("../");

var ui = new UI({
	host:"120.24.95.74",
	port: 6379,
});

ui.run( 5120 );