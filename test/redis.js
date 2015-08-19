var Redis = require("redis");

var client = Redis.createClient( 6379, "120.24.214.108");

client.on("message",function(channel,message){
	console.log(channel, message);
})

client.subscribe("luson.others")