var http = require("http");
var Class = require("osr-class");
var url = require("url");
var fs = require("fs");
var path = require("path");
var mime = require("./mime").types;
var _expires = require("./expires");
var _gzip = require("./gzip");
var socketio = require("socket.io");
var zlib = require("zlib");
var redis = require("redis");
var formidable = require("formidable");
var sys = require("sys");
var ClusterUI = Class.extends({
	$:function( config ){
		this.name = "ClusterUI";
		this.config = config || {};
		this.mqHost = this.config.host || "localhost";
		this.mqPort = this.config.port || 6379;
		this.mqAuth = this.config.auth;
	},
	run:function( port ){
		port = port || 5210;
		var _this = this;
		this.client = redis.createClient(this.mqPort, this.mqHost);
		this.clientPublish = redis.createClient(this.mqPort, this.mqHost);
		if(this.mqAuth){
			this.client.auth( this.mqAuth );
			this.clientPublish.auth( this.mqAuth );
		}
		this.client.on("message",function( channel, datas ){
			datas = JSON.parse( datas );
			if(!!_this.mastersocket){
				_this.mastersocket.emit(datas.method,datas.result||datas);
			}
		});
		this.client.subscribe("cluster.master");
		this.server = http.createServer(function( req, res ){
			var pathname = url.parse( req.url ).pathname;
			if(pathname.slice(-1) === "/"){
				pathname = pathname + "index.html";
			}
			if("/submitFile" == pathname && req.method == "POST"){
				// console.log(req);
				var form = new formidable.IncomingForm();
				form.uploadDir= __dirname+"/tmp";
				//这里formidable会对upload的对象进行解析和处理  
				form.parse(req, function(err, fields, files) {  
					res.writeHead(200, {'content-type': 'text/plain'});
					res.write(JSON.stringify({ code: 1 }));
					// console.log(fields.myname,files.mycode.path);
					res.end();
				});
				return;
			}
			var realPath = path.join(__dirname+"/assets",path.normalize(pathname.replace(/\.\./g,"")));
			var ext = path.extname(realPath);
			ext = ext ? ext.slice(1) : 'unknown';
			if(ext.match(_expires.fileMatch)){
				var expires = new Date();
				expires.setTime(expires.getTime() + _expires.maxAge * 1000);
				res.setHeader("Expires", expires.toUTCString());
				res.setHeader("Cache-Control", "max-age=" + _expires.maxAge);
			}
			fs.exists( realPath, function( exists ){
				if(!exists){
					res.writeHead(404,{
						'Content-Type':'text/plain'
					});
					res.write("4O4");
					res.end();
				}else{
					fs.stat( realPath, function( err, stat){
						var lastModified = stat.mtime.toUTCString();
						if(req.headers["if-modified-since"] && lastModified == req.headers["if-modified-since"]){
							res.writeHead(304,"Not Modified");
							res.end();
							return;
						}
						res.setHeader("Last-Modified",lastModified);
						var raw = fs.createReadStream(realPath);
						var acceptEncoding = req.headers['accept-encoding'] || "";
						var matched = ext.match(_gzip.match);
						if(matched && acceptEncoding.match(/\bgzip\b/)){
							res.writeHead(200, "Ok", {
								'Content-Encoding': 'gzip'
							});
							raw.pipe(zlib.createGzip()).pipe(res);
						}else if (matched && acceptEncoding.match(/\bdeflate\b/)) {
							res.writeHead(200, "Ok", {
								'Content-Encoding': 'deflate'
							});
							raw.pipe(zlib.createDeflate()).pipe(res);
						}else{
							res.writeHead(200, "Ok");
							raw.pipe(res);
						}
						// res.end();
					});
				}
			});
		});
		
		this.server.listen( port , function(){
			console.log("[-SYS-]\t","Server start at :", port);
		});
		this.io = socketio.listen( this.server );
		this.mastersocket;
		this.io.on("connection",function(socket){
			_this.clientPublish.publish("clustermaster",JSON.stringify({ cmd: "cluster.status", auth: "cavacn"}));
			if(_this.mastersocket && _this.mastersocket != socket){
				_this.mastersocket.disconnect();
			}
			_this.mastersocket = socket;
			socket.on("stop",function( name ){
				var data  = { cmd: "process.kill" , name: name };
				_this.clientPublish.publish("clustermaster",JSON.stringify( data ));
			});
			socket.on("error",function(e){
				console.log(e);
			})
		})
	}
});

module.exports = exports = ClusterUI;