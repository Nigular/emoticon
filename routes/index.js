var express = require('express');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var archiver = require('archiver');
var multer = require('multer');
var request = require("request");
var fs_ext = require('../utils/fs_ext')();
var router = express.Router();

var zipDir = path.join(path.resolve(__dirname,"../"), "zip");
var uploadDir = path.join(path.resolve(__dirname,"../"), "uploads");
var zipName = "biaoqing.zip";

// 引入数据模块
var mainmodel = require("../database/mainmodel.js");

// 随机命名方法
var chars = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
function generateMixed(n) {
     var res = "";
     for(var i = 0; i < n ; i ++) {
         var id = Math.ceil(Math.random()*35);
         res += chars[id];
     }
     return res;
}

/* GET home page. */
router.get('/', function(req, res, next) {
	mainmodel.find({},function(data){
		console.log(data);
		res.render('index',{ listData: data});
	});
});

/* 管理员登录页 */
router.route("/login").get(function(req,res){
	res.render("login",{title:"用户登录"});  // 渲染login模板
}).post(function(req,res){
	var user = {username:"longer",password:"123456"};
	// 如果用户名和密码一致
	if(req.body.username===user.username && req.body.password === user.password ){
		req.session.user = user;  //登录成功，记录到session里
		res.redirect("/admin");	// 跳转到admin路由
	}else {
		req.session.error='用户名或密码不正确';
	    res.redirect("/login");		// 否则跳转到login路由
	}
});

router.get("/loginout",function(req,res){
	req.session.user = null;  //退出后，清空session里的值
	res.redirect("/");
});

/* 后台页面 */
router.route("/admin").get(function(req,res){
	authentication(req, res);	// 先验证是否存在session
	
	res.render("admin",{title:"管理后台"});  // 渲染login模板
});

/* 录入表情地址  */
router.route("/entering").post(function(req,res){
	var addData={
		emtName:req.body.emtName,
	    emtRoot: req.body.emtRoot,
	    emtCount: req.body.emtCount,
	    imgType: req.body.imgType
	}
	mainmodel.addone(addData,function(data){
		//console.log(data);
		//res.redirect("/home");
		res.send({code:1});
	});
});

function authentication(req, res) {		
    if (!req.session.user) {	// 如果之前session里没有储存过user或者session过期，则不通过判断，返回登陆页	
        return res.redirect('/login');
    }
}

router.get("/downloadOne",function(req,res,next){
	var filepath = req.query.path,
		fReadStream;
	var rootFile = "uploads/";
	var a = filepath.split("/");
	fs.exists(rootFile+filepath,function(exist) {
        if(exist){
            res.set({
                "Content-type":"application/octet-stream",
                "Content-Disposition":"attachment;filename="+encodeURI(a[1])
            });
            fReadStream = fs.createReadStream(rootFile+filepath);
            fReadStream.on("data",(chunk) => res.write(chunk,"binary"));
            fReadStream.on("end",function () {
                res.end();
            });
        }else{
            res.set("Content-type","text/html");
            res.send("file not exist!");
            res.end();
        }
    });
});

router.get("/downloadMore",function(req,res,next){
	var currDir = path.normalize(req.query.dir),
        comefrom = req.query.comefrom,
        fileName = req.query.name,
        currFile = path.join(currDir,fileName),
        fReadStream;
    fs.exists(currFile,function(exist) {
        if(exist){
            res.set({
                "Content-type":"application/octet-stream",
                "Content-Disposition":"attachment;filename="+encodeURI(fileName)
            });
            fReadStream = fs.createReadStream(currFile);
            fReadStream.on("data",(chunk) => res.write(chunk,"binary"));
            fReadStream.on("end",function () {
                res.end();
                //删除生成的压缩文件
                if(comefrom == "archive"){
                    setTimeout(() => fs.unlink(path.join(zipDir,fileName)), 100);
                }
            });
        }else{
            res.set("Content-type","text/html");
            res.send("file not exist!");
            res.end();
        }
    });
});

//获取下载文件的地址
router.post('/download',function(req, res){
	var fileArray = req.body.fileArray;
    
    // 重组数组
    var newArray=fileArray.split("-");
    console.log(newArray[0]);
    if(fileArray.length == 0){
        res.send({"code":"fail", "summary":"no files"});
        return;
    }
    
    //只有一个文件的时候直接走get
    if(newArray.length==1){
    	var a = newArray[0].split("/");
    	var b = a[a.length-1];
    	var c = a[a.length-2];
    	var downloadUrl = "/downloadOne?path="+encodeURIComponent(c+"/"+b);
    	res.send({"code":"s_ok", "url":downloadUrl});
    }else{
    	var fileArrays=[];
    	var uploadPath = "uploads";
    	for(var i=0;i<newArray.length;i++){
    		var x = newArray[i].split("/");
    		var y = x[x.length-2];
    		var z = x[x.length-1];
    		var myPath  = path.resolve(uploadPath,y,z);
    		fileArrays.push(myPath);
    	}
    	
    	//多个文件就压缩后再走get
    	var new_zipName=generateMixed(3)+zipName;
        var output = fs.createWriteStream(path.join("zip",new_zipName));
        var archive = archiver.create('zip', {});
        archive.pipe(output);   //和输出流相接
       
        //打包文件
        for(var i=0;i<fileArrays.length;i++){
			var a = fileArrays[i].split(".");
			var b = a[a.length-1];
			console.log(fileArrays[i]+"%%");
			console.log(b);
			archive.append(fs.createReadStream(fileArrays[i]), { name:generateMixed(5)+"."+b });
		}
		
        archive.on('error', function(err){
            res.send({"code":"failed", "summary":err});
            throw err;
        });
        archive.on('end', function(a){
            //输出下载链接
            var downloadUrl = "/downloadMore?dir="+encodeURIComponent(zipDir)+"&name="+encodeURIComponent(new_zipName)+"&comefrom=archive";
            res.send({"code":"s_ok", "url":downloadUrl});
        });
        archive.finalize();
    }
	
});


//上传文件
var upload = multer({ dest: './uploads/'});
var cpUpload = upload.fields([
    {name: 'file'},
    {name: 'src'}
]);
router.post("/uploadFile",cpUpload, function(req, res, next){
    var files = req.files.file,
        dir = req.body.dir;

    var fsPromise = function(file){
        return new Promise(function(resolved,rejected){
            fs.rename(path.join(uploadDir,file.filename),path.join(dir,file.originalname),function(err){
                if(err){
                    rejected(err);
                }else{
                    resolved();
                }
            });
        });
    }
    Promise.all(files.map(fsPromise))
    .then(function(){
        res.set({
            'Content-Type':'text/html'
        });
        res.send({"code":"s_ok"});
        // res.end();
    })
    .catch(function(err) {
        res.send({"code":"failed", "summary":err});
    });
});



module.exports = router;
